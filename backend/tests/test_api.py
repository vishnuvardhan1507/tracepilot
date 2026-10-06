import os

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["ADMIN_PASSWORD"] = "test-password-12345"
import pytest
from datetime import timedelta
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from backend.db import Base, Session, Record, Span, put
from backend.main import app
from backend.bootstrap import bootstrap
from backend.security import passwords, utc


@pytest.fixture(autouse=True)
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Session.configure(bind=engine)
    Base.metadata.create_all(engine)
    bootstrap()
    with Session() as db:
        put(
            db,
            "other",
            "project",
            "project:other",
            {"name": "Other", "retention_days": 30, "notifications": False},
        )
        for role in ["Viewer", "Developer"]:
            put(
                db,
                "_auth",
                "user",
                "user:" + role.lower() + "@test.local",
                {
                    "email": role.lower() + "@test.local",
                    "password": passwords.hash("test-password-12345"),
                    "memberships": {"research": role},
                },
            )
        db.commit()
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def client():
    with TestClient(app) as c:
        assert (
            c.post(
                "/api/login",
                json={
                    "email": "admin@tracepilot.local",
                    "password": "test-password-12345",
                },
            ).status_code
            == 200
        )
        yield c


def key(client):
    return client.post("/api/projects/research/keys").json()["key"]


def event(**overrides):
    now = utc()
    return {
        "project_id": "research",
        "trace_id": "trace-1",
        "span_id": "span-1",
        "name": "Research",
        "span_type": "agent",
        "agent": "research-agent",
        "start_time": (now - timedelta(seconds=2)).isoformat(),
        "end_time": now.isoformat(),
        "status": "success",
        **overrides,
    }


def ingest(client, k, e):
    return client.post("/api/ingest", headers={"Authorization": "Bearer " + k}, json=e)


def test_auth_and_tenant_isolation(client):
    for endpoint in [
        "overview",
        "traces",
        "export",
        "stream",
        "settings",
        "keys",
        "agents",
        "evaluations",
        "alerts",
    ]:
        assert client.get("/api/projects/other/" + endpoint).status_code == 403
    c = TestClient(app)
    assert c.get("/api/projects/research/traces").status_code == 401
    assert ingest(client, key(client), event(project_id="other")).status_code == 401


def test_revocation(client):
    k = client.post("/api/projects/research/keys").json()
    assert ingest(client, k["key"], event()).status_code == 200
    assert client.delete("/api/projects/research/keys/" + k["id"]).status_code == 200
    assert ingest(client, k["key"], event(span_id="new")).status_code == 401
    assert "key" not in client.get("/api/projects/research/keys").json()[0]


def test_idempotency_out_of_order_redaction(client):
    k = key(client)
    e = event(
        attributes={
            "prompt": "private text",
            "nested": {"api_key": "secret"},
            "error": "Contact private@example.com Bearer abcdef",
        }
    )
    assert ingest(client, k, e).json()["duplicate"] is False
    assert ingest(client, k, e).json()["duplicate"] is True
    assert ingest(client, k, {**e, "revision": 3, "status": "error"}).status_code == 200
    assert ingest(client, k, {**e, "revision": 2}).json()["duplicate"] is True
    spans = client.get("/api/projects/research/traces/trace-1").json()["spans"]
    assert len(spans) == 1 and spans[0]["status"] == "error"
    assert spans[0]["attributes"]["prompt"] == "[REDACTED]"
    assert spans[0]["attributes"]["nested"]["api_key"] == "[REDACTED]"
    assert "private@example.com" not in spans[0]["attributes"]["error"]


def test_cost_and_aggregation_no_double_count(client):
    k = key(client)
    ingest(client, k, event())
    ingest(
        client,
        k,
        event(
            span_id="child",
            parent_span_id="span-1",
            span_type="llm",
            model="local/research-v1",
            input_tokens=1000,
            output_tokens=200,
        ),
    )
    data = client.get("/api/projects/research/overview?source=telemetry").json()
    assert data["metrics"]["runs"] == 1
    assert data["metrics"]["tokens"] == 1200
    assert data["metrics"]["cost"] == pytest.approx(0.0027)
    assert data["metrics"]["success_rate"] == 100
    ingest(
        client,
        k,
        event(
            span_id="unknown",
            parent_span_id="span-1",
            span_type="llm",
            model="unknown",
            input_tokens=100,
            output_tokens=100,
        ),
    )
    assert (
        client.get("/api/projects/research/overview").json()["metrics"]["cost"] is None
    )


