"""Physical operating bands per signal, and the twin-status classifier (slice S4b).

The API classifies each accepted reading into a twin status by how far its value sits
outside the signal's plausible operating band. That is what lets a pump anomaly change the
device's symbol on the digital twin (scored items 2.2/2.3) the moment a reading arrives,
without waiting for the slower model-health signal.

WHY THESE BANDS ARE DUPLICATED FROM THE SIMULATOR (not imported)
---------------------------------------------------------------
`api/app` and `simulator/app` are both top-level packages named `app`; putting the
simulator on this interpreter's path shadows one or the other. The two run in separate
containers and never share an interpreter. The duplication is held together by
`test_bands.py`, which asserts these values equal the simulator's `SIGNAL_BANDS`
out-of-process AND cover exactly the signals ingest accepts — so ingest can never accept a
reading whose signal has no band here.

Bands are physical constants, not per-device tuning. The classification thresholds below
are deliberately coarse: a single out-of-band reading is at most a `warning`. Sustained,
model-detected degradation reaches `critical` through the separate `kind="health"` path
(`app.scoring`), so the two producers divide cleanly — instantaneous band vs. trend.
"""
from __future__ import annotations

import math

from .models import Signal, TwinStatus

#: (low, high) inclusive, per signal. MUST equal `simulator/app/models.py::SIGNAL_BANDS`.
#: Units: bar · m³/h · kW · mm/s RMS · °C.
SIGNAL_BANDS: dict[Signal, tuple[float, float]] = {
    "pressure_bar": (2.0, 6.0),
    "flow_m3h": (50.0, 400.0),
    "power_kw": (5.0, 75.0),
    "vibration": (0.5, 4.5),
    "bearing_temp_c": (35.0, 75.0),
}


def classify_signal(signal: Signal, value: float) -> TwinStatus:
    """Classify one reading by distance from its band.

    `nodata` for a non-finite value; `normal` inside the band; `warning` when outside by up
    to one band-width; `critical` when further. Total over any finite value of a known
    signal. Raises `KeyError` only for an unknown signal, which ingest cannot produce
    (`VALID_SIGNALS` is drift-tested to equal these band keys).
    """
    if not math.isfinite(value):
        return "nodata"
    low, high = SIGNAL_BANDS[signal]
    if low <= value <= high:
        return "normal"
    width = high - low
    distance = (low - value) if value < low else (value - high)
    return "warning" if distance <= width else "critical"
