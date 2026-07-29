"""Seed the demo DB from real PWA data + a synthetic-but-labelled DMA topology.

Owned by S0 (Codex #10): all seeds land before feature slices.
- device roster: imported from `simulator/app/roster.py` (slice S1). It is NOT
  re-derived here. `telemetry.asset_id` carries a foreign key to `device.asset_id`,
  so a second derivation that drifted by one character would dead-letter every
  published message while the pipeline still looked healthy.
- pipe topology + customers: synthetic DMA-03 topology for the twin demo
  (SIMULATED — no real customer PII; nodes/customers are generated).

Idempotent: ON CONFLICT DO NOTHING. Run after `docker compose up` (DB healthy):
    DATABASE_URL=postgresql://pwa:pwa@localhost:5433/pwa python scripts/seed_db.py
"""
from __future__ import annotations

import os
import pathlib
import sys

import psycopg

ROOT = pathlib.Path(__file__).resolve().parent.parent
# The roster lives in the simulator package; producer and seed must agree exactly.
sys.path.insert(0, str(ROOT / "simulator"))

from app.config import get_settings  # noqa: E402
from app.models import Device  # noqa: E402
from app.roster import DEMO_BRANCH, load_devices  # noqa: E402


def curated_path() -> pathlib.Path:
    """The CSV both the seed and the simulator must read.

    Resolved through the same `CURATED_PATH` setting the simulator uses, so an
    operator who repoints the simulator at a revised roster cannot end up seeding
    `device` from one file while publishing asset_ids derived from another.
    """
    return get_settings().curated_path

#: Column order for the `device` INSERT. The SQL statement and the value tuples are
#: BOTH generated from this one sequence, so they cannot drift out of alignment — a
#: positional mismatch here would silently swap branch and province on every row.
DEVICE_COLUMNS: tuple[str, ...] = ("asset_id", "kind", "branch", "province", "region", "dma")

DEVICE_INSERT = (
    f"INSERT INTO device ({', '.join(DEVICE_COLUMNS)}) "
    f"VALUES ({', '.join(['%s'] * len(DEVICE_COLUMNS))}) "
    "ON CONFLICT (asset_id) DO NOTHING"
)


def device_rows(devices: list[Device] | None = None) -> list[tuple[object, ...]]:
    """Project the roster into positional tuples matching `DEVICE_COLUMNS`."""
    source = devices if devices is not None else load_devices(curated_path())
    return [tuple(getattr(dev, column) for column in DEVICE_COLUMNS) for dev in source]


#: Schematic coordinates for every topology node, in a unitless 0..1000 x 0..400 space.
#:
#: These are DIAGRAM coordinates, not GIS. The twin is a process schematic; a geographic
#: map is a different screen with a real coordinate source. Keeping them in the database
#: rather than in the component is what lets `ProcessSchematic` be data-driven — CLAUDE.md
#: forbids a component that bakes in its own values.
NODE_LAYOUT: dict[str, tuple[float, float]] = {
    "intake": (60.0, 200.0),
    # The pump's node id is its asset_id EXACTLY. Before slice S4a this was "P2" while the
    # roster published "P-2", so every device->topology join returned nothing and no device
    # could be placed on the schematic. The module docstring said "P-2" all along; the code
    # did not. `test_topology.py::test_every_device_node_exists_in_the_pipe_graph` now fails
    # if they ever diverge again.
    "P-2": (240.0, 200.0),
    "tank": (440.0, 200.0),
    "V-9": (620.0, 200.0),
    "n1": (800.0, 130.0),
    "n2": (940.0, 130.0),
}

#: Edges written by a PREVIOUS version of this seed that the current line no longer
#: describes, as exact (pipe_id, from_node, to_node) triples.
#:
#: The pre-S4a line was intake -> P2 -> tank -> n1 -> n2, using a "P2" node that no device
#: could join to. Its rows share `pipe_id` values with the current line, so they can only be
#: retired by matching the full primary key. Listing them explicitly also means this seed
#: deletes exactly what it once wrote and nothing else.
RETIRED_EDGES: list[tuple[str, str, str]] = [
    ("PIPE-INTAKE", "intake", "P2"),
    ("PIPE-P2-TANK", "P2", "tank"),
    ("PIPE-TANK-N1", "tank", "n1"),
]

#: Devices that sit ON the seeded DMA-03 line, mapped to their node.
#: P-1 (DMA-01) and M-3 (DMA-02) are deliberately absent: they belong to other DMAs, and
#: inventing topology for them would fabricate a network that does not exist.
DEVICE_NODES: dict[str, str] = {"P-2": "P-2", "V-9": "V-9"}


