"""T1–T3 — the twin's runtime identity chain (DREP-PR7 R1, R2, R9).

The defect this slice exists to fix: the roster published the demo pump as `P-2` while the
topology seeded its node as `P2`, so **no device could be located on the schematic** and
scored item 2.1 had no ground truth. Nothing failed — there was simply no join, and an
empty diagram reads like a frontend bug.

Real TimescaleDB throughout. CLAUDE.md forbids mock-testing the pipeline, and a mocked
graph would assert our belief about the seed rather than the seed.

Authored by Claude; the implementer must not modify this file (DREP §10).
"""
from __future__ import annotations

import os
import pathlib
import subprocess
import sys

import psycopg
import pytest
from psycopg_pool import ConnectionPool
from scripts.map_ta_phut_customer_profile import (
    build_map_ta_phut_profiles,
    build_monthly_readings,
)

from app.topology import downstream_customers, load_topology

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]

#: PR-I: the seed now lands the 200 Map Ta Phut accounts (SIM-MTP-00001..00200) on the same
#: line intake -> P-2 -> tank -> V-9 -> n1 -> n2 — 120 on n1, 80 on n2. So an upstream-corridor
#: pipe (PIPE-TANK-V9) reaches all 200 and the last leg (PIPE-N1-N2) reaches only n2's 80.
MTP_PROFILE = "mtp-low-pressure-200-v1"
ALL_CUSTOMER_COUNT = 200
LAST_LEG_COUNT = 80


# ── T1: the identity defect ───────────────────────────────────────────────────────────


def test_every_device_node_exists_in_the_pipe_graph(pool: ConnectionPool) -> None:
    """A device with a node must join to a real edge — the P-2/P2 defect, pinned.

    Asserts the join is NON-EMPTY as well as consistent: a seed that assigned no nodes at
    all would satisfy "every assigned node is valid" vacuously, and the schematic would be
    just as empty.
    """
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT asset_id, node FROM device WHERE node IS NOT NULL")
        placed = cur.fetchall()
        cur.execute("SELECT from_node FROM pipe_edge UNION SELECT to_node FROM pipe_edge")
        nodes = {row[0] for row in cur.fetchall()}

    assert placed, "no device carries a topology node; the schematic would be empty"
    orphans = [(asset_id, node) for asset_id, node in placed if node not in nodes]
    assert orphans == [], f"devices reference nodes absent from pipe_edge: {orphans}"


def test_the_demo_pump_is_placed_and_has_geometry(pool: ConnectionPool) -> None:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT node, x, y FROM device WHERE asset_id = 'P-2'")
        row = cur.fetchone()
    assert row is not None, "the demo pump P-2 is not in the device table"
    node, x, y = row
    assert node == "P-2", f"pump node is {node!r}; it must equal the asset_id"
    assert x is not None and y is not None, "the pump has no schematic coordinates"


def test_every_pipe_has_geometry(pool: ConnectionPool) -> None:
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT pipe_id FROM pipe_edge "
            "WHERE x1 IS NULL OR y1 IS NULL OR x2 IS NULL OR y2 IS NULL"
        )
        missing = [row[0] for row in cur.fetchall()]
    assert missing == [], f"pipes without geometry cannot be drawn: {missing}"


# ── T2: the migration upgrades an existing volume ─────────────────────────────────────


def test_006_added_the_columns_and_indexes(pool: ConnectionPool) -> None:
    """The fixture applies 001–006 in order, which IS the upgrade path an existing demo
    volume takes (`scripts/migrate.py` skips already-applied filenames). Rebuilding from
    scratch would not prove it."""
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'device' AND column_name IN ('node','x','y')"
        )
        assert {r[0] for r in cur.fetchall()} == {"node", "x", "y"}

        cur.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'pipe_edge' AND column_name IN ('x1','y1','x2','y2')"
        )
        assert {r[0] for r in cur.fetchall()} == {"x1", "y1", "x2", "y2"}

        cur.execute(
            "SELECT indexname FROM pg_indexes "
            "WHERE tablename IN ('pipe_edge', 'customer_service_point')"
        )
        names = {r[0] for r in cur.fetchall()}
        assert "pipe_edge_from_node_idx" in names
        assert "customer_service_point_node_idx" in names


