"""T6 — topology status comes from persisted health (DREP-PR7b R7).

PR-7a's `/api/twin/topology` returned `nodata` for every device permanently; 7b populates
each device's status from the latest persisted health score, so a page load shows a failing
pump as failing rather than unknown. A device with no health row stays `nodata` — never
`normal`, because an unknown device must not render healthy in a control room.

Runs against a min-size-1 pool ON PURPOSE: `latest_statuses` acquires its own connection, so
if `load_topology` looked it up while still holding the device-query connection, a
single-connection pool would deadlock. This test would hang (and fail under a timeout).

Authored by Claude; the implementer must not modify this file (DREP §10).
"""
from __future__ import annotations

from datetime import UTC, datetime

import pytest
from psycopg_pool import ConnectionPool
from pwa_ml.predict import CRITICAL_BELOW, WARNING_BELOW

from app.health_store import HealthRow, insert_health
from app.topology import load_topology

pytestmark = pytest.mark.integration

PUMP = "P-2"
# A second placed device on the DMA-03 line (seed_db), used for the warning-band case.
VALVE = "V-9"


def _purge_health(pool: ConnectionPool, *asset_ids: str) -> None:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM health WHERE asset_id = ANY(%s)", (list(asset_ids),))
        conn.commit()


def _row(asset_id: str, score: float, status: str) -> HealthRow:
    return HealthRow(
        asset_id=asset_id,
        scored_at=datetime.now(tz=UTC),
        observed_at=datetime.now(tz=UTC),
        health_score=score,
        pttf_hours=3.0,
        model_version="test",
        status=status,  # type: ignore[arg-type]
    )


@pytest.mark.timeout(30)
def test_topology_reclassifies_scores_at_the_scoring_thresholds(timescale_dsn: str) -> None:
    """The status shown on load must use scoring's OWN thresholds. A health score in the
    WARNING band (between CRITICAL_BELOW and WARNING_BELOW) must render `warning`, not
    `critical` — which pins the exact `pwa_ml.predict` constants and rejects a copy that
    drifted them."""
    warning_score = (CRITICAL_BELOW + WARNING_BELOW) / 2  # squarely in the warning band
    assert CRITICAL_BELOW < warning_score < WARNING_BELOW
    pool = ConnectionPool(timescale_dsn, min_size=1, max_size=1, open=True)
    _purge_health(pool, VALVE)
    try:
        insert_health(pool, [_row(VALVE, warning_score, "warning")])
        by_asset = {d.asset_id: d for d in load_topology(pool).devices}
        assert by_asset[VALVE].status == "warning", (
            "a warning-band score was not classified warning"
        )
    finally:
        _purge_health(pool, VALVE)
        pool.close()


@pytest.mark.timeout(30)
def test_topology_status_reflects_persisted_health_and_defaults_to_nodata(
    timescale_dsn: str,
) -> None:
    # min_size=1, max_size=1 — the deadlock trap. If load_topology looks up statuses while
    # holding its query connection, this hangs.
    pool = ConnectionPool(timescale_dsn, min_size=1, max_size=1, open=True)
    _purge_health(pool, PUMP)
    try:
        insert_health(
            pool,
            [
                HealthRow(
                    asset_id=PUMP,
                    scored_at=datetime.now(tz=UTC),
                    observed_at=datetime.now(tz=UTC),
                    health_score=20.0,  # < CRITICAL_BELOW (40) -> critical
                    pttf_hours=3.0,
                    model_version="test",
                    status="critical",
                )
            ],
        )

        topo = load_topology(pool)
        by_asset = {d.asset_id: d for d in topo.devices}

        assert by_asset[PUMP].status == "critical", "topology ignored the persisted health"
        # Every OTHER placed device has no health row -> nodata, never normal.
        for asset_id, device in by_asset.items():
            if asset_id != PUMP:
                assert device.status == "nodata", f"{asset_id} defaulted to {device.status}"
    finally:
        _purge_health(pool, PUMP)
        pool.close()
