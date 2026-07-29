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


def _topology() -> tuple[list[tuple[str, str, str, str]], list[tuple[str, str, str, str]]]:
    """DMA-03 line: intake -> P-2 -> tank -> n1 -> n2 (customers downstream of n1/n2)."""
    pipes = [
        ("PIPE-INTAKE", "intake", "P2", "DMA-03"),
        ("PIPE-P2-TANK", "P2", "tank", "DMA-03"),
        ("PIPE-TANK-N1", "tank", "n1", "DMA-03"),
        ("PIPE-N1-N2", "n1", "n2", "DMA-03"),
    ]
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
        cur.executemany(
            "INSERT INTO pipe_edge (pipe_id, from_node, to_node, dma) "
            "VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING",
            pipes,
        )
        cur.executemany(
            "INSERT INTO customer_service_point (customer_id, node, area, branch) "
            "VALUES (%s,%s,%s,%s) ON CONFLICT (customer_id) DO NOTHING",
            customers,
        )
        conn.commit()
    print(f"seeded: {len(devices)} devices, {len(pipes)} pipes, {len(customers)} customers")


if __name__ == "__main__":
    main()
