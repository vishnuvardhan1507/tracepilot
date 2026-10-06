"""Optional, deterministic sample fixture. Separate from ingested telemetry."""

import hashlib
from datetime import timedelta
from backend.db import Session, Span, Record, put
from backend.security import utc


def seed():
    now = utc().replace(minute=0, second=0, microsecond=0)
    agents = ["research-agent", "support-copilot", "document-analyst", "code-reviewer"]
    with Session() as db:
        if not db.get(Record, "project:research"):
            raise SystemExit("Run bootstrap first")
        for i in range(240):
            trace = "sample-" + hashlib.sha256(str(i).encode()).hexdigest()[:20]
            start = now - timedelta(minutes=i * 11 + 2)
            duration = 850 + (i * 137) % 7100
            status = (
                "error" if i % 17 == 0 else ("cancelled" if i % 67 == 0 else "success")
            )
            agent = agents[i % 4]
            root = {
                "schema_version": "1",
                "project_id": "research",
                "trace_id": trace,
                "span_id": trace + "-root",
                "parent_span_id": None,
                "name": (
                    "Research synthesis"
                    if i % 4 == 0
                    else [
                        "",
                        "Resolve support request",
                        "Analyze document",
                        "Review pull request",
                    ][i % 4]
                ),
                "span_type": "agent",
                "agent": agent,
                "agent_version": "1.2.0" if i % 5 else "1.1.0",
                "environment": "production" if i % 6 else "staging",
                "start_time": start.isoformat(),
                "end_time": (start + timedelta(milliseconds=duration)).isoformat(),
                "status": status,
                "revision": 1,
                "model": None,
                "provider": None,
                "input_tokens": None,
                "output_tokens": None,
                "attributes": {
                    "simulated": True,
                    "citation_count": 3 if i % 13 else 0,
                    "schema_valid": i % 23 != 0,
                    "tools_completed": status == "success",
                    "error": (
                        "Upstream timeout: retrieval exceeded deadline"
                        if status == "error"
                        else None
                    ),
                    "input": "[REDACTED]",
                    "output": "[REDACTED]",
                },
                "tags": ["research", "sample"],
                "source": "sample",
                "duration_ms": duration,
            }
            for j, (kind, name, offset, fraction) in enumerate(
                [
                    ("agent", root["name"], 0, 1),
                    ("retrieval", "Search knowledge base", 0.04, 0.2),
                    ("tool", "Fetch references", 0.26, 0.18),
                    ("llm", "Synthesize response", 0.46, 0.5),
                ]
            ):
                sid = trace + "-root" if j == 0 else trace + "-" + str(j)
                begin = start + timedelta(milliseconds=duration * offset)
                d = {
                    **root,
                    "span_id": sid,
                    "parent_span_id": None if j == 0 else trace + "-root",
                    "span_type": kind,
                    "name": name,
                    "start_time": begin.isoformat(),
                    "end_time": (
                        begin + timedelta(milliseconds=duration * fraction)
                    ).isoformat(),
                    "duration_ms": round(duration * fraction, 1),
                }
                if kind == "llm":
                    d.update(
                        model="local/research-v1",
                        provider="Local simulator",
                        input_tokens=400 + i * 19,
                        output_tokens=120 + i * 3,
                    )
                key = "research:" + sid
                old = db.get(Span, key)
                if old:
                    old.data = d
                    old.start = d["start_time"]
                else:
                    db.add(
                        Span(
                            id=key,
                            project="research",
                            trace_id=trace,
                            span_id=sid,
                            parent_span_id=d["parent_span_id"],
                            start=d["start_time"],
                            revision=1,
                            data=d,
                        )
                    )
        put(
            db,
            "research",
            "rule",
            "rule:sample-error",
            {
                "name": "Research error rate",
                "metric": "error_rate",
                "threshold": 3,
                "lookback_minutes": 1440,
                "min_samples": 5,
                "environment": "all",
                "source": "sample",
                "enabled": True,
            },
        )
        db.commit()
    print("240 deterministic sample traces loaded. Live telemetry is unchanged.")


if __name__ == "__main__":
    seed()
