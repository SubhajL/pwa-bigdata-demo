"""Seed the demo DB from real PWA data + a synthetic-but-labelled DMA topology.

Owned by S0 (Codex #10): all seeds land before feature slices.
- device roster: one representative pump per real branch (from data/curated),
  plus the named devices the demo scenarios reference at สมุทรสาคร.
- pipe topology + customers: synthetic DMA-03 topology for the twin demo
  (SIMULATED — no real customer PII; nodes/customers are generated).

Idempotent: ON CONFLICT DO NOTHING. Run after `docker compose up` (DB healthy):
    DATABASE_URL=postgresql://pwa:pwa@localhost:5433/pwa python scripts/seed_db.py
"""
from __future__ import annotations

import csv
import os
import pathlib

import psycopg

ROOT = pathlib.Path(__file__).resolve().parent.parent
CURATED = ROOT / "data" / "curated" / "water_sold_by_branch.csv"
DEMO_BRANCH = "สมุทรสาคร"


def _branch_index() -> dict[str, tuple[int, str]]:
    """branch -> (region, province) from the latest month of curated data."""
    idx: dict[str, tuple[int, str]] = {}
    with CURATED.open(encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            idx[row["branch"]] = (int(row["region"]), row["province"])
    return idx


def _devices(idx: dict[str, tuple[int, str]]) -> list[tuple[str, str, str, str, int, str | None]]:
    rows: list[tuple[str, str, str, str, int, str | None]] = []
    # one representative pump per real branch — gives the simulator a real roster
    for i, (branch, (region, province)) in enumerate(sorted(idx.items())):
        rows.append((f"PWA-{i:03d}-P1", "pump", branch, province, region, None))
    # named devices the demo references (สมุทรสาคร, region 3)
    region, province = idx.get(DEMO_BRANCH, (3, "สมุทรสาคร"))
    rows += [
        ("P-1", "pump", DEMO_BRANCH, province, region, "DMA-01"),
        ("P-2", "pump", DEMO_BRANCH, province, region, "DMA-03"),
        ("M-3", "motor", DEMO_BRANCH, province, region, "DMA-02"),
        ("V-9", "valve", DEMO_BRANCH, province, region, "DMA-03"),
    ]
    return rows


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
    idx = _branch_index()
    devices = _devices(idx)
    pipes, customers = _topology()
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO device (asset_id, kind, branch, province, region, dma) "
            "VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (asset_id) DO NOTHING",
            devices,
        )
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
