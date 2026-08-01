"""PR-7 demo-data tuning — the demonstrated pump P-2 backfills to `critical` at cold start.

Scored twin items 2.2 / 2.3 / 3.3 need a device the twin colours RED. A single below-band
reading can only ever classify as `warning` (`api.app.bands`: reaching `critical` would take
a value more than a full band-width outside the band, which pressure/flow/etc. cannot
physically reach), so the ONLY path to a `critical` symbol is the model-health path. With the
default index-spread wear, P-2 — which sorts second among pumps (`P-1`, `P-2`, then every
`PWA-*`) — backfills to ~90 → `normal`; these tests pin the demo override that instead lands
its backfilled window comfortably below the 40 `critical` gate, WITHOUT dragging the rest of
the fleet critical (that would break the healthy-dataset contrast of item 3.2 and the worklist
ordering of item 3.5).

The window is rebuilt from `backfill_history._rows_for` — the exact rows the script writes to
the hypertable — and scored through `app.features.build_window` + `pwa_ml.predict.score_window`,
i.e. the same cold-start path the API runs. No database or broker required, so the demo's
central claim is a deterministic unit test rather than a manual observation.
"""
from __future__ import annotations

import pathlib
import zlib
from datetime import UTC, datetime, timedelta

from pwa_ml.lifecycle import generate_lifecycle
from pwa_ml.predict import CRITICAL_BELOW, Score, load_bundle, score_window
from scripts.backfill_history import (
    _FAILURE_THRESHOLD,
    _RUN_UP_HOURS,
    _WEAR_MAX,
    _WEAR_MIN,
    DEFAULT_ASSETS,
    DEMO_WEAR_OVERRIDE,
    _rows_for,
    _wear_rate,
)

from app.features import WINDOW_HOURS, build_window
from app.models import Reading, Signal

#: P-2's real position among the backfilled pumps (`P-1` is 0, `P-2` is 1). The override must
#: make it critical regardless of index; index 0 — the HEALTHIEST slot — is the strongest
#: statement of that and is asserted separately.
_P2 = "P-2"
_P2_INDEX = 1
#: A branch pump at the healthy end of the spread — must stay OUT of `critical`, or the
#: override is a global wear bump rather than a targeted demo tuning.
_HEALTHY_PUMP = "PWA-5511011-P1"


def _score_backfill(asset_id: str, index: int, artifact: pathlib.Path) -> Score:
    """Score `asset_id`'s backfilled window exactly as the API does at cold start."""
    now = datetime(2026, 8, 1, 12, 0, 0, tzinfo=UTC)
    readings = [
        Reading(
            message_id=f"{asset_id}:{hours_before}:{signal}",
            run_id="test-backfill",
            ts=now - timedelta(hours=hours_before),
            asset_id=asset_id,
            signal=signal,
            value=value,
        )
        for hours_before, signal, value in _rows_for(asset_id, index, DEFAULT_ASSETS)
    ]
    window = build_window(readings, now=now, hours=WINDOW_HOURS)
    assert window.scoreable, f"backfill window for {asset_id} not scoreable: {window.reason}"
    return score_window(load_bundle(artifact), window.rows)


def test_demo_pump_P2_backfills_to_critical_at_cold_start(model_artifact: pathlib.Path) -> None:
    score = _score_backfill(_P2, _P2_INDEX, model_artifact)
    assert score.status == "critical", f"P-2 scored {score.status} at health {score.health:.1f}"
    assert score.health < CRITICAL_BELOW


def test_the_override_defeats_a_healthy_roster_position(model_artifact: pathlib.Path) -> None:
    # Index 0 is the healthiest slot (lowest index-spread wear). P-2 must be critical even
    # there, proving the override — not roster order — sets its band.
    score = _score_backfill(_P2, 0, model_artifact)
    assert score.status == "critical", f"P-2 scored {score.status} at index 0"


