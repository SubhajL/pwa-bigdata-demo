"""Simulator-side contracts (slice S1).

Deliberately mirrors `api/app/models.py` rather than importing it: the two run in
separate containers with separate dependency sets. The pair is pinned together by
`contracts/telemetry-envelope.v1.schema.json`, which both test suites validate
against — that file, not this module, is the wire contract.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel

DeviceKind = Literal["pump", "motor", "valve", "sensor"]
Signal = Literal["pressure_bar", "flow_m3h", "power_kw", "vibration", "bearing_temp_c"]


class FaultMode(str, Enum):
    """Injectable fault classes — the three failure modes slice S2 must survive."""

    NORMAL = "normal"
    ANOMALY = "anomaly"
    BAD_ASSET = "bad_asset"
    MALFORMED = "malformed"


#: Physically plausible operating band per signal, `(low, high)` inclusive.
#: NORMAL values sit inside the band; ANOMALY drives at least one signal outside it.
#: Units: bar · m³/h · kW · mm/s RMS · °C.
SIGNAL_BANDS: dict[Signal, tuple[float, float]] = {
    "pressure_bar": (2.0, 6.0),
    "flow_m3h": (50.0, 400.0),
    "power_kw": (5.0, 75.0),
    "vibration": (0.5, 4.5),
    "bearing_temp_c": (35.0, 75.0),
}

#: Which signals each device kind actually reports.
KIND_SIGNALS: dict[DeviceKind, tuple[Signal, ...]] = {
    "pump": ("pressure_bar", "flow_m3h", "power_kw", "vibration", "bearing_temp_c"),
    "motor": ("power_kw", "vibration", "bearing_temp_c"),
    "valve": ("pressure_bar", "flow_m3h"),
    "sensor": ("pressure_bar",),
}

#: Asset ID published under FaultMode.BAD_ASSET. Must never collide with the roster.
BAD_ASSET_ID = "PWA-UNKNOWN-DEVICE-000"


class Device(BaseModel):
    """A roster device. Geography is REAL PWA data from `data/curated/`."""

    model_config = {"frozen": True}

    asset_id: str
    kind: DeviceKind
    branch: str
    province: str
    region: int
    dma: str | None = None


class Envelope(BaseModel):
    """One telemetry reading on the wire. Serialised to JSON, published at QoS 1.

    All values are SIMULATED; only the device geography is real.
    """

    message_id: str
    run_id: str
    ts: datetime
    asset_id: str
    signal: Signal
    value: float
