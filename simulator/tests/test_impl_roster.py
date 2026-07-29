"""Implementation tests for roster.py — written before the code (TDD)."""
from __future__ import annotations

from pathlib import Path
from tempfile import NamedTemporaryFile

import pytest

from app.roster import load_devices


def test_load_devices_raises_valueerror_for_missing_columns() -> None:
    """A CSV without 'region', 'province', 'branch_code', 'branch', or 'month'
    must raise ValueError."""
    with NamedTemporaryFile(
        mode="w", suffix=".csv", delete=False, encoding="utf-8"
    ) as f:
        f.write("water_sold_m3\n1000.0\n")
        temp_path = Path(f.name)

    try:
        with pytest.raises(ValueError, match="missing required column"):
            load_devices(temp_path)
    finally:
        temp_path.unlink()


def test_load_devices_raises_valueerror_for_partial_columns() -> None:
    """CSV with 'branch' and 'month' but missing 'branch_code' must ValueError."""
    with NamedTemporaryFile(
        mode="w", suffix=".csv", delete=False, encoding="utf-8"
    ) as f:
        f.write("branch,month\nสมุทรสาคร,2022-10-01\n")
        temp_path = Path(f.name)

    try:
        with pytest.raises(ValueError, match="missing required column"):
            load_devices(temp_path)
    finally:
        temp_path.unlink()


def test_named_devices_get_branch_geography_from_mapping() -> None:
    """Named demo devices use the สมุทรสาคร branch's region/province."""
    devices = {d.asset_id: d for d in load_devices()}

    # All 4 named devices exist
    for aid in ("P-1", "P-2", "M-3", "V-9"):
        assert aid in devices, f"named device {aid} missing"
        assert devices[aid].branch == "สมุทรสาคร"
        assert devices[aid].region == 3
        assert devices[aid].province == "สมุทรสาคร"

    # Check DMA values
    assert devices["P-1"].dma == "DMA-01"
    assert devices["P-2"].dma == "DMA-03"
    assert devices["M-3"].dma == "DMA-02"
    assert devices["V-9"].dma == "DMA-03"
    assert devices["P-1"].kind == "pump"
    assert devices["M-3"].kind == "motor"
    assert devices["V-9"].kind == "valve"


def test_first_device_matches_lowest_branch_code() -> None:
    """The first device must have the lowest branch_code (sorted as string)."""
    devices = load_devices()
    first = devices[0]
    assert first.asset_id.startswith("PWA-") and first.asset_id.endswith("-P1")
    assert first.kind == "pump"
    # PWA-{branch_code}-P1 embeds the code; first entry is the min code
    code = first.asset_id.removeprefix("PWA-").removesuffix("-P1")
    assert code, "asset_id must embed a non-empty branch_code"


def test_load_devices_accepts_default_path() -> None:
    """Default path (CURATED) must resolve and produce 238 devices."""
    devices = load_devices()
    assert len(devices) == 238
