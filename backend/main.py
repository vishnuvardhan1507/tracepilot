import asyncio, csv, io, json, os, secrets
from datetime import timedelta, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse, Response
from sqlalchemy.exc import IntegrityError
from backend.db import Base, engine, Session, Record, Span, records, put
from backend.schemas import Event, Login, Rule, Settings, Member
from backend.security import (
    authorize,
    identity,
    ingestion_auth,
    digest,
    token,
    utc,
    passwords,
    redact,
)
from backend.analytics import trace_rows, filter_rows, overview, percentile, span_cost


def evaluate_alerts(db, project):
    rows = trace_rows(db, project)
    for rule in records(db, project, "rule"):
        d = rule.data
        selected = filter_rows(
            rows,
            {
                "hours": d["lookback_minutes"] / 60,
                "source": d["source"],
                "environment": d["environment"],
            },
        )
        values = [r["duration_ms"] for r in selected if r["duration_ms"] is not None]
        value = {
            "error_rate": (
                100 * sum(r["status"] == "error" for r in selected) / len(selected)
                if selected
                else 0
            ),
            "p95_latency": percentile(values, 0.95) or 0,
            "budget": sum(r["cost"] or 0 for r in selected),
        }[d["metric"]]
        firing = (
            d["enabled"]
            and len(selected) >= d["min_samples"]
            and value > d["threshold"]
        )
        current = next(
            (
                a
                for a in records(db, project, "alert")
                if a.data["rule_id"] == rule.id and a.data["status"] != "resolved"
            ),
            None,
        )
        if firing and not current:
            put(
                db,
                project,
                "alert",
                "alert:" + token(),
                {
                    "rule_id": rule.id,
                    "name": d["name"],
                    "metric": d["metric"],
                    "value": value,
                    "threshold": d["threshold"],
                    "status": "open",
                    "created_at": utc().isoformat(),
                    "source": d["source"],
                    "environment": d["environment"],
                },
            )
        if current and not firing:
            current.data = {
                **current.data,
                "status": "resolved",
                "resolved_at": utc().isoformat(),
            }


def retention(db):
    for p in db.query(Record).filter_by(kind="project"):
        cutoff = (utc() - timedelta(days=p.data.get("retention_days", 30))).isoformat()
        db.query(Span).filter(Span.project == p.project, Span.start < cutoff).delete()


async def maintenance():
    while True:
        await asyncio.sleep(30)
        with Session() as db:
            retention(db)
            for p in db.query(Record).filter_by(kind="project"):
                evaluate_alerts(db, p.project)
            db.commit()


@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(maintenance())
    yield
    task.cancel()


