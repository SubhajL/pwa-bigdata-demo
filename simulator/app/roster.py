"""Device roster — THE single source of truth for which devices exist (slice S1).

`scripts/seed_db.py` imports `load_devices()` from here to populate the `device`
table. That shared derivation is deliberate: `telemetry.asset_id` carries a foreign
key to `device.asset_id`, so if the simulator ever published an asset_id the seed
did not insert, every message would be dead-lettered while the pipeline still
looked healthy. Two independent derivations is exactly the drift this file removes.

Identity model — a branch is its `branch_code`, not its Thai label:

* Labels are not stable. Code `5551014` is recorded as `บ้านนาสาร` in earlier months
  and `เวียงสระ` in later ones. Keying on the label yields 235 branches for a dataset
  that only ever has 234 in any month — a phantom device for a branch that no longer
  exists, presented as real PWA geography.
* Geography is resolved **as-of the latest month present for that code**, so the
  roster describes the current network rather than a union of history.
* `asset_id` embeds the code. Position-derived ids renumber whenever a branch is
  added or renamed, and `seed_db`'s `ON CONFLICT DO NOTHING` would then leave stale
  geography on a reused id — telemetry silently attributed to the wrong branch while
  the foreign key still passes.
"""
from __future__ import annotations

import csv
from pathlib import Path

from .config import DEFAULT_CURATED
from .models import Device, DeviceKind

CURATED: Path = DEFAULT_CURATED

#: The demo scenarios reference these devices by name (สมุทรสาคร, region 3).
DEMO_BRANCH = "สมุทรสาคร"

#: (asset_id, kind, dma) for the named demo devices, appended after the per-branch pumps.
#: `kind` is typed as DeviceKind so constructing Device(kind=kind) needs no cast —
#: CLAUDE.md forbids silencing a type error to pass a gate.
NAMED_DEVICES: tuple[tuple[str, DeviceKind, str], ...] = (
    ("P-1", "pump", "DMA-01"),
    ("P-2", "pump", "DMA-03"),
    ("M-3", "motor", "DMA-02"),
    ("V-9", "valve", "DMA-03"),
)

REQUIRED_COLUMNS = ("region", "branch_code", "province", "branch", "month")


class _BranchRecord:
    """Latest-known geography for one branch_code."""

    __slots__ = ("month", "branch", "province", "region")

    def __init__(self, month: str, branch: str, province: str, region: int) -> None:
        self.month = month
        self.branch = branch
        self.province = province
        self.region = region


def _read_branches(csv_path: Path) -> dict[str, _BranchRecord]:
    """Collapse the CSV to one as-of-latest-month record per branch_code."""
    if not csv_path.exists():
        raise FileNotFoundError(csv_path)

    latest: dict[str, _BranchRecord] = {}
    with csv_path.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        missing = [c for c in REQUIRED_COLUMNS if c not in (reader.fieldnames or ())]
        if missing:
            raise ValueError(f"missing required column(s): {', '.join(missing)}")

        for line, row in enumerate(reader, start=2):
            code = (row["branch_code"] or "").strip()
            branch = (row["branch"] or "").strip()
            province = (row["province"] or "").strip()
            month = (row["month"] or "").strip()
            if not (code and branch and province and month):
                raise ValueError(f"blank identity field at line {line}")
            try:
                region = int(row["region"])
            except (TypeError, ValueError) as exc:
                raise ValueError(f"non-integer region at line {line}: {row['region']!r}") from exc
            if not 1 <= region <= 10:
                raise ValueError(f"region {region} out of range 1..10 at line {line}")

            seen = latest.get(code)
            if seen is not None and seen.month == month and (
                seen.province != province or seen.region != region
            ):
                raise ValueError(
                    f"conflicting geography for branch_code {code} in {month}: "
                    f"{seen.province}/{seen.region} vs {province}/{region}"
                )
            if seen is None or month >= seen.month:
                latest[code] = _BranchRecord(month, branch, province, region)
    return latest


def load_devices(csv_path: Path = CURATED) -> list[Device]:
    """Derive the demo device roster from the real PWA branch CSV.

    One representative pump per real branch_code, `PWA-{code}-P1`, ordered by code;
    then the four named demo devices, whose geography comes from the real
    `สมุทรสาคร` branch. Deterministic and pure — no network, no DB.

    Args:
        csv_path: the curated `water_sold_by_branch.csv`.

    Returns:
        238 devices for the committed CSV (234 branch pumps + 4 named).

    Raises:
        FileNotFoundError: if `csv_path` does not exist.
        ValueError: on a missing column, blank identity field, out-of-range region,
            conflicting same-month geography, or an absent demo branch.
    """
    latest = _read_branches(csv_path)

    devices = [
        Device(
            asset_id=f"PWA-{code}-P1",
            kind="pump",
            branch=rec.branch,
            province=rec.province,
            region=rec.region,
            dma=None,
        )
        for code, rec in sorted(latest.items())
    ]

    demo = next((r for r in latest.values() if r.branch == DEMO_BRANCH), None)
    if demo is None:
        raise ValueError(
            f"demo branch {DEMO_BRANCH!r} absent from {csv_path}; refusing to fabricate "
            "geography for the named demo devices"
        )
    devices.extend(
        Device(
            asset_id=asset_id,
            kind=kind,
            branch=DEMO_BRANCH,
            province=demo.province,
            region=demo.region,
            dma=dma,
        )
        for asset_id, kind, dma in NAMED_DEVICES
    )
    return devices
