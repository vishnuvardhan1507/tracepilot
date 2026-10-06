"""Small synchronous Python instrumentation SDK; no provider secrets leave this process."""

import os, uuid, time
from datetime import datetime, timezone
from contextlib import contextmanager
import httpx
from backend.security import redact


class TracePilot:
    def __init__(
        self,
        project="research",
        agent="research-agent",
        version="1.0.0",
        environment="development",
    ):
        self.project, self.agent, self.version, self.environment = (
            project,
            agent,
            version,
            environment,
        )
        self.url = os.getenv("TRACEPILOT_URL", "http://127.0.0.1:8000")
        self.client = httpx.Client(
            headers={"Authorization": "Bearer " + os.environ["TRACEPILOT_API_KEY"]},
            timeout=10,
        )

    def send(self, event):
        payload = {**event, "attributes": redact(event.get("attributes", {}))}
        for attempt in range(3):
            try:
                response = self.client.post(self.url + "/api/ingest", json=payload)
                response.raise_for_status()
                return
            except (httpx.TransportError, httpx.HTTPStatusError):
                if attempt == 2:
                    raise
                time.sleep(0.2 * 2**attempt)

    @contextmanager
    def span(self, name, kind="agent", parent=None, **extra):
        sid = uuid.uuid4().hex
        event = {
            "schema_version": "1",
            "project_id": self.project,
            "trace_id": parent["trace_id"] if parent else uuid.uuid4().hex,
            "span_id": sid,
            "parent_span_id": parent["span_id"] if parent else None,
            "name": name,
            "span_type": kind,
            "agent": self.agent,
            "agent_version": self.version,
            "environment": self.environment,
            "start_time": datetime.now(timezone.utc).isoformat(),
            "status": "running",
            "revision": 1,
            "attributes": {},
            **extra,
        }
        self.send(event)
        try:
            yield event
            event["status"] = "success"
        except KeyboardInterrupt:
            event["status"] = "cancelled"
            raise
        except Exception as error:
            event["status"] = "error"
            event["attributes"]["error"] = str(error)
            raise
        finally:
            event["end_time"] = datetime.now(timezone.utc).isoformat()
            event["revision"] += 1
            self.send(event)
