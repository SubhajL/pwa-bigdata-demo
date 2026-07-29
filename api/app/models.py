"""Shared contracts (Codex #10: defined in S0, consumed by later slices)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

DeviceKind = Literal["pump", "motor", "valve", "sensor"]
Signal = Literal["pressure_bar", "flow_m3h", "power_kw", "vibration", "bearing_temp_c"]


class Device(BaseModel):
    asset_id: str
    kind: DeviceKind
    branch: str
    province: str
    region: int
    dma: str | None = None


class Reading(BaseModel):
    """A validated telemetry point. Produced by S2 `validate()`.

    `message_id` and `run_id` are carried through from the wire envelope: the ledger
    keys idempotency on the former, and the conservation invariant is only meaningful
    when scoped by the latter (otherwise two demo runs against one volume contaminate
    each other's counts).
    """
    message_id: str
    run_id: str
    ts: datetime
    asset_id: str
    signal: Signal
    value: float


class DeadLetter(BaseModel):
    """A rejected message routed to the DLQ (S2)."""
    message_id: str
    run_id: str | None
    asset_id: str | None
    reason: str
    raw: dict[str, Any]


#: Twin status vocabulary. Named so callers and tests can annotate it without a cast —
#: CLAUDE.md forbids silencing the type checker to make code compile.
TwinStatus = Literal["normal", "warning", "critical", "nodata"]


class TwinEvent(BaseModel):
    """WS payload pushed to the digital twin (S3 transport, S6 emit).

    The health fields are declared here, in the slice that lands the transport, even
    though nothing populates them until S6 scores devices. Shipping a status-only frame
    first and widening it later would be a breaking change for any client already built
    against it — and `health` is already a `kind` this event advertises, so the shape has
    to be able to carry one. `event_version` exists so a client can tell the difference.

    All health values are SIMULATED, as is every telemetry value in this demo.
    """

    event_version: Literal[1] = 1
    kind: Literal["status", "health"]
    asset_id: str
    status: TwinStatus
    observed_at: datetime | None = None
    published_at: datetime | None = None

    #: Populated by S6's scoring pass; absent on a plain status frame.
    health_score: float | None = None
    pttf_hours: float | None = None
    model_version: str | None = None
    #: The reading that triggered a status frame, when there was one.
    signal: Signal | None = None
    value: float | None = None


class ScenarioRequest(BaseModel):
    """Run-ID-scoped demo scenario trigger (S-D scenario API)."""
    scenario: str = Field(..., description="e.g. pump_anomaly | pressure_drop | bad_asset")
    run_id: str