def test_migration_006_is_recorded_and_reapplying_is_a_noop(pool: ConnectionPool) -> None:
    from scripts import migrate

    with pool.connection() as conn:
        assert "006_twin_topology.sql" in migrate.applied(conn)
        # Applying again must add nothing — the ledger is what makes the upgrade path safe
        # to run on every `docker compose up`.
        assert migrate.apply_pending(conn) == []


# ── T3: downstream traversal ──────────────────────────────────────────────────────────


def test_downstream_of_the_tank_leg_reaches_every_customer(pool: ConnectionPool) -> None:
    impact = downstream_customers(pool, "PIPE-TANK-V9")
    assert impact.count == len(impact.customers) == ALL_CUSTOMER_COUNT
    assert all(c.customer_id.startswith("SIM-MTP-") for c in impact.customers)
    assert not any(c.customer_id.startswith("72-1-") for c in impact.customers)


def test_downstream_of_the_last_leg_reaches_only_its_own_node(pool: ConnectionPool) -> None:
    """The discriminating case. A traversal that ignored direction, or that returned every
    customer regardless, would pass the test above and fail this one."""
    impact = downstream_customers(pool, "PIPE-N1-N2")
    assert impact.count == LAST_LEG_COUNT
    assert {c.node for c in impact.customers} == {"n2"}


def test_customers_are_deduplicated_and_deterministically_ordered(pool: ConnectionPool) -> None:
    impact = downstream_customers(pool, "PIPE-TANK-V9")
    ids = [c.customer_id for c in impact.customers]
    assert ids == sorted(ids), "ordering must be stable, or the UI reshuffles between polls"
    assert len(ids) == len(set(ids)) == ALL_CUSTOMER_COUNT


# ── enriched impact: profile join + type breakdown (PR-I, feature on) ──────────────────


def test_enriched_impact_breakdown_sums_to_200_and_is_140_35_25(pool: ConnectionPool) -> None:
    impact = downstream_customers(
        pool, "PIPE-TANK-V9", enriched=True, profile_version=MTP_PROFILE
    )
    assert impact.count == ALL_CUSTOMER_COUNT
    assert impact.zone == "MTP-LPZ-01"
    breakdown = impact.type_breakdown
    assert breakdown is not None
    assert (breakdown.type_1, breakdown.type_2, breakdown.type_3) == (140, 35, 25)
    assert breakdown.type_1 + breakdown.type_2 + breakdown.type_3 == impact.count


def test_enriched_last_leg_breakdown_sums_to_80(pool: ConnectionPool) -> None:
    impact = downstream_customers(
        pool, "PIPE-N1-N2", enriched=True, profile_version=MTP_PROFILE
    )
    assert impact.count == LAST_LEG_COUNT
    breakdown = impact.type_breakdown
    assert breakdown is not None
    assert breakdown.type_1 + breakdown.type_2 + breakdown.type_3 == LAST_LEG_COUNT


def test_enriched_customer_carries_its_exact_profile_and_latest_usage(
    pool: ConnectionPool,
) -> None:
    """One known account's fields are EXACT — including the precise latest usage computed from
    the generator, so a broken latest-reading join (wrong month, or a fan-out that picks any of
    the 12) fails here rather than passing on `> 0` (Codex §3)."""
    impact = downstream_customers(
        pool, "PIPE-TANK-V9", enriched=True, profile_version=MTP_PROFILE
    )
    first = next(c for c in impact.customers if c.customer_id == "SIM-MTP-00001")
    readings = build_monthly_readings(build_map_ta_phut_profiles())
    expected_latest = max(
        (r for r in readings if r.customer_id == "SIM-MTP-00001"), key=lambda r: r.period
    ).usage_m3
    assert first.latest_usage_m3 == expected_latest
    assert first.type_code == 1
    assert first.subtype_code == 11
    assert first.account_no == "SIM-MTP-ACC-00001"
    assert first.meter_no == "SIM-MTP-MTR-00001"
    # EVERY enriched account carries ALL its fields — not just the sampled one (Codex §3).
    assert all(
        c.type_code is not None and c.subtype_code is not None and c.account_no is not None
        and c.meter_no is not None and c.latest_usage_m3 is not None
        for c in impact.customers
    )


