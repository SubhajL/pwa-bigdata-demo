"""TS1.1 / TS1.2 — the device roster.

Identity model (this is the load-bearing decision in the slice):

* A branch is identified by its **`branch_code`**, not by its Thai label. Labels are
  not stable — `5551014` is recorded as `บ้านนาสาร` in earlier months and `เวียงสระ`
  in later ones. Keying on the label produces 235 "branches" for a dataset that has
  only 234, i.e. a phantom device for a branch that no longer exists, published as
  real PWA geography.
* Geography is resolved **as-of the latest month present for that code**, so the
  roster describes the network as it currently stands rather than a union of history.
* `asset_id` embeds the branch_code (`PWA-{code}-P1`). Position-derived ids would
  renumber every downstream device whenever a branch is added or renamed, and
  `seed_db`'s `ON CONFLICT DO NOTHING` would then leave stale geography attached to a
  reused id — telemetry silently attributed to the wrong branch, with the FK still green.

TS1.2 is the drift oracle: if the simulator's asset_ids ever diverge from what
`scripts/seed_db.py` inserts into `device`, slice S2 dead-letters 100% of traffic
while every dashboard still reads healthy.
"""
from __future__ import annotations

import csv
from pathlib import Path

import pytest

from app.roster import CURATED, load_devices

# Ground truth re-derived from data/curated/water_sold_by_branch.csv on 2026-07-29:
# 234 distinct branch_codes (235 distinct labels, because 5551014 was renamed),
# every month carries exactly 234 branches, plus the 4 named demo devices.
EXPECTED_BRANCHES = 234
EXPECTED_TOTAL = EXPECTED_BRANCHES + 4
EXPECTED_NAMED = {"P-1", "P-2", "M-3", "V-9"}
RENAMED_CODE = "5551014"
RENAMED_CURRENT_LABEL = "เวียงสระ"
RENAMED_STALE_LABEL = "บ้านนาสาร"


def test_roster_has_one_device_per_real_branch_code() -> None:
    devices = load_devices()

    assert len(devices) == EXPECTED_TOTAL
    ids = [d.asset_id for d in devices]
    assert len(set(ids)) == EXPECTED_TOTAL, "asset_ids must be unique"
    assert EXPECTED_NAMED.issubset(set(ids))
    assert load_devices() == devices, "load_devices() must be deterministic"


def test_asset_ids_are_derived_from_branch_code_not_list_position() -> None:
    """Position-derived ids renumber on any insertion; codes do not."""
    branch_devices = [d for d in load_devices() if d.asset_id not in EXPECTED_NAMED]

    codes = {row["branch_code"] for row in csv.DictReader(CURATED.open(encoding="utf-8"))}
    assert len(branch_devices) == len(codes)
    for dev in branch_devices:
        code = dev.asset_id.removeprefix("PWA-").removesuffix("-P1")
        assert code in codes, f"{dev.asset_id} does not embed a real branch_code"


def test_renamed_branch_resolves_to_its_current_label_only() -> None:
    """The phantom-branch regression, pinned.

    `5551014` appears under two labels across the dataset. The roster must carry the
    current one exactly once, and must not also emit a device for the retired label.
    """
    devices = load_devices()
    by_id = {d.asset_id: d for d in devices}

    dev = by_id[f"PWA-{RENAMED_CODE}-P1"]
    assert dev.branch == RENAMED_CURRENT_LABEL

    labels = [d.branch for d in devices]
    assert RENAMED_STALE_LABEL not in labels, (
        "roster still contains the retired branch label — it is modelling a union of "
        "historical names rather than the current network"
    )


def test_branch_geography_is_real_and_never_fabricated() -> None:
    """CLAUDE.md honesty rule: geography is REAL data, so it may not be invented."""
    devices = load_devices()

    for dev in devices:
        assert dev.branch.strip(), "blank branch label"
        assert dev.province.strip(), "blank province"
        assert 1 <= dev.region <= 10, f"PWA has 10 regions; got {dev.region} for {dev.asset_id}"

    named = {d.asset_id: d for d in devices}["P-2"]
    assert named.branch == "สมุทรสาคร"
    assert named.dma == "DMA-03"
    assert named.kind == "pump"


