import hashlib, re, secrets
from datetime import datetime, timezone
from fastapi import HTTPException, Request
from pwdlib import PasswordHash
from backend.db import Session, Record, records

passwords = PasswordHash.recommended()


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def utc():
    return datetime.now(timezone.utc)


def token():
    return secrets.token_urlsafe(32)


SENSITIVE = re.compile(
    r"password|secret|token|authorization|api.?key|prompt|input|output|content|email|message|query|response|body|text",
    re.I,
)


def redact(value, key=""):
    if SENSITIVE.search(key):
        return "[REDACTED]"
    if isinstance(value, dict):
        return {k: redact(v, k) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, str):
        value = re.sub(
            r"(?i)(bearer\s+\S+|sk-[\w-]+|[\w.+-]+@[\w.-]+\.[a-z]{2,})",
            "[REDACTED]",
            value,
        )
        return value[:4000]
    return value


def identity(request: Request):
    raw = request.cookies.get("tracepilot_session")
    if not raw:
        raise HTTPException(401, "Sign in to continue")
    with Session() as db:
        session = db.get(Record, "session:" + digest(raw))
        if not session or session.data["expires"] < utc().timestamp():
            raise HTTPException(401, "Session expired")
        user = db.get(Record, session.data["user"])
        if not user:
            raise HTTPException(401, "Account unavailable")
        return {"id": user.id, **user.data}


def authorize(request: Request, project: str, write=False, admin=False):
    user = identity(request)
    role = user.get("memberships", {}).get(project)
    if not role or (write and role == "Viewer") or (admin and role != "Admin"):
        raise HTTPException(403, "Insufficient project permissions")
    return user


def ingestion_auth(request, project, db):
    value = request.headers.get("authorization", "").removeprefix("Bearer ")
    key = db.get(Record, "key:" + digest(value))
    if not key or key.project != project or key.data.get("revoked"):
        raise HTTPException(401, "Invalid ingestion key")
