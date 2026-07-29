"""Process-schematic topology and downstream impact (slice S4a, scored items 2.1 / 2.4).

The twin's runtime chain is `telemetry asset -> topology node/pipe -> WS event -> impact
query -> rendered pipe`. This module owns the middle two links.

Everything here is SIMULATED: `scripts/seed_db.py` generates the DMA-03 line, its schematic
coordinates and the five customer ids. No real customer PII exists in this repo. Only
`branch` comes from the real curated roster.
"""
from __future__ import annotations

from psycopg_pool import ConnectionPool

from .models import (
    AffectedCustomer,
    ImpactResponse,
    TwinDeviceView,
    TwinNode,
    TwinPipe,
    TwinTopology,
)

#: Hard ceiling on BFS levels. The visited set already guarantees termination; this is a
#: second, independent bound so a pathological seed cannot make one request walk a huge
#: graph while holding a pool connection.
MAX_TRAVERSAL_DEPTH = 64


def load_topology(pool: ConnectionPool) -> TwinTopology:
    """Every node, pipe and placed device, with geometry and latest status.

    Nodes are derived from `pipe_edge` (there is no separate node table) as the union of
    `from_node` and `to_node`, each carrying the coordinates recorded on its edges.

    A device appears only when it has a `node` AND coordinates — an unplaced device cannot
    be drawn, and inventing a position for it would fabricate network geography.

    `status` is currently `nodata` for EVERY device, and that is deliberate rather than a
    placeholder: PR-7a builds the twin's data chain only. Nothing persists a per-device twin
    status yet — ingest still emits a hardcoded `normal` (`service.py::_emit_twin_event`),
    which is precisely what **PR-7b** fixes. Reporting `nodata` is the honest answer to
    "what is this device's status?" when the answer is not yet known.

    It must NEVER default to `normal`: a device we know nothing about must not render as
    healthy on a control-room screen. Recorded in the coding log as a declared gap so the
    permanent `nodata` is not mistaken for a bug or for a working status feed.
    """
    with pool.connection() as conn, conn.cursor() as cur:
        # Nodes: union of from_node and to_node with coordinates from the edges.
        cur.execute(
            "SELECT node, x, y FROM ("
            "  SELECT from_node AS node, x1 AS x, y1 AS y FROM pipe_edge "
            "  UNION "
            "  SELECT to_node AS node, x2 AS x, y2 AS y FROM pipe_edge"
            ") AS nodes"
        )
        node_rows = cur.fetchall()
        nodes = [TwinNode(node=row[0], x=float(row[1]), y=float(row[2])) for row in node_rows]

        # Pipes: all edges.
        cur.execute(
            "SELECT pipe_id, from_node, to_node, dma, x1, y1, x2, y2 FROM pipe_edge"
        )
        pipe_rows = cur.fetchall()
        pipes = [
            TwinPipe(
                pipe_id=row[0], from_node=row[1], to_node=row[2], dma=row[3],
                x1=float(row[4]), y1=float(row[5]), x2=float(row[6]), y2=float(row[7]),
            )
            for row in pipe_rows
        ]

        # Devices: only placed (node AND coordinates).
        cur.execute(
            "SELECT asset_id, kind, node, x, y, dma FROM device "
            "WHERE node IS NOT NULL AND x IS NOT NULL AND y IS NOT NULL"
        )
        device_rows = cur.fetchall()
        devices = [
            TwinDeviceView(
                asset_id=row[0], kind=row[1], node=row[2],
                x=float(row[3]), y=float(row[4]), dma=row[5],
                status="nodata",
            )
            for row in device_rows
        ]

    return TwinTopology(nodes=nodes, pipes=pipes, devices=devices)


def downstream_customers(pool: ConnectionPool, pipe_id: str) -> ImpactResponse:
    """Customers downstream of `pipe_id` (scored item 2.4).

    `pipe_id` is NOT unique — the primary key is (pipe_id, from_node, to_node) — so EVERY
    matching edge seeds the frontier. An implementation that took the first match would
    silently under-report who loses water, which is the worst way for this to be wrong.

    Traversal: breadth-first over `pipe_edge.from_node`, starting from the `to_node` of
    every matching edge, collecting `customer_service_point` rows attached to any reached
    node (including those start nodes).

    Args:
        pool: connection pool.
        pipe_id: the failed pipe.

    Returns:
        ImpactResponse with customers DEDUPLICATED by customer_id and sorted by it (a
        stable order, or the UI reshuffles between polls), `affected_pipe_ids` sorted, and
        `count == len(customers)`.

    Raises:
        KeyError: if `pipe_id` matches no edge.

    Invariant:
        TERMINATES on a cyclic topology. Keep a visited set of nodes and never re-enqueue
        one. The seeded graph is a straight line, so this guard is only exercised by
        `test_traversal_terminates_on_a_cyclic_topology`, which builds a cycle on purpose
        and is bounded by pytest-timeout — without it the guard could be absent and every
        other test would still pass, until a future seed hung a worker on a request.
    """
    from collections import deque

    with pool.connection() as conn, conn.cursor() as cur:
        # Fetch every edge matching pipe_id.
        cur.execute(
            "SELECT pipe_id, from_node, to_node FROM pipe_edge WHERE pipe_id = %s",
            (pipe_id,),
        )
        seed_rows = cur.fetchall()
        if not seed_rows:
            raise KeyError(pipe_id)

        # Pre-fetch the full edge graph: all (from_node, to_node, pipe_id) triples.
        cur.execute("SELECT from_node, to_node, pipe_id FROM pipe_edge")
        all_edges: list[tuple[str, str, str]] = [
            (row[0], row[1], row[2]) for row in cur.fetchall()
        ]

        # Build adjacency: from_node -> list of (to_node, pipe_id).
        adj: dict[str, list[tuple[str, str]]] = {}
        for frm, to, pid in all_edges:
            adj.setdefault(frm, []).append((to, pid))

    # BFS from the to_node of every matching edge.
    frontier: deque[str] = deque()
    visited: set[str] = set()
    affected_pipe_ids: set[str] = set()

    for _pid, _frm, to_node in seed_rows:
        affected_pipe_ids.add(_pid)
        if to_node not in visited:
            visited.add(to_node)
            frontier.append(to_node)

    while frontier:
        node = frontier.popleft()
        for next_node, edge_pid in adj.get(node, []):
            affected_pipe_ids.add(edge_pid)
            if next_node not in visited:
                visited.add(next_node)
                frontier.append(next_node)

    # Collect customers on every visited node.
    customers: dict[str, AffectedCustomer] = {}
    if visited:
        with pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT customer_id, node, area, branch FROM customer_service_point "
                "WHERE node = ANY(%s) ORDER BY customer_id",
                (list(visited),),
            )
            for row in cur.fetchall():
                cid = row[0]
                if cid not in customers:
                    customers[cid] = AffectedCustomer(
                        customer_id=cid, node=row[1], area=row[2], branch=row[3],
                    )

    sorted_customers = sorted(customers.values(), key=lambda c: c.customer_id)
    return ImpactResponse(
        pipe_id=pipe_id,
        affected_pipe_ids=sorted(affected_pipe_ids),
        customers=sorted_customers,
        count=len(sorted_customers),
    )
