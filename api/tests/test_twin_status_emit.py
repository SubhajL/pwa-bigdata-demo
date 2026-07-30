"""T3 — an accepted reading emits its REAL signal/value/status (DREP-PR7b R1).

Before this slice, `_emit_twin_event` published a hardcoded `status="normal"` and dropped
the reading's signal/value, so a pump anomaly was invisible to the twin. Now the frame
carries the reading's real signal, value, observed_at and a band-classified status.

This tests the EMITTER directly with a constructed `Reading` and a real `TwinHub`
subscriber — no database. The emitter's contract (classify the reading, broadcast a
populated frame) does not involve storage, and a real hub asserts real broadcast behaviour
rather than our belief about it. Deliberately DB-free: `test_twin_emission.py` already
covers "an accepted reading produces one twin event" through the full path, and touching
the real telemetry table here would churn the planner statistics that `test_latency`'s
index-seek assertion depends on (SESSION-HANDOFF §4).

Authored by Claude; the implementer must not modify this file (DREP §10).
"""
from __future__ import annotations

from datetime import UTC, datetime

from psycopg_pool import ConnectionPool

from app.ingest import PipelineStatus
from app.models import Reading, TwinEvent
from app.service import IngestDeps, _emit_twin_event
from app.ws import TwinHub


def _reading(signal: str, value: float) -> Reading:
    return Reading(
        message_id="m-1",
        run_id="r-1",
        ts=datetime.now(tz=UTC),
        asset_id="P-2",
        signal=signal,  # type: ignore[arg-type]  # a test may pass any known signal string
        value=value,
    )


def _deps(hub: TwinHub) -> IngestDeps:
    # The emitter only reads `deps.twin_hub`; the pool is never touched, so an UNOPENED
    # pool keeps this test entirely DB-free (open=False does not connect).
    pool = ConnectionPool("postgresql://unused", min_size=1, open=False)
    return IngestDeps(pool=pool, roster=frozenset(), status=PipelineStatus(), twin_hub=hub)


def _emit(reading: Reading) -> TwinEvent:
    hub = TwinHub()
    sub = hub.subscribe()
    _emit_twin_event(_deps(hub), reading)
    # broadcast is synchronous; the single frame is already buffered. Reach into the
    # two-tier structure (asset -> {(kind,signal) -> event}) rather than awaiting get().
    bucket = next(iter(sub._pending.values()))
    return next(iter(bucket.values()))


def test_a_below_band_pressure_reading_emits_a_warning_with_its_real_signal() -> None:
    # pressure_bar band is (2.0, 6.0); 1.0 is below by 1.0 (< one width) -> warning.
    frame = _emit(_reading("pressure_bar", 1.0))
    assert frame.kind == "status"
    assert frame.signal == "pressure_bar"
    assert frame.value == 1.0
    # EXACTLY warning — an "every excursion is critical" classifier must fail here.
    assert frame.status == "warning"
    assert frame.observed_at is not None


def test_an_in_band_flow_reading_emits_normal_with_its_real_signal() -> None:
    # flow_m3h band is (50, 400); 100 is in band -> normal. Proves the emitter reads the
    # reading's OWN signal, not a hardcoded "pressure_bar".
    frame = _emit(_reading("flow_m3h", 100.0))
    assert frame.signal == "flow_m3h"
    assert frame.value == 100.0
    assert frame.status == "normal"


def test_the_observed_time_is_the_readings_own_timestamp() -> None:
    reading = _reading("power_kw", 200.0)  # 200 is far above the (5,75) band -> critical
    frame = _emit(reading)
    assert frame.observed_at == reading.ts
    # published_at (broadcast time) must NOT be substituted for observed_at (reading time).
    assert frame.observed_at != frame.published_at
    assert frame.status == "critical"


def test_the_emitter_is_total_and_never_raises_out_of_the_ingest_path() -> None:
    """Emission runs AFTER the message is acked, inside the consumer's containment. A
    classify/serialise/hub failure must be swallowed and logged — never raised — or a
    transient twin problem would surface as a redelivery storm. Deleting the try/except
    must fail THIS test."""
    hub = TwinHub()
    hub.subscribe()

    class _ExplodingHub(TwinHub):
        def broadcast(self, event: TwinEvent) -> None:
            raise RuntimeError("hub blew up")

    deps = _deps(_ExplodingHub())
    # Must not raise, even though broadcast raises.
    _emit_twin_event(deps, _reading("pressure_bar", 1.0))
