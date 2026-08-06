"""Process-schematic topology and downstream impact (slice S4a, scored items 2.1 / 2.4).

The twin's runtime chain is `telemetry asset -> topology node/pipe -> WS event -> impact
query -> rendered pipe`. This module owns the middle two links.

Everything here is SIMULATED: `scripts/seed_db.py` generates the DMA-03 line, its schematic
coordinates and the 200 Map Ta Phut customer ids (PR-I). No real customer PII exists in this
repo. Only `branch` comes from the real curated roster.
"""
from __future__ import annotations

from collections import Counter

from psycopg_pool import ConnectionPool
from pwa_ml.predict import CRITICAL_BELOW, WARNING_BELOW

from .health_store import latest_statuses
from .models import (
    AffectedCustomer,
    DemoCustomerDetail,
    DemoMeterReading,
    ImpactResponse,
    ImpactZoneCollection,
    ImpactZoneFeature,
    TwinDeviceView,
    TwinNode,
    TwinPipe,
    TwinTopology,
    TypeBreakdown,
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

    `status` is the device's latest PERSISTED health status (`health_store.latest_statuses`),
    or `nodata` when it has none. It must NEVER default to `normal`: a device we know nothing
    about must not render as healthy on a control-room screen.

    The status lookup runs AFTER this function's device-query connection is released.
    `latest_statuses` acquires its own connection, so looking it up while still holding one
    would deadlock a min-size-1 pool — `test_topology_status` runs against exactly such a
    pool to prove it does not.

    Only slower model *health* status is persisted; instantaneous per-reading band status is
    live-only, over `WS /ws/twin` (see `service.py::_emit_twin_event`), so a device with a
    band anomaly but no health row yet shows `nodata` until its next live frame — honest, and
    the frame arrives within a tick.
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

    # Connection released above. Only NOW look up statuses — latest_statuses acquires its
    # own connection, and a min-size-1 pool would deadlock if we held one here.
    asset_ids = [row[0] for row in device_rows]
    statuses = latest_statuses(
        pool, asset_ids, warning_below=WARNING_BELOW, critical_below=CRITICAL_BELOW
    )
    devices = [
        TwinDeviceView(
            asset_id=row[0], kind=row[1], node=row[2],
            x=float(row[3]), y=float(row[4]), dma=row[5],
            status=statuses.get(row[0], "nodata"),
        )
        for row in device_rows
    ]

    return TwinTopology(nodes=nodes, pipes=pipes, devices=devices)


def downstream_customers(
    pool: ConnectionPool,
    pipe_id: str,
    *,
    enriched: bool = False,
    profile_version: str | None = None,
) -> ImpactResponse:
    """Customers downstream of `pipe_id` (scored item 2.4).

    When `enriched` (the Map Ta Phut feature is on), each customer carries its profile
    type/subtype/account/meter and latest monthly usage, and the response gains `zone` +
    `type_breakdown`; only accounts of `profile_version` are returned. When not enriched, the
    basic service-point shape is returned and the enriched fields stay `None`.

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

    # Collect customers on every visited node — enriched (profiled MTP accounts) or basic.
    nodes = list(visited)
    if enriched:
        customers, zone = _collect_enriched(pool, nodes, profile_version)
        breakdown: TypeBreakdown | None = _build_type_breakdown(customers)
    else:
        customers, zone, breakdown = _collect_basic(pool, nodes), None, None

    return ImpactResponse(
        pipe_id=pipe_id,
        affected_pipe_ids=sorted(affected_pipe_ids),
        customers=customers,
        count=len(customers),
        zone=zone,
        type_breakdown=breakdown,
    )


def _collect_basic(pool: ConnectionPool, nodes: list[str]) -> list[AffectedCustomer]:
    """Every service point on a visited node, deduped and sorted by id (the pre-PR-I shape).

    Deliberately NOT profile-scoped: a service point downstream of a failed pipe genuinely loses
    water, so this is the honest item-2.4 answer. In the shipped demo `scripts/seed_db.py` is the
    sole writer of `customer_service_point` and lands exactly the 200 Map Ta Phut accounts on the
    line (the five legacy rows are deleted, nothing else is added), so this returns 200/80 — the
    same set the enriched path scopes by `profile_version`. The two counts can differ only if a
    non-MTP service point is manually placed on the line, a state the seed never produces.
    """
    seen: dict[str, AffectedCustomer] = {}
    if nodes:
        with pool.connection() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT customer_id, node, area, branch FROM customer_service_point "
                "WHERE node = ANY(%s) ORDER BY customer_id",
                (nodes,),
            )
            for row in cur.fetchall():
                if row[0] not in seen:
                    seen[row[0]] = AffectedCustomer(
                        customer_id=row[0], node=row[1], area=row[2], branch=row[3]
                    )
    return sorted(seen.values(), key=lambda c: c.customer_id)


#: INNER JOIN the profile (so only profiled accounts of the active version appear) and take the
#: newest reading per customer via a LATERAL LIMIT 1 — a plain join to 12 readings would multiply
#: every customer by twelve (Codex FN5). One row per affected account.
_ENRICHED_IMPACT_QUERY = (
    "SELECT csp.customer_id, csp.node, csp.area, csp.branch, dcp.type_code, dcp.subtype_code, "
    "       dcp.account_no, dcp.meter_no, latest.usage_m3, dcp.pressure_zone_id "
    "FROM customer_service_point csp "
    "JOIN demo_customer_profile dcp "
    "  ON dcp.customer_id = csp.customer_id AND dcp.profile_version = %s "
    "LEFT JOIN LATERAL ("
    "  SELECT usage_m3 FROM demo_customer_meter_reading r "
    "  WHERE r.customer_id = csp.customer_id ORDER BY r.period DESC LIMIT 1"
    ") latest ON TRUE "
    "WHERE csp.node = ANY(%s) ORDER BY csp.customer_id"
)


def _collect_enriched(
    pool: ConnectionPool, nodes: list[str], profile_version: str | None
) -> tuple[list[AffectedCustomer], str | None]:
    """Profiled Map Ta Phut accounts on the visited nodes, each with its latest usage."""
    seen: dict[str, AffectedCustomer] = {}
    zone: str | None = None
    if nodes and profile_version:
        with pool.connection() as conn, conn.cursor() as cur:
            cur.execute(_ENRICHED_IMPACT_QUERY, (profile_version, nodes))
            for row in cur.fetchall():
                if row[0] in seen:
                    continue
                zone = row[9]
                seen[row[0]] = AffectedCustomer(
                    customer_id=row[0], node=row[1], area=row[2], branch=row[3],
                    type_code=row[4], subtype_code=row[5], account_no=row[6],
                    meter_no=row[7], latest_usage_m3=row[8],
                )
    return sorted(seen.values(), key=lambda c: c.customer_id), zone


def _build_type_breakdown(customers: list[AffectedCustomer]) -> TypeBreakdown:
    """Distinct affected accounts per top-level type. Sums to `len(customers)`."""
    counts = Counter(c.type_code for c in customers)
    return TypeBreakdown(
        type_1=counts.get(1, 0), type_2=counts.get(2, 0), type_3=counts.get(3, 0)
    )


def get_demo_customer_detail(
    pool: ConnectionPool, customer_id: str, *, profile_version: str
) -> DemoCustomerDetail:
    """One simulated Map Ta Phut account + its 12 monthly readings (PR-I, item 2.4).

    Reads only `demo_customer_profile` of the active `profile_version`, so it can never surface
    a non-demo customer.

    Raises:
        KeyError: no demo profile of that version has `customer_id` (route → 404).
        ValueError: the stored history is not exactly 12 months (fail-closed data integrity).
    """
    with pool.connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT p.customer_id, p.account_no, p.meter_no, p.type_code, p.subtype_code, "
            "p.meter_size, p.pressure_zone_id, p.address_label, c.area, c.branch, "
            "p.profile_version FROM demo_customer_profile p "
            "JOIN customer_service_point c ON c.customer_id = p.customer_id "
            "WHERE p.customer_id = %s AND p.profile_version = %s",
            (customer_id, profile_version),
        )
        prow = cur.fetchone()
        if prow is None:
            raise KeyError(customer_id)
        cur.execute(
            "SELECT period, previous_reading_m3, reading_m3, usage_m3 "
            "FROM demo_customer_meter_reading WHERE customer_id = %s ORDER BY period",
            (customer_id,),
        )
        reading_rows = cur.fetchall()
    if len(reading_rows) != 12:
        raise ValueError(f"{customer_id} has {len(reading_rows)} readings, expected 12")
    readings = [
        DemoMeterReading(period=r[0], previous_reading_m3=r[1], reading_m3=r[2], usage_m3=r[3])
        for r in reading_rows
    ]
    # The DB CHECK is per-row only; a non-generator write could store 12 rows that don't chain.
    # Fail closed on a discontinuity rather than serve a corrupt history (g2-qcheck round 2).
    for earlier, later in zip(readings, readings[1:], strict=False):
        if later.previous_reading_m3 != earlier.reading_m3:
            raise ValueError(f"{customer_id} readings are not continuous at {later.period}")
    return DemoCustomerDetail(
        customer_id=prow[0], account_no=prow[1], meter_no=prow[2], type_code=prow[3],
        subtype_code=prow[4], meter_size=prow[5], pressure_zone_id=prow[6],
        address_label=prow[7], area=prow[8], branch=prow[9], profile_version=prow[10],
        readings=readings,
    )


#: The simulated low-pressure footprint served by the impact-zone route. A COARSE polygon around
#: the demo Map Ta Phut zone — a geographic area, never a customer point, and never the real pipe
#: geometry — so it can be shown without the permission-gated GIS bundle. scenario_id equals the
#: profile version (map_ta_phut_customer_profile.MTP_PROFILE_VERSION).
MTP_IMPACT_ZONE = ImpactZoneCollection(
    type="FeatureCollection",
    scenario_id="mtp-low-pressure-200-v1",
    zone_id="MTP-LPZ-01",
    provenance="SIMULATED_LOW_PRESSURE_FOOTPRINT",
    features=[
        ImpactZoneFeature(
            type="Feature",
            properties={
                "zone_id": "MTP-LPZ-01",
                "label": "พื้นที่แรงดันต่ำจำลอง",
                "simulated": True,
            },
            geometry={
                "type": "Polygon",
                "coordinates": [
                    [
                        [101.135, 12.665], [101.175, 12.665], [101.175, 12.700],
                        [101.135, 12.700], [101.135, 12.665],
                    ]
                ],
            },
        )
    ],
)


def load_impact_zone(scenario_id: str) -> ImpactZoneCollection:
    """The simulated low-pressure footprint for a known scenario.

    Raises:
        KeyError: unknown scenario_id (route → 404).
    """
    if scenario_id != MTP_IMPACT_ZONE.scenario_id:
        raise KeyError(scenario_id)
    return MTP_IMPACT_ZONE
