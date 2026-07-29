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

from app.topology import downstream_customers, load_topology

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]

#: Hand-computed from `scripts/seed_db.py::_topology`: the line is
#: intake -> P-2 -> tank -> V-9 -> n1 -> n2, and customers alternate n1/n2 over 1..5,
#: so n1 holds 00001/00003/00005 and n2 holds 00002/00004.
ALL_CUSTOMERS = {f"72-1-{n:05d}" for n in range(1, 6)}
N2_CUSTOMERS = {"72-1-00002", "72-1-00004"}


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
    assert {c.customer_id for c in impact.customers} == ALL_CUSTOMERS
    assert impact.count == len(impact.customers) == 5


def test_downstream_of_the_last_leg_reaches_only_its_own_node(pool: ConnectionPool) -> None:
    """The discriminating case. A traversal that ignored direction, or that returned every
    customer regardless, would pass the test above and fail this one."""
    impact = downstream_customers(pool, "PIPE-N1-N2")
    assert {c.customer_id for c in impact.customers} == N2_CUSTOMERS
    assert impact.count == 2


def test_customers_are_deduplicated_and_deterministically_ordered(pool: ConnectionPool) -> None:
    impact = downstream_customers(pool, "PIPE-TANK-V9")
    ids = [c.customer_id for c in impact.customers]
    assert ids == sorted(ids), "ordering must be stable, or the UI reshuffles between polls"
    assert len(ids) == len(set(ids))


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
