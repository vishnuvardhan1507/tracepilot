"""Explicit local bootstrap. Never called by the API automatically."""

import argparse, os
from backend.db import Session, put, Record
from backend.security import passwords


def bootstrap():
    email = os.getenv("ADMIN_EMAIL", "admin@tracepilot.local")
    password = os.getenv("ADMIN_PASSWORD")
    if not password or len(password) < 12:
        raise SystemExit("Set ADMIN_PASSWORD to at least 12 characters")
    with Session() as db:
        if not db.get(Record, "project:research"):
            put(
                db,
                "research",
                "project",
                "project:research",
                {
                    "name": "Research workspace",
                    "retention_days": 30,
                    "notifications": True,
                },
            )
        if not db.get(Record, "user:" + email):
            put(
                db,
                "_auth",
                "user",
                "user:" + email,
                {
                    "email": email,
                    "password": passwords.hash(password),
                    "memberships": {"research": "Admin"},
                },
            )
        put(
            db,
            "research",
            "price",
            "price:local-v1",
            {
                "model": "local/research-v1",
                "provider": "Local simulator",
                "version": "local-v1",
                "effective_from": "2020-01-01T00:00:00+00:00",
                "input_per_million": 1.5,
                "output_per_million": 6,
                "note": "Illustrative sample assumption, not a provider quote. Local calls are simulated.",
            },
        )
        put(
            db,
            "research",
            "dataset",
            "dataset:research-quality-v1",
            {
                "name": "Research quality",
                "version": 1,
                "description": "Citation, output-schema, tool-completion and latency assertions for research traces.",
            },
        )
        db.commit()
    print("Created project research and administrator " + email)


if __name__ == "__main__":
    bootstrap()