def test_enriched_impact_is_empty_for_an_unknown_profile_version(
    pool: ConnectionPool,
) -> None:
    """A decoy proving the `profile_version` predicate is actually applied: a version that
    matches no profile returns zero affected accounts, not the whole 200 (Codex §3)."""
    impact = downstream_customers(
        pool, "PIPE-TANK-V9", enriched=True, profile_version="no-such-version"
    )
    assert impact.count == 0
    assert impact.zone is None
    assert impact.type_breakdown is not None
    breakdown = impact.type_breakdown
    assert breakdown.type_1 + breakdown.type_2 + breakdown.type_3 == 0


def test_impact_zone_and_config_constants_agree_with_the_generator() -> None:
    """No single source of truth for the version/zone strings (they are re-declared in the
    generator, topology, and config). Pin them equal so a future version bump cannot desync
    silently — a partial bump would 404 the zone route while the enriched query returns 0
    accounts (g2-qcheck round 3, Tier 1). No DB needed."""
    from scripts.map_ta_phut_customer_profile import MTP_PRESSURE_ZONE_ID, MTP_PROFILE_VERSION

    from app.config import Settings
    from app.topology import MTP_IMPACT_ZONE

    assert MTP_IMPACT_ZONE.scenario_id == MTP_PROFILE_VERSION
    assert MTP_IMPACT_ZONE.zone_id == MTP_PRESSURE_ZONE_ID
    assert Settings().mtp_customer_profile == MTP_PROFILE_VERSION


def test_config_rejects_an_unsupported_customer_profile() -> None:
    """Only the seeded profile is supported; a non-default MTP_CUSTOMER_PROFILE must fail at
    Settings construction (startup fail-closed), not silently serve an empty enriched impact while
    preflight still passes on the seeded v1 (g2-qcheck round 4, Codex). No DB needed."""
    import pydantic

    from app.config import Settings

    with pytest.raises(pydantic.ValidationError):
        Settings(mtp_customer_profile="mtp-low-pressure-999-v9")


def test_unknown_pipe_raises(pool: ConnectionPool) -> None:
    with pytest.raises(KeyError):
        downstream_customers(pool, "PIPE-NOT-REAL")


@pytest.mark.timeout(20)
def test_traversal_terminates_on_a_cyclic_topology(timescale_dsn: str) -> None:
    """A cycle must RETURN, not hang.

    The seeded graph is a straight line, so this guard is untestable without constructing
    a cycle explicitly — which means that without this test the visited-set could be
    missing entirely and every other test here would still pass. A future seed change
    would then hang a worker thread on a request.

    Bounded by pytest-timeout so a non-terminating implementation FAILS rather than
    stalling the suite.
    """
    with psycopg.connect(timescale_dsn) as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO pipe_edge (pipe_id, from_node, to_node, dma, x1,y1,x2,y2) VALUES "
            "('CYC-A','cyc1','cyc2','DMA-CYC',0,0,1,1),"
            "('CYC-B','cyc2','cyc1','DMA-CYC',1,1,0,0) "
            "ON CONFLICT DO NOTHING"
        )
        conn.commit()
    try:
        pool = ConnectionPool(timescale_dsn, min_size=1, max_size=2, open=True)
        try:
            impact = downstream_customers(pool, "CYC-A")
            # No customers hang off the cycle; the point is purely that it returns.
            assert impact.count == 0
        finally:
            pool.close()
    finally:
        with psycopg.connect(timescale_dsn) as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM pipe_edge WHERE dma = 'DMA-CYC'")
            conn.commit()


@pytest.mark.timeout(20)
def test_a_duplicate_pipe_id_seeds_every_matching_edge(timescale_dsn: str) -> None:
    """`pipe_id` is NOT unique — the primary key is (pipe_id, from_node, to_node).

    So one pipe_id can name several edges, and every one of them must contribute its
    downstream. An implementation that did `SELECT ... LIMIT 1` would silently under-report
    which customers lose water, which is the worst possible way for this to be wrong.
    """
    with psycopg.connect(timescale_dsn) as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO pipe_edge (pipe_id, from_node, to_node, dma, x1,y1,x2,y2) VALUES "
            "('DUP','src','dupA','DMA-DUP',0,0,1,1),"
            "('DUP','src','dupB','DMA-DUP',0,0,2,2) ON CONFLICT DO NOTHING"
        )
        cur.execute(
            "INSERT INTO customer_service_point (customer_id, node, area, branch) VALUES "
            "('DUP-1','dupA','ต.ทดสอบ','สมุทรสาคร'),"
            "('DUP-2','dupB','ต.ทดสอบ','สมุทรสาคร') ON CONFLICT DO NOTHING"
        )
        conn.commit()
    try:
        pool = ConnectionPool(timescale_dsn, min_size=1, max_size=2, open=True)
        try:
            impact = downstream_customers(pool, "DUP")
            assert {c.customer_id for c in impact.customers} == {"DUP-1", "DUP-2"}
        finally:
            pool.close()
    finally:
        with psycopg.connect(timescale_dsn) as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM customer_service_point WHERE customer_id LIKE 'DUP-%'")
            cur.execute("DELETE FROM pipe_edge WHERE dma = 'DMA-DUP'")
            conn.commit()


