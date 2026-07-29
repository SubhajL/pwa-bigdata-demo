"""Window features and specific energy consumption (slice S5)."""
from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np

from .lifecycle import SIGNAL_FIELDS, LifecycleRow

#: Per-signal statistics, in a FIXED order. The model is fitted against this exact
#: sequence, so reordering it silently corrupts every subsequent prediction.
FEATURE_NAMES: tuple[str, ...] = tuple(
    f"{signal}_{stat}" for signal in SIGNAL_FIELDS for stat in ("mean", "slope", "max")
)


def window_features(rows: Sequence[LifecycleRow]) -> dict[str, float]:
    """Summarise a window of telemetry into the model's feature vector.

    For each signal: the mean, the least-squares slope over the window (the trend is what
    distinguishes "hot" from "getting hotter"), and the maximum.

    Args:
        rows: consecutive hourly readings; must not be empty.

    Returns:
        A dict keyed by `FEATURE_NAMES`, in that order, all finite.

    Raises:
        ValueError: if `rows` is empty. Zero-filling would turn absent telemetry into a
            confident measurement, which is the failure this refuses to enable.
    """
    if len(rows) == 0:
        raise ValueError("window_features received an empty window")

    n = len(rows)
    indices = np.arange(n, dtype=float)
    result: dict[str, float] = {}

    for signal in SIGNAL_FIELDS:
        values = np.array([getattr(r, signal) for r in rows], dtype=float)
        result[f"{signal}_mean"] = float(np.mean(values))
        if n == 1:
            result[f"{signal}_slope"] = 0.0
        else:
            result[f"{signal}_slope"] = float(np.polyfit(indices, values, 1)[0])
        result[f"{signal}_max"] = float(np.max(values))

    return result


def specific_energy_consumption(power_kw: float, flow_m3h: float) -> float | None:
    """Energy per unit pumped, in kWh/m3 — the twin's pump tooltip (scored item 2.3).

    Returns:
        `power_kw / flow_m3h`, or None when the quantity is undefined: a non-finite input,
        a flow at or below zero, or a negative power reading. Never NaN, never negative —
        a tooltip should show an em dash rather than nonsense.
    """
    if not math.isfinite(power_kw) or not math.isfinite(flow_m3h):
        return None
    if flow_m3h <= 0.0 or power_kw < 0.0:
        return None
    return power_kw / flow_m3h