app = FastAPI(
    title="TracePilot API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)


@app.middleware("http")
async def guard(request, call_next):
    if (
        request.method not in ("GET", "HEAD", "OPTIONS")
        and request.url.path != "/api/ingest"
    ):
        origin = request.headers.get("origin")
        allowed = os.getenv("APP_ORIGIN", "http://127.0.0.1:5173").split(",")
        if origin and origin not in allowed:
            return JSONResponse({"detail": "Origin not allowed"}, 403)
    if int(request.headers.get("content-length", "0")) > 1_000_000:
        return JSONResponse({"detail": "Payload too large"}, 413)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/login")
def login(body: Login):
    with Session() as db:
        user = db.get(Record, "user:" + body.email.lower())
        if not user or not passwords.verify(body.password, user.data["password"]):
            raise HTTPException(401, "Incorrect email or password")
        raw = token()
        put(
            db,
            "_auth",
            "session",
            "session:" + digest(raw),
            {"user": user.id, "expires": (utc() + timedelta(hours=12)).timestamp()},
        )
        db.commit()
        res = JSONResponse({"ok": True})
        res.set_cookie(
            "tracepilot_session",
            raw,
            httponly=True,
            samesite="strict",
            secure=os.getenv("COOKIE_SECURE", "false") == "true",
            max_age=43200,
            path="/",
        )
        return res


@app.post("/api/logout")
def logout(request: Request):
    with Session() as db:
        row = db.get(
            Record, "session:" + digest(request.cookies.get("tracepilot_session", ""))
        )
        if row:
            db.delete(row)
            db.commit()
    res = JSONResponse({"ok": True})
    res.delete_cookie("tracepilot_session")
    return res


@app.get("/api/me")
def me(request: Request):
    u = identity(request)
    with Session() as db:
        return {
            "email": u["email"],
            "projects": [
                {"id": p, "role": role, **db.get(Record, "project:" + p).data}
                for p, role in u["memberships"].items()
                if db.get(Record, "project:" + p)
            ],
        }


@app.post("/api/ingest")
def ingest(event: Event, request: Request):
    with Session() as db:
        ingestion_auth(request, event.project_id, db)
        data = event.model_dump(mode="json")
        data["start_time"] = event.start_time.astimezone(timezone.utc).isoformat()
        data["end_time"] = (
            event.end_time.astimezone(timezone.utc).isoformat()
            if event.end_time
            else None
        )
        data["duration_ms"] = (
            (event.end_time - event.start_time).total_seconds() * 1000
            if event.end_time
            else None
        )
        data["attributes"] = redact(data["attributes"])
        data["name"] = redact(data["name"])
        data["tags"] = redact(data["tags"])
        key = event.project_id + ":" + event.span_id
        existing = db.get(Span, key)
        if existing and existing.trace_id != event.trace_id:
            raise HTTPException(409, "Span ID belongs to another trace")
        if existing and existing.parent_span_id != event.parent_span_id:
            raise HTTPException(409, "Parent span is immutable")
        related = (
            db.query(Span)
            .filter_by(project=event.project_id, trace_id=event.trace_id)
            .all()
        )
        for other in related:
            if any(
                other.data[k] != data[k]
                for k in ["agent", "agent_version", "environment", "source"]
            ):
                raise HTTPException(409, "Trace context is immutable across spans")
        parents = {s.span_id: s.parent_span_id for s in related}
        parents[event.span_id] = event.parent_span_id
        cursor = event.parent_span_id
        seen = {event.span_id}
        while cursor:
            if cursor in seen:
                raise HTTPException(422, "Span cycle detected")
            seen.add(cursor)
            cursor = parents.get(cursor)
        if existing and existing.revision >= event.revision:
            return {"accepted": True, "duplicate": True}
        if existing:
            existing.data = data
            existing.revision = event.revision
            existing.start = data["start_time"]
        else:
            db.add(
                Span(
                    id=key,
                    project=event.project_id,
                    trace_id=event.trace_id,
                    span_id=event.span_id,
                    parent_span_id=event.parent_span_id,
                    start=data["start_time"],
                    revision=event.revision,
                    data=data,
                )
            )
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "Concurrent event; retry with same revision")
        return {"accepted": True, "duplicate": False}


def selected(request, project, db):
    try:
        return filter_rows(trace_rows(db, project), request.query_params)
    except (ValueError, TypeError):
        raise HTTPException(422, "Invalid numeric filter")


@app.get("/api/projects/{project}/overview")
def get_overview(project: str, request: Request):
    authorize(request, project)
    with Session() as db:
        try:
            return overview(db, project, request.query_params)
        except ValueError:
            raise HTTPException(422, "Invalid filter")


@app.get("/api/projects/{project}/traces")
def traces(
    project: str,
    request: Request,
    page: int = 1,
    page_size: int = 15,
    sort: str = "start_time",
    order: str = "desc",
):
    authorize(request, project)
    if (
        page < 1
        or not 1 <= page_size <= 100
        or sort
        not in ("start_time", "duration_ms", "cost", "tokens", "agent", "status")
    ):
        raise HTTPException(422, "Invalid pagination or sort")
    with Session() as db:
        rows = selected(request, project, db)
        rows.sort(
            key=lambda r: (r.get(sort) is not None, r.get(sort) or 0),
            reverse=order == "desc",
        )
        return {
            "items": rows[(page - 1) * page_size : page * page_size],
            "total": len(rows),
        }


@app.get("/api/projects/{project}/export")
def export(project: str, request: Request):
    authorize(request, project)
    with Session() as db:
        rows = selected(request, project, db)
        stream = io.StringIO()
        writer = csv.writer(stream)
        fields = [
            "trace_id",
            "agent",
            "environment",
            "status",
            "start_time",
            "duration_ms",
            "tokens",
            "cost",
            "source",
        ]
        writer.writerow(fields)
        for row in rows:
            writer.writerow(
                [
                    (
                        ("'" + str(row.get(k)))
                        if str(row.get(k, "")).startswith(("=", "+", "-", "@"))
                        else row.get(k)
                    )
                    for k in fields
                ]
            )
        return Response(
            stream.getvalue(),
            media_type="text/csv",
            headers={
                "Content-Disposition": 'attachment; filename="tracepilot-traces.csv"'
            },
        )


