# Verification record

The application runs locally at http://127.0.0.1:5173 with FastAPI at http://127.0.0.1:8000.

Final validation completed:

- TypeScript + Vite production build: passed.
- Frontend unit tests: 3 passed.
- Backend security/ingestion/aggregation/workflow tests: **10 passed**. Includes tenant isolation, key revocation, idempotency/out-of-order updates, redaction, pricing/aggregation, roles, malformed payloads, filters/export, alert deduplication/acknowledgment/resolution, evaluation/settings persistence, cycles and unavailable evidence.
- Playwright Chromium: **7 scenarios passed** (complete six-test run plus the added cost/evaluation scenario). Covers trace filters/inspection, alert persistence, recoverable errors, responsive navigation, Viewer permissions, ingestion-key creation/revocation, cost grouping and deterministic evaluation inspection.
- Desktop, mobile and dark screenshots captured and visually inspected in `artifacts/`; review prompted typography, dark-status colors, mobile drawer and short-desktop-sidebar refinements. Final screenshots have no page-level horizontal overflow; wide tables scroll deliberately.
- npm audit after dependency updates: 0 known vulnerabilities.
- Python dependency audit of `backend/requirements.txt`: **0 known vulnerabilities** after upgrading Starlette/FastAPI and pytest.
- Python example end-to-end smoke: **passed**. Real local execution produced four revision-2 spans; API detail/aggregation and deterministic evaluation verified. LLM provider activity was explicitly simulated. The test ingestion key was revoked afterward.
- `docker compose config --quiet`: **passed**. No container execution was possible.
- Build output split into application, chart and query/table chunks; no oversized-chunk warning remains.

One test-only deprecation warning remains: Starlette recommends `httpx2` for its TestClient instead of `httpx`. It does not affect the running application or test results. No browser page errors were observed during the instrumented trace workflow.

Environment limitation: Docker CLI is installed, but Docker Desktop's Linux daemon is not running. The preview and automated backend tests use SQLite. PostgreSQL Compose execution and optional real-provider integration remain unverified.
