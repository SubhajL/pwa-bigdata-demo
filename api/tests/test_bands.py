"""T1/T2 — signal band classification and its drift guards (DREP-PR7b R2, R3).

The API classifies a raw reading into a twin status by how far it sits outside its physical
band. Those bands are duplicated from the simulator (the two `app` packages must never share
an interpreter — `conftest.pytest_sessionstart`), so two drift tests hold them together:
the API bands must equal the simulator's, AND must cover exactly the signals ingest accepts —
otherwise ingest could accept a reading whose signal has no band and classification would
`KeyError` *after* the message is already acked.

Authored by Claude; the implementer must not modify this file (DREP §10).
"""
from __future__ import annotations

import math
import subprocess
import sys
from pathlib import Path

import pytest

from app.bands import SIGNAL_BANDS, classify_signal
from app.ingest import VALID_SIGNALS

REPO_ROOT = Path(__file__).resolve().parents[2]


# ── T1: classification boundaries ─────────────────────────────────────────────────────

# pressure_bar band is (2.0, 6.0), width 4.0 — used for the exact-boundary cases.
@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (2.0, "normal"),   # low edge, inclusive
        (6.0, "normal"),   # high edge, inclusive
        (4.0, "normal"),   # mid
        (1.99, "warning"),  # just below the band
        (6.01, "warning"),  # just above the band
        (-2.0, "warning"),  # exactly one width below low (2.0 - 4.0) — still warning
        (-2.01, "critical"),  # past one width below low
        (10.0, "warning"),  # exactly one width above high (6.0 + 4.0)
        (10.01, "critical"),  # past one width above high
        (-100.0, "critical"),
        (float("nan"), "nodata"),
        (float("inf"), "nodata"),
        (float("-inf"), "nodata"),
    ],
)
def test_classify_pressure_bar_boundaries(value: float, expected: str) -> None:
    assert classify_signal("pressure_bar", value) == expected


def test_classification_is_total_over_finite_values_for_every_signal() -> None:
    # Never raises for a finite value of a known signal, and always returns a valid status.
    valid = {"normal", "warning", "critical", "nodata"}
    for signal, (low, high) in SIGNAL_BANDS.items():
        for value in (low - 1, low, (low + high) / 2, high, high + 1):
            assert classify_signal(signal, value) in valid
    # A non-finite reading is nodata, never an exception.
    assert classify_signal("flow_m3h", math.nan) == "nodata"


# ── T2: drift — the bands agree with the simulator AND with ingest's accepted signals ──


def _simulator_bands() -> dict[str, tuple[float, float]]:
    """The simulator's SIGNAL_BANDS, obtained OUT OF PROCESS.

    api/app and simulator/app are both top-level `app` packages; importing the simulator
    into this interpreter would shadow the API package. Same technique as
    conftest.simulator_roster.
    """
    result = subprocess.run(
        [
            sys.executable, "-c",
            "import sys, json; sys.path.insert(0, 'simulator');"
            "from app.models import SIGNAL_BANDS;"
            "print(json.dumps({k: list(v) for k, v in SIGNAL_BANDS.items()}))",
        ],
        cwd=REPO_ROOT, capture_output=True, text=True, check=True, timeout=120,
    )
    import json

    return {k: tuple(v) for k, v in json.loads(result.stdout).items()}


def test_api_bands_do_not_drift_from_the_simulator() -> None:
    sim = _simulator_bands()
    assert {k: tuple(v) for k, v in SIGNAL_BANDS.items()} == sim, (
        "api and simulator SIGNAL_BANDS disagree; every reading of a drifted signal would "
        "be misclassified"
    )


def test_every_ingestible_signal_has_a_band() -> None:
    # Closes the "ingest accepts a signal with no band -> classify KeyError AFTER ack" gap.
    assert set(SIGNAL_BANDS) == set(VALID_SIGNALS), (
        f"band keys {set(SIGNAL_BANDS)} != ingest VALID_SIGNALS {set(VALID_SIGNALS)}"
    )