def _topology() -> tuple[list[tuple[object, ...]], list[tuple[str, str, str, str]]]:
    """DMA-03 line: intake -> P-2 -> tank -> V-9 -> n1 -> n2.

    Customers hang off n1 and n2, so a pressure drop upstream of either has a real,
    computable set of affected service points (scored item 2.4).

    SIMULATED: the topology, the coordinates and the five customer ids are all generated.
    No real customer PII is present. Only `branch` comes from the real curated roster.
    """
    edges = [
        ("PIPE-INTAKE", "intake", "P-2"),
        ("PIPE-P2-TANK", "P-2", "tank"),
        ("PIPE-TANK-V9", "tank", "V-9"),
        ("PIPE-V9-N1", "V-9", "n1"),
        ("PIPE-N1-N2", "n1", "n2"),
    ]
    pipes: list[tuple[object, ...]] = []
    for pipe_id, from_node, to_node in edges:
        x1, y1 = NODE_LAYOUT[from_node]
        x2, y2 = NODE_LAYOUT[to_node]
        pipes.append((pipe_id, from_node, to_node, "DMA-03", x1, y1, x2, y2))

    customers = [
        (f"72-1-{n:05d}", "n1" if n % 2 else "n2", "ต.ท่าจีน", DEMO_BRANCH)
        for n in range(1, 6)
    ]
    return pipes, customers


def main() -> None:
    dsn = os.environ.get("DATABASE_URL", "postgresql://pwa:pwa@localhost:5433/pwa")
    devices = device_rows()
    pipes, customers = _topology()
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.executemany(DEVICE_INSERT, devices)
        # DO UPDATE, not DO NOTHING: an existing demo volume already holds the pre-S4a
        # rows, which carry no geometry (and, for the pump, the wrong node id). A
        # do-nothing upsert would leave that volume permanently unable to draw the twin,
        # and the symptom — an empty schematic — looks like a frontend bug.
        cur.executemany(
            "INSERT INTO pipe_edge (pipe_id, from_node, to_node, dma, x1, y1, x2, y2) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s) "
            "ON CONFLICT (pipe_id, from_node, to_node) DO UPDATE SET "
            "dma = EXCLUDED.dma, x1 = EXCLUDED.x1, y1 = EXCLUDED.y1, "
            "x2 = EXCLUDED.x2, y2 = EXCLUDED.y2",
            pipes,
        )
        # Remove ONLY the exact edges the pre-S4a seed wrote and this one no longer
        # describes. Two mistakes are deliberately avoided here:
        #
        #   1. Deleting by `pipe_id` alone does not work AND is not safe. The legacy line
        #      used the same ids (`PIPE-INTAKE`, `PIPE-P2-TANK`) with a "P2" node, so an
        #      id-based filter matches the NEW rows too and leaves the legacy ones behind —
        #      with NULL geometry, because 006 adds those columns nullable. The topology
        #      route would then read a NULL coordinate and 500 on an upgraded volume while
        #      passing on every fresh one.
        #   2. `DELETE ... WHERE dma='DMA-03' AND pipe_id <> ALL(...)` would also remove any
        #      edge an operator added to DMA-03 by hand. A seed may retire what it wrote; it
        #      must not delete what it does not own.
        #
        # So: an explicit, exact triple list of the retired edges.
        cur.executemany(
            "DELETE FROM pipe_edge WHERE pipe_id = %s AND from_node = %s AND to_node = %s",
            RETIRED_EDGES,
        )
        cur.executemany(
            "INSERT INTO customer_service_point (customer_id, node, area, branch) "
            "VALUES (%s,%s,%s,%s) ON CONFLICT (customer_id) DO NOTHING",
            customers,
        )
        # Place the devices that sit on the line. Same reasoning as the pipes: an existing
        # volume already has these rows, so this must UPDATE rather than skip.
        cur.executemany(
            "UPDATE device SET node = %s, x = %s, y = %s WHERE asset_id = %s",
            [
                (node, NODE_LAYOUT[node][0], NODE_LAYOUT[node][1], asset_id)
                for asset_id, node in DEVICE_NODES.items()
            ],
        )
        conn.commit()
    print(f"seeded: {len(devices)} devices, {len(pipes)} pipes, {len(customers)} customers")


if __name__ == "__main__":
    main()
