import os
from sqlalchemy import (
    create_engine,
    String,
    Text,
    JSON,
    Integer,
    Float,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

engine = create_engine(
    os.getenv("DATABASE_URL", "sqlite:///./tracepilot.db"),
    **(
        {"connect_args": {"check_same_thread": False}}
        if os.getenv("DATABASE_URL", "sqlite:").startswith("sqlite:")
        else {}
    )
)
Session = sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Record(Base):
    __tablename__ = "records"
    id: Mapped[str] = mapped_column(String(160), primary_key=True)
    project: Mapped[str] = mapped_column(String(80), index=True)
    kind: Mapped[str] = mapped_column(String(40), index=True)
    data: Mapped[dict] = mapped_column(JSON)


class Span(Base):
    __tablename__ = "spans"
    __table_args__ = (UniqueConstraint("project", "span_id"),)
    id: Mapped[str] = mapped_column(String(200), primary_key=True)
    project: Mapped[str] = mapped_column(String(80), index=True)
    trace_id: Mapped[str] = mapped_column(String(80), index=True)
    span_id: Mapped[str] = mapped_column(String(80))
    parent_span_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    start: Mapped[str] = mapped_column(String(40), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    data: Mapped[dict] = mapped_column(JSON)


def records(db, project, kind):
    return db.query(Record).filter_by(project=project, kind=kind).all()


def put(db, project, kind, key, data):
    row = db.get(Record, key)
    if row is None:
        row = Record(id=key, project=project, kind=kind, data=data)
        db.add(row)
    else:
        row.data = data
    db.flush()
    return row
