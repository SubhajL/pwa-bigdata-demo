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
from app.roster import load_devices  # noqa: E402

# scripts/ is on sys.path (this file's directory) when run as `python scripts/seed_db.py`.
from map_ta_phut_customer_profile import (  # noqa: E402
    DemoCustomerProfileSeed,
    DemoMeterReadingSeed,
    build_map_ta_phut_profiles,
    build_monthly_readings,
    validate_demo_customer_profile,
)


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

#: The five legacy Samut Sakhon demo service points this seed once wrote, as the COMPLETE owned
#: set. They are deleted and REPLACED by the 200 Map Ta Phut accounts — never restored as a
#: fallback (PR-I: "no five-row fallback"). Listed explicitly so the seed retires exactly what it
#: owns and nothing an operator added, the same discipline as RETIRED_EDGES.
RETIRED_CUSTOMERS: list[str] = [f"72-1-{n:05d}" for n in range(1, 6)]

#: Devices that sit ON the seeded DMA-03 line, mapped to their node.
#: P-1 (DMA-01) and M-3 (DMA-02) are deliberately absent: they belong to other DMAs, and
#: inventing topology for them would fabricate a network that does not exist.
DEVICE_NODES: dict[str, str] = {"P-2": "P-2", "V-9": "V-9"}


def _topology() -> list[tuple[object, ...]]:
    """DMA-03 line: intake -> P-2 -> tank -> V-9 -> n1 -> n2.

    The 200 Map Ta Phut accounts hang off n1 (120) and n2 (80) — seeded by
    `seed_demo_customer_profiles`, NOT here — so an upstream-corridor pressure drop reaches all
    200 and the last leg (PIPE-N1-N2) reaches only its 80 (scored item 2.4).

    SIMULATED: the topology and coordinates are generated. Only `branch` on the real devices
    comes from the curated roster. This function produces NO customer rows.
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
    return pipes


def seed_demo_customer_profiles(
    cur: psycopg.Cursor[tuple[object, ...]],
    profiles: list[DemoCustomerProfileSeed],
    readings: list[DemoMeterReadingSeed],
) -> None:
    """Retire the five owned legacy rows and seed the 200 Map Ta Phut accounts + 2,400 readings.

    Deletes ONLY `RETIRED_CUSTOMERS` (the complete owned set) — a seed retires what it wrote,
    never a row it does not own. Idempotent: every insert is ON CONFLICT DO NOTHING, so a re-run
    lands the same 200/2,400 with no churn. Parent order is service point -> profile -> reading,
    matching the migration-007 foreign keys.
    """
    cur.execute(
        "DELETE FROM customer_service_point WHERE customer_id = ANY(%s)",
        (RETIRED_CUSTOMERS,),
    )
    cur.executemany(
        "INSERT INTO customer_service_point (customer_id, node, area, branch) "
        "VALUES (%s,%s,%s,%s) ON CONFLICT (customer_id) DO NOTHING",
        [(p.customer_id, p.node, p.area, p.branch) for p in profiles],
    )
    cur.executemany(
        "INSERT INTO demo_customer_profile (customer_id, account_no, meter_no, type_code, "
        "subtype_code, meter_size, pressure_zone_id, address_label, profile_version, simulated) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (customer_id) DO NOTHING",
        [
            (p.customer_id, p.account_no, p.meter_no, p.type_code, p.subtype_code, p.meter_size,
             p.pressure_zone_id, p.address_label, p.profile_version, p.simulated)
            for p in profiles
        ],
    )
    cur.executemany(
        "INSERT INTO demo_customer_meter_reading "
        "(customer_id, period, previous_reading_m3, reading_m3, usage_m3) "
        "VALUES (%s,%s,%s,%s,%s) ON CONFLICT (customer_id, period) DO NOTHING",
        [
            (r.customer_id, r.period, r.previous_reading_m3, r.reading_m3, r.usage_m3)
            for r in readings
        ],
    )


def main() -> None:
    dsn = os.environ.get("DATABASE_URL", "postgresql://pwa:pwa@localhost:5433/pwa")
    devices = device_rows()
    pipes = _topology()
    profiles = build_map_ta_phut_profiles()
    readings = build_monthly_readings(profiles)
    # Fail-closed BEFORE opening a write transaction: a drifted count/mix/prefix aborts the seed.
    validate_demo_customer_profile(profiles, readings)
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
        # Retire the five legacy service points and seed the 200 Map Ta Phut accounts + readings.
        seed_demo_customer_profiles(cur, profiles, readings)
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
    print(
        f"seeded: {len(devices)} devices, {len(pipes)} pipes, "
        f"{len(profiles)} customers, {len(readings)} readings"
    )


if __name__ == "__main__":
    main()