def test_permissions(client):
    client.post("/api/logout")
    client.post(
        "/api/login",
        json={"email": "viewer@test.local", "password": "test-password-12345"},
    )
    assert client.get("/api/projects/research/traces").status_code == 200
    assert client.post("/api/projects/research/keys").status_code == 403
    assert (
        client.post(
            "/api/projects/research/rules",
            json={"name": "Test", "metric": "error_rate", "threshold": 5},
        ).status_code
        == 403
    )
    assert (
        client.put(
            "/api/projects/research/settings", json={"name": "Bad", "retention_days": 7}
        ).status_code
        == 403
    )
    assert client.post("/api/projects/research/evaluations/run").status_code == 403


def test_invalid_events_and_filters(client):
    k = key(client)
    assert ingest(client, k, event(start_time="2025-01-01T12:00:00")).status_code == 422
    assert ingest(client, k, event(input_tokens=-1)).status_code == 422
    assert client.get("/api/projects/research/traces?page=0").status_code == 422
    assert (
        client.get("/api/projects/research/traces?min_duration=bad").status_code == 422
    )
    assert (
        client.post(
            "/api/projects/research/keys", headers={"origin": "https://evil.test"}
        ).status_code
        == 403
    )


def test_filters_export_source_and_search(client):
    k = key(client)
    ingest(client, k, event())
    ingest(client, k, event(trace_id="sample", span_id="sample", source="sample"))
    assert client.get("/api/projects/research/traces").json()["total"] == 1
    assert (
        client.get("/api/projects/research/traces?source=sample").json()["total"] == 1
    )
    assert client.get("/api/projects/research/traces?status=error").json()["total"] == 0
    assert "trace-1" in client.get("/api/projects/research/export").text
    assert "sample" not in client.get("/api/projects/research/export").text
    assert client.get("/api/projects/research/search?q=research").json()["agents"] == [
        "research-agent"
    ]


def test_alert_dedup_ack_resolution(client):
    k = key(client)
    ingest(client, k, event(status="error"))
    rule = {
        "name": "Errors",
        "metric": "error_rate",
        "threshold": 5,
        "min_samples": 1,
        "source": "telemetry",
    }
    created = client.post("/api/projects/research/rules", json=rule).json()
    a = client.get("/api/projects/research/alerts").json()["alert"]
    assert len(a) == 1
    assert len(client.get("/api/projects/research/alerts").json()["alert"]) == 1
    client.post("/api/projects/research/alerts/" + a[0]["id"] + "/acknowledge")
    assert (
        client.get("/api/projects/research/alerts").json()["alert"][0]["status"]
        == "acknowledged"
    )
    client.put(
        "/api/projects/research/rules/" + created["id"], json={**rule, "enabled": False}
    )
    assert (
        client.get("/api/projects/research/alerts").json()["alert"][0]["status"]
        == "resolved"
    )


def test_evaluations_and_settings_persistence(client):
    k = key(client)
    ingest(
        client,
        k,
        event(
            attributes={
                "citation_count": 2,
                "schema_valid": True,
                "tools_completed": True,
            }
        ),
    )
    result = client.post("/api/projects/research/evaluations/run").json()
    assert result["cases"] == 1
    checks = client.get("/api/projects/research/evaluations").json()["runs"][0][
        "checks"
    ]
    assert all(c["passed"] for c in checks)
    assert (
        client.put(
            "/api/projects/research/settings",
            json={"name": "Updated", "retention_days": 14, "notifications": False},
        ).status_code
        == 200
    )
    assert client.get("/api/projects/research/settings").json()["name"] == "Updated"


def test_cycles_context_and_unavailable_evidence(client):
    k = key(client)
    assert (
        ingest(client, k, event(span_id="child", parent_span_id="parent")).status_code
        == 200
    )
    assert (
        ingest(client, k, event(span_id="parent", parent_span_id="child")).status_code
        == 422
    )
    assert (
        ingest(client, k, event(span_id="different", source="sample")).status_code
        == 409
    )
    assert ingest(client, k, event(span_id="root")).status_code == 200
    client.post("/api/projects/research/evaluations/run")
    case = client.get("/api/projects/research/evaluations").json()["runs"][0]
    assert case["checks"][0]["passed"] is None