@app.get("/api/projects/{project}/traces/{trace_id}")
def trace(project: str, trace_id: str, request: Request):
    authorize(request, project)
    with Session() as db:
        spans = [
            s.data for s in db.query(Span).filter_by(project=project, trace_id=trace_id)
        ]
        if not spans:
            raise HTTPException(404, "Trace not found")
        prices = records(db, project, "price")
        return {
            "spans": sorted(
                [{**s, "estimated_cost": span_cost(s, prices)} for s in spans],
                key=lambda s: s["start_time"],
            )
        }


@app.get("/api/projects/{project}/agents")
def agents(project: str, request: Request):
    authorize(request, project)
    from backend.analytics import metrics

    with Session() as db:
        rows = selected(request, project, db)
        return [
            {
                "name": name,
                "versions": [
                    {
                        "version": version,
                        **metrics(
                            [
                                r
                                for r in rows
                                if r["agent"] == name and r["agent_version"] == version
                            ]
                        ),
                    }
                    for version in sorted(
                        {r["agent_version"] for r in rows if r["agent"] == name}
                    )
                ],
                **metrics([r for r in rows if r["agent"] == name]),
            }
            for name in sorted({r["agent"] for r in rows})
        ]


@app.get("/api/projects/{project}/search")
def search(project: str, request: Request, q: str = ""):
    authorize(request, project)
    with Session() as db:
        rows = selected(request, project, db)
        return {
            "traces": sorted(rows, key=lambda r: r["start_time"], reverse=True)[:8],
            "agents": sorted({r["agent"] for r in rows})[:8],
        }


