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


class TwinEvent(BaseModel):
    """WS payload pushed to the digital twin (S3 transport, S6 emit)."""
    kind: Literal["status", "health"]
    asset_id: str
    status: Literal["normal", "warning", "critical", "nodata"]
    observed_at: datetime | None = None
    published_at: datetime | None = None


class ScenarioRequest(BaseModel):
    """Run-ID-scoped demo scenario trigger (S-D scenario API)."""
    scenario: str = Field(..., description="e.g. pump_anomaly | pressure_drop | bad_asset")
    run_id: str