# ── topology read ─────────────────────────────────────────────────────────────────────


def test_load_topology_returns_placed_devices_pipes_and_nodes(pool: ConnectionPool) -> None:
    topo = load_topology(pool)
    assert topo.pipes, "no pipes"
    assert topo.devices, "no devices placed on the schematic"
    node_ids = {n.node for n in topo.nodes}
    for pipe in topo.pipes:
        assert pipe.from_node in node_ids and pipe.to_node in node_ids
        assert pipe.x1 is not None and pipe.x2 is not None
    for device in topo.devices:
        assert device.node in node_ids
        assert device.x is not None and device.y is not None


# ── the upgrade path an EXISTING demo volume actually takes ───────────────────────────


@pytest.mark.timeout(60)
def test_reseed_retires_legacy_edges_and_keeps_operator_edges(timescale_dsn: str) -> None:
    """Re-seeding over a pre-S4a volume must leave exactly the current line — and nothing
    an operator added.

    Both halves failed review. The first version deleted by `pipe_id` alone, which does not
    match the legacy rows (they share ids with the new ones but use a "P2" node) and DOES
    match the new ones — so the legacy edges survived with NULL geometry and the topology
    route 500'd on `float(None)`, on upgraded volumes only. The same statement would also
    have deleted any DMA-03 edge an operator added by hand: a seed may retire what it wrote,
    never what it does not own.
    """
    legacy = [
        ("PIPE-INTAKE", "intake", "P2"),
        ("PIPE-P2-TANK", "P2", "tank"),
        ("PIPE-TANK-N1", "tank", "n1"),
    ]
    with psycopg.connect(timescale_dsn) as conn, conn.cursor() as cur:
        # A pre-S4a volume: legacy edges, no geometry.
        cur.executemany(
            "INSERT INTO pipe_edge (pipe_id, from_node, to_node, dma) VALUES (%s,%s,%s,'DMA-03') "
            "ON CONFLICT DO NOTHING",
            legacy,
        )
        # ...plus something this seed does not own.
        cur.execute(
            "INSERT INTO pipe_edge (pipe_id, from_node, to_node, dma, x1,y1,x2,y2) "
            "VALUES ('OP-EXTRA','tank','opnode','DMA-03',1,1,2,2) ON CONFLICT DO NOTHING"
        )
        conn.commit()

    env = {**os.environ, "DATABASE_URL": timescale_dsn}
    subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "seed_db.py")],
        env=env, capture_output=True, text=True, check=True, timeout=300,
    )

    try:
        with psycopg.connect(timescale_dsn) as conn, conn.cursor() as cur:
            cur.execute("SELECT pipe_id, from_node, to_node FROM pipe_edge WHERE dma = 'DMA-03'")
            edges = {tuple(row) for row in cur.fetchall()}
            cur.execute(
                "SELECT count(*) FROM pipe_edge "
                "WHERE x1 IS NULL OR y1 IS NULL OR x2 IS NULL OR y2 IS NULL"
            )
            geom_row = cur.fetchone()
            assert geom_row is not None
            null_geometry = geom_row[0]

        legacy_nodes = {n for _pid, frm, to in edges for n in (frm, to) if n == "P2"}
        assert not legacy_nodes, f"legacy P2 edge survived: {edges}"
        assert ("PIPE-TANK-N1", "tank", "n1") not in edges, "retired edge survived"
        assert ("OP-EXTRA", "tank", "opnode") in edges, (
            "the seed deleted an edge it does not own"
        )
        assert null_geometry == 0, "an edge without geometry would 500 the topology route"
    finally:
        with psycopg.connect(timescale_dsn) as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM pipe_edge WHERE pipe_id = 'OP-EXTRA'")
            conn.commit()