def test_named_demo_devices_take_geography_from_the_real_branch() -> None:
    rows = list(csv.DictReader(CURATED.open(encoding="utf-8")))
    demo_rows = [r for r in rows if r["branch"] == "สมุทรสาคร"]
    assert demo_rows, "fixture assumption broken: สมุทรสาคร absent from the CSV"
    expected_region = int(demo_rows[-1]["region"])
    expected_province = demo_rows[-1]["province"]

    named = {d.asset_id: d for d in load_devices() if d.asset_id in EXPECTED_NAMED}

    assert len(named) == 4
    for dev in named.values():
        assert dev.region == expected_region
        assert dev.province == expected_province


def test_seed_projects_every_roster_device_into_the_right_column() -> None:
    """DRIFT ORACLE — the `device` INSERT is positional, so column order is load-bearing.

    The roster cannot drift from the seed: `seed_db` imports `load_devices` rather than
    re-deriving it, so asserting set equality would be a tautology. What CAN still break
    is the projection into the positional tuple — swapping `branch` and `province` (both
    TEXT, both non-null) would corrupt every row and no constraint would notice.
    """
    pytest.importorskip("psycopg", reason="scripts/seed_db.py imports psycopg at module scope")
    from scripts import seed_db

    devices = load_devices()
    rows = seed_db.device_rows(devices)

    assert len(rows) == len(devices)
    assert seed_db.DEVICE_COLUMNS == ("asset_id", "kind", "branch", "province", "region", "dma")

    for row, dev in zip(rows, devices, strict=True):
        assert len(row) == len(seed_db.DEVICE_COLUMNS)
        for position, column in enumerate(seed_db.DEVICE_COLUMNS):
            assert row[position] == getattr(dev, column), (
                f"column {column!r} sits at position {position} but the tuple carries "
                f"{row[position]!r} instead of {getattr(dev, column)!r}"
            )


def test_seed_insert_statement_agrees_with_the_column_tuple() -> None:
    pytest.importorskip("psycopg", reason="scripts/seed_db.py imports psycopg at module scope")
    from scripts import seed_db

    columns_in_sql = (
        seed_db.DEVICE_INSERT.split("device (", 1)[1].split(")", 1)[0].replace(" ", "").split(",")
    )

    assert tuple(columns_in_sql) == seed_db.DEVICE_COLUMNS
    assert seed_db.DEVICE_INSERT.count("%s") == len(seed_db.DEVICE_COLUMNS)


def test_seed_and_simulator_read_the_same_csv_by_default() -> None:
    """Finding 6: a divergent CURATED_PATH would seed one roster and publish another."""
    pytest.importorskip("psycopg", reason="scripts/seed_db.py imports psycopg at module scope")
    from scripts import seed_db

    assert seed_db.curated_path() == CURATED


def test_load_devices_rejects_a_missing_file() -> None:
    with pytest.raises(FileNotFoundError):
        load_devices(Path("/nonexistent/water_sold_by_branch.csv"))


def test_load_devices_rejects_a_csv_missing_required_columns(tmp_path: Path) -> None:
    bad = tmp_path / "bad.csv"
    bad.write_text("region,branch,month\n1,x,2025-01-01\n", encoding="utf-8")

    with pytest.raises(ValueError, match="branch_code|province"):
        load_devices(bad)


def test_load_devices_rejects_conflicting_geography_for_one_code(tmp_path: Path) -> None:
    """Two different provinces for the same branch_code in the same month is corrupt input."""
    bad = tmp_path / "conflict.csv"
    bad.write_text(
        "region,branch_code,province,branch,month,water_sold_m3\n"
        "1,5511011,ชลบุรี,ชลบุรี,2025-01-01,100\n"
        "2,5511011,ระยอง,ชลบุรี,2025-01-01,100\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="conflict"):
        load_devices(bad)


def test_load_devices_rejects_a_csv_without_the_demo_branch(tmp_path: Path) -> None:
    """Missing demo geography must FAIL, not be invented (honesty rule)."""
    thin = tmp_path / "thin.csv"
    thin.write_text(
        "region,branch_code,province,branch,month,water_sold_m3\n"
        "1,5511011,ชลบุรี,ชลบุรี,2025-01-01,100\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="สมุทรสาคร"):
        load_devices(thin)