@app.get("/api/projects/{project}/stream")
async def stream(project: str, request: Request):
    authorize(request, project)

    async def events():
        while not await request.is_disconnected():
            try:
                authorize(request, project)
            except HTTPException:
                yield "event: expired\ndata: {}\n\n"
                break
            yield "event: refresh\ndata: {}\nretry: 5000\n\n"
            await asyncio.sleep(10)

    return StreamingResponse(
        events(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"}
    )


@app.get("/api/projects/{project}/settings")
def settings(project: str, request: Request):
    authorize(request, project)
    with Session() as db:
        return db.get(Record, "project:" + project).data


@app.put("/api/projects/{project}/settings")
def save_settings(project: str, body: Settings, request: Request):
    authorize(request, project, admin=True)
    with Session() as db:
        put(db, project, "project", "project:" + project, body.model_dump())
        retention(db)
        db.commit()
        return body


@app.get("/api/projects/{project}/members")
def members(project: str, request: Request):
    authorize(request, project, admin=True)
    with Session() as db:
        return [
            {"email": r.data["email"], "role": r.data["memberships"][project]}
            for r in db.query(Record).filter_by(kind="user")
            if project in r.data["memberships"]
        ]


@app.post("/api/projects/{project}/members")
def add_member(project: str, body: Member, request: Request):
    authorize(request, project, admin=True)
    with Session() as db:
        key = "user:" + body.email.lower()
        if db.get(Record, key):
            raise HTTPException(
                409, "User already exists; cross-project invitations are not supported"
            )
        put(
            db,
            "_auth",
            "user",
            key,
            {
                "email": body.email.lower(),
                "password": passwords.hash(body.password),
                "memberships": {project: body.role},
            },
        )
        db.commit()
        return {"ok": True}


@app.get("/api/projects/{project}/keys")
def keys(project: str, request: Request):
    authorize(request, project, admin=True)
    with Session() as db:
        return [{"id": k.id, **k.data} for k in records(db, project, "key")]


@app.post("/api/projects/{project}/keys")
def new_key(project: str, request: Request):
    authorize(request, project, admin=True)
    with Session() as db:
        raw = "tp_" + token()
        row = put(
            db,
            project,
            "key",
            "key:" + digest(raw),
            {"prefix": raw[:9], "created_at": utc().isoformat(), "revoked": False},
        )
        db.commit()
        return {"key": raw, "id": row.id}


@app.delete("/api/projects/{project}/keys/{key_id}")
def revoke(project: str, key_id: str, request: Request):
    authorize(request, project, admin=True)
    with Session() as db:
        row = db.get(Record, key_id)
        if not row or row.project != project or row.kind != "key":
            raise HTTPException(404, "Key not found")
        row.data = {**row.data, "revoked": True}
        db.commit()
        return {"ok": True}


@app.get("/api/projects/{project}/alerts")
def alerts(project: str, request: Request):
    authorize(request, project)
    with Session() as db:
        evaluate_alerts(db, project)
        db.commit()
        source = request.query_params.get("source", "telemetry")
        env = request.query_params.get("environment", "all")
        return {
            kind: [
                {"id": r.id, **r.data}
                for r in records(db, project, kind)
                if r.data.get("source") == source
                and (env == "all" or r.data.get("environment") in ("all", env))
            ]
            for kind in ["rule", "alert"]
        }


@app.post("/api/projects/{project}/rules")
def save_rule(project: str, body: Rule, request: Request):
    authorize(request, project, write=True)
    with Session() as db:
        key = "rule:" + token()
        put(db, project, "rule", key, body.model_dump())
        evaluate_alerts(db, project)
        db.commit()
        return {"id": key}


@app.put("/api/projects/{project}/rules/{rule_id}")
def edit_rule(project: str, rule_id: str, body: Rule, request: Request):
    authorize(request, project, write=True)
    with Session() as db:
        row = db.get(Record, rule_id)
        if not row or row.project != project or row.kind != "rule":
            raise HTTPException(404, "Rule not found")
        row.data = body.model_dump()
        evaluate_alerts(db, project)
        db.commit()
        return {"ok": True}


@app.post("/api/projects/{project}/alerts/{alert_id}/acknowledge")
def acknowledge(project: str, alert_id: str, request: Request):
    authorize(request, project, write=True)
    with Session() as db:
        row = db.get(Record, alert_id)
        if not row or row.project != project or row.kind != "alert":
            raise HTTPException(404, "Alert not found")
        if row.data["status"] == "open":
            row.data = {**row.data, "status": "acknowledged"}
        db.commit()
        return {"ok": True}


@app.get("/api/projects/{project}/prices")
def prices(project: str, request: Request):
    authorize(request, project)
    with Session() as db:
        return [r.data for r in records(db, project, "price")]


@app.get("/api/projects/{project}/evaluations")
def evaluations(project: str, request: Request):
    authorize(request, project)
    with Session() as db:
        ids = {r["trace_id"] for r in selected(request, project, db)}
        return {
            "datasets": [
                {"id": r.id, **r.data} for r in records(db, project, "dataset")
            ],
            "runs": [
                {"id": r.id, **r.data}
                for r in records(db, project, "evaluation")
                if r.data["trace_id"] in ids
            ],
        }


@app.post("/api/projects/{project}/evaluations/run")
def run_evaluations(project: str, request: Request):
    authorize(request, project, write=True)
    with Session() as db:
        rows = selected(request, project, db)
        run_id = token()
        count = 0
        for row in rows:
            if row["status"] == "running":
                continue
            a = row["attributes"]
            checks = [
                {
                    "name": "Required citations",
                    "passed": (
                        a["citation_count"] > 0
                        if isinstance(a.get("citation_count"), int)
                        else None
                    ),
                },
                {
                    "name": "Output schema",
                    "passed": (
                        a["schema_valid"]
                        if isinstance(a.get("schema_valid"), bool)
                        else None
                    ),
                },
                {
                    "name": "Tool completion",
                    "passed": (
                        a["tools_completed"]
                        if isinstance(a.get("tools_completed"), bool)
                        else None
                    ),
                },
                {"name": "Latency < 5s", "passed": row["duration_ms"] < 5000},
            ]
            put(
                db,
                project,
                "evaluation",
                "eval:" + token(),
                {
                    "run_id": run_id,
                    "dataset": "research-quality-v1",
                    "version": 1,
                    "trace_id": row["trace_id"],
                    "agent": row["agent"],
                    "agent_version": row["agent_version"],
                    "created_at": utc().isoformat(),
                    "method": "Deterministic · instrumentation assertions",
                    "checks": checks,
                },
            )
            count += 1
        db.commit()
        return {"cases": count, "run_id": run_id}
