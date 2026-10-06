from datetime import datetime
from typing import Literal, Any
from pydantic import BaseModel, Field, model_validator


class Event(BaseModel):
    schema_version: Literal["1"] = "1"
    project_id: str = Field(min_length=1, max_length=80, pattern=r"^[\w-]+$")
    trace_id: str = Field(min_length=1, max_length=80, pattern=r"^[\w-]+$")
    span_id: str = Field(min_length=1, max_length=80, pattern=r"^[\w-]+$")
    parent_span_id: str | None = Field(default=None, max_length=80)
    name: str = Field(min_length=1, max_length=160)
    span_type: Literal["agent", "retrieval", "llm", "tool"]
    agent: str = Field(min_length=1, max_length=80)
    agent_version: str = Field(default="1.0.0", max_length=40)
    environment: Literal["production", "staging", "development"] = "development"
    start_time: datetime
    end_time: datetime | None = None
    status: Literal["running", "success", "error", "cancelled"] = "running"
    revision: int = Field(default=1, ge=1)
    model: str | None = Field(default=None, max_length=100)
    provider: str | None = Field(default=None, max_length=80)
    input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    attributes: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list, max_length=20)
    source: Literal["telemetry", "sample"] = "telemetry"

    @model_validator(mode="after")
    def times(self):
        if not self.start_time.tzinfo or (self.end_time and not self.end_time.tzinfo):
            raise ValueError("Timestamps must include UTC offset")
        if self.end_time and self.end_time < self.start_time:
            raise ValueError("End precedes start")
        if self.status != "running" and not self.end_time:
            raise ValueError("Completed spans need end_time")
        if self.parent_span_id == self.span_id:
            raise ValueError("Span cannot parent itself")
        return self


class Login(BaseModel):
    email: str
    password: str


class Rule(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    metric: Literal["error_rate", "p95_latency", "budget"]
    threshold: float = Field(gt=0, allow_inf_nan=False)
    lookback_minutes: int = Field(default=60, ge=1, le=43200)
    min_samples: int = Field(default=5, ge=1)
    environment: Literal["all", "production", "staging", "development"] = "all"
    source: Literal["telemetry", "sample"] = "telemetry"
    enabled: bool = True


class Settings(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    retention_days: int = Field(ge=1, le=365)
    notifications: bool = True


class Member(BaseModel):
    email: str = Field(min_length=3, max_length=200, pattern=r"^\S+@\S+\.\S+$")
    password: str = Field(min_length=12, max_length=200)
    role: Literal["Admin", "Developer", "Viewer"]
