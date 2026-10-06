from collections import defaultdict
from datetime import timedelta
from backend.db import Span, records
from backend.security import utc


def percentile(values, p):
    if not values:
        return None
    values = sorted(values)
    return values[round((len(values) - 1) * p)]


def span_cost(d, prices):
    if d["span_type"] != "llm":
        return None
    price = next(
        (
            p.data
            for p in sorted(
                prices, key=lambda p: p.data["effective_from"], reverse=True
            )
            if p.data["model"] == d.get("model")
            and p.data["effective_from"] <= d["start_time"]
        ),
        None,
    )
    if not price or d.get("input_tokens") is None or d.get("output_tokens") is None:
        return None
    return (
        d["input_tokens"] * price["input_per_million"]
        + d["output_tokens"] * price["output_per_million"]
    ) / 1_000_000


def trace_rows(db, project):
    groups = defaultdict(list)
    prices = records(db, project, "price")
    for s in db.query(Span).filter_by(project=project):
        groups[s.trace_id].append(s.data)
    result = []
    for tid, spans in groups.items():
        roots = [s for s in spans if s["parent_span_id"] is None]
        root = min(roots or spans, key=lambda s: s["start_time"])
        llms = [s for s in spans if s["span_type"] == "llm"]
        costs = [span_cost(s, prices) for s in llms]
        result.append(
            {
                **root,
                "trace_id": tid,
                "duration_ms": root.get("duration_ms"),
                "span_count": len(spans),
                "model": next((s.get("model") for s in llms), None),
                "models": list({s["model"] for s in llms if s.get("model")}),
                "tokens": sum(
                    (s.get("input_tokens") or 0) + (s.get("output_tokens") or 0)
                    for s in llms
                ),
                "cost": (
                    sum(costs) if costs and all(c is not None for c in costs) else None
                ),
                "incomplete": not roots or root["status"] == "running",
            }
        )
    return result


def filter_rows(rows, params):
    hours = min(max(float(params.get("hours", 24)), 1 / 60), 8760)
    minimum = float(params.get("min_duration") or 0)
    maximum = float(params.get("max_duration") or float("inf"))
    since = params.get("since") or (utc() - timedelta(hours=hours)).isoformat()
    until = params.get("until") or utc().isoformat()
    out = []
    for r in rows:
        if not since <= r["start_time"] <= until:
            continue
        if r["source"] != params.get("source", "telemetry"):
            continue
        if any(
            params.get(k) not in (None, "", "all", r.get(k))
            for k in ["environment", "agent", "status", "agent_version"]
        ):
            continue
        if params.get("model") and params["model"] not in r["models"]:
            continue
        if params.get("tag") and params["tag"] not in r["tags"]:
            continue
        if (r.get("duration_ms") or 0) < minimum:
            continue
        if (r.get("duration_ms") or 0) >= maximum:
            continue
        if (
            params.get("q", "").lower()
            not in (
                r["trace_id"]
                + " "
                + r["name"]
                + " "
                + r["agent"]
                + " "
                + " ".join(r["tags"])
            ).lower()
        ):
            continue
        out.append(r)
    return out


def metrics(rows):
    duration = [r["duration_ms"] for r in rows if r["duration_ms"] is not None]
    completed = [r for r in rows if r["status"] != "running"]
    return {
        "runs": len(rows),
        "success_rate": (
            100 * sum(r["status"] == "success" for r in completed) / len(completed)
            if completed
            else None
        ),
        "p50": percentile(duration, 0.5),
        "p95": percentile(duration, 0.95),
        "tokens": sum(r["tokens"] for r in rows),
        "cost": (
            sum(r["cost"] for r in rows if r["cost"] is not None)
            if any(r["cost"] is not None for r in rows)
            else None
        ),
        "unknown_cost_runs": sum(r["cost"] is None for r in rows),
    }


def overview(db, project, params):
    all_rows = trace_rows(db, project)
    rows = filter_rows(all_rows, params)
    hours = float(params.get("hours", 24))
    prior = {
        **dict(params),
        "since": (utc() - timedelta(hours=hours * 2)).isoformat(),
        "until": (utc() - timedelta(hours=hours)).isoformat(),
    }
    buckets = defaultdict(lambda: {"runs": 0, "errors": 0, "cost": 0})
    for r in rows:
        key = (
            r["start_time"][:13] + ":00:00+00:00"
            if hours <= 48
            else r["start_time"][:10] + "T00:00:00+00:00"
        )
        buckets[key]["runs"] += 1
        buckets[key]["errors"] += r["status"] == "error"
        buckets[key]["cost"] += r["cost"] or 0
    costs = defaultdict(lambda: {"cost": 0, "tokens": 0, "calls": 0, "unknown": 0})
    ids = {r["trace_id"] for r in rows}
    prices = records(db, project, "price")
    by = params.get("group_by", "model")
    for s in db.query(Span).filter_by(project=project):
        d = s.data
        if s.trace_id not in ids or d["span_type"] != "llm":
            continue
        name = d["start_time"][:10] if by == "day" else d.get(by) or "Unknown"
        c = span_cost(d, prices)
        costs[name]["cost"] += c or 0
        costs[name]["unknown"] += c is None
        costs[name]["tokens"] += (d.get("input_tokens") or 0) + (
            d.get("output_tokens") or 0
        )
        costs[name]["calls"] += 1
    evaluations = [
        e.data
        for e in records(db, project, "evaluation")
        if e.data.get("trace_id") in ids
    ]
    checks = [c for e in evaluations for c in e["checks"] if c["passed"] is not None]
    return {
        "metrics": metrics(rows),
        "previous": metrics(filter_rows(all_rows, prior)),
        "series": [{"time": k, **v} for k, v in sorted(buckets.items())],
        "costs": [
            {"name": k, **v, "cost": v["cost"] if not v["unknown"] else None}
            for k, v in costs.items()
        ],
        "distribution": [
            {
                "name": label,
                "count": sum(
                    low <= (r["duration_ms"] or 0) < high
                    for r in rows
                    if r["duration_ms"] is not None
                ),
            }
            for label, low, high in [
                ("< 1s", 0, 1000),
                ("1–2s", 1000, 2000),
                ("2–5s", 2000, 5000),
                ("5–10s", 5000, 10000),
                ("10s+", 10000, float("inf")),
            ]
        ],
        "recent": sorted(rows, key=lambda r: r["start_time"], reverse=True)[:6],
        "failures": sorted(
            [r for r in rows if r["status"] == "error"],
            key=lambda r: r["start_time"],
            reverse=True,
        )[:5],
        "evaluation_rate": (
            100 * sum(c["passed"] for c in checks) / len(checks) if checks else None
        ),
    }