def test_the_demo_pumps_scored_window_stays_pre_failure() -> None:
    # A PREDICTIVE demo must not present a POST-failure window as a prediction: `pwa_ml` trains
    # only on windows ending before the failure crossing, so a device that has already failed is
    # out of the model's domain (PTTF saturates to 0). P-2's backfilled trajectory must therefore
    # never cross `_FAILURE_THRESHOLD` across the run-up — i.e. it is "degraded and predicted to
    # fail", not "already failed". (Regression guard: wear 0.42 crossed at hour ~167.) The
    # generation parameters mirror `_rows_for` exactly.
    run = generate_lifecycle(
        lifecycle_id=f"backfill-{_P2}",
        seed=zlib.crc32(_P2.encode()),
        hours=_RUN_UP_HOURS,
        wear_rate=DEMO_WEAR_OVERRIDE[_P2],
        failure_threshold=_FAILURE_THRESHOLD,
    )
    assert run.failure_hour is None, (
        f"P-2 crosses its failure threshold at hour {run.failure_hour}; its scored window would "
        "be post-failure and out of the model's training domain"
    )
    # P-2 is the UNIQUELY most-worn backfilled pump (strictly above every index-spread pump's
    # `_WEAR_MAX`), so it heads the worklist AND its window being pre-failure guarantees the whole
    # fleet (all at lower wear → higher latent) is pre-failure too.
    assert DEMO_WEAR_OVERRIDE[_P2] > _WEAR_MAX


def test_the_backfill_failure_threshold_matches_the_model_training_authority() -> None:
    # The backfill keeps its own `_FAILURE_THRESHOLD` so the lean `backfill` container need not
    # import the dataset module. This drift test is what holds the two equal: a retrain that moves
    # the training threshold must move the backfill's too, or the pre-failure guarantee above is
    # measured against the wrong line while the suite stays green. (Same idiom as test_bands.py.)
    from pwa_ml.datasets import FAILURE_THRESHOLD

    assert _FAILURE_THRESHOLD == FAILURE_THRESHOLD


def test_the_demo_pump_predicts_a_finite_pttf_once_live_telemetry_enters_the_window(
    model_artifact: pathlib.Path,
) -> None:
    # The whole point of keeping P-2 PRE-failure (vs a saturated post-failure device) is that the
    # model reports a FINITE time-to-failure — "predicted to fail", not "already failed". The bare
    # cold-start instant reads pttf=0, but the moment the newest clock-hour bucket carries one live
    # in-band cycle the prediction becomes positive while P-2 stays critical. This pins the
    # finite-PTTF claim in `backfill_history.py::DEMO_WEAR_OVERRIDE`.
    now = datetime(2026, 8, 1, 12, 0, 0, tzinfo=UTC)
    readings = [
        Reading(
            message_id=f"{_P2}:{hours_before}:{signal}",
            run_id="test-backfill",
            ts=now - timedelta(hours=hours_before),
            asset_id=_P2,
            signal=signal,
            value=value,
        )
        for hours_before, signal, value in _rows_for(_P2, _P2_INDEX, DEFAULT_ASSETS)
    ]
    # one live, in-band reading per signal in the newest bucket (band midpoints)
    live_midpoints: dict[Signal, float] = {
        "pressure_bar": 4.0, "flow_m3h": 225.0, "power_kw": 40.0,
        "vibration": 2.5, "bearing_temp_c": 55.0,
    }
    readings += [
        Reading(message_id=f"live:{signal}", run_id="live", ts=now, asset_id=_P2,
                signal=signal, value=value)
        for signal, value in live_midpoints.items()
    ]
    window = build_window(readings, now=now, hours=WINDOW_HOURS)
    assert window.scoreable, window.reason
    score = score_window(load_bundle(model_artifact), window.rows)
    assert score.status == "critical", f"P-2 washed out of critical: {score.status}"
    assert score.pttf_hours > 0.0, "a pre-failure critical device must predict a finite PTTF"


def test_a_healthy_branch_pump_is_not_dragged_critical(model_artifact: pathlib.Path) -> None:
    # The override must be TARGETED: a low-index branch pump keeps its healthy band, or the
    # worklist ordering (3.5) and the healthy-dataset contrast (3.2) both collapse.
    score = _score_backfill(_HEALTHY_PUMP, 0, model_artifact)
    assert score.status != "critical", f"{_HEALTHY_PUMP} unexpectedly critical ({score.health:.1f})"


def test_wear_rate_pins_the_demo_pump_and_preserves_the_fleet_spread() -> None:
    # The override is position-independent for a demo pump...
    assert _wear_rate(_P2, 0, DEFAULT_ASSETS) == DEMO_WEAR_OVERRIDE[_P2]
    assert _wear_rate(_P2, DEFAULT_ASSETS - 1, DEFAULT_ASSETS) == DEMO_WEAR_OVERRIDE[_P2]
    # ...and leaves the index spread intact for every pump that is NOT pinned, so the
    # worklist remains an ordering from healthiest to most-worn.
    assert _wear_rate(_HEALTHY_PUMP, 0, DEFAULT_ASSETS) == _WEAR_MIN
    assert _wear_rate(_HEALTHY_PUMP, DEFAULT_ASSETS - 1, DEFAULT_ASSETS) == _WEAR_MAX
