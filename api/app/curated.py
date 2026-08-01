"""Read-only access to the REAL curated PWA dataset (PR-6).

`data/curated/water_sold_by_branch.csv` — 9 126 rows, 234 branch_codes, 39 months
(2022-10 … 2025-12), regions 1..10. This is the only non-simulated data in the API, and
the role dashboards (PR-10–12) are built on it.

IDENTITY — copied deliberately from `simulator/app/roster.py`, do not re-derive
------------------------------------------------------------------------------
A branch IS its `branch_code`, never its Thai label. Code `5551014` is recorded as
`บ้านนาสาร` in earlier months and `เวียงสระ` in later ones, so the dataset holds 234 codes
but 235 labels. Keying on the label invents a 235th branch that never existed and presents
it as real PWA geography.

WHY THIS DUPLICATES roster.py's CSV READ INSTEAD OF IMPORTING IT
---------------------------------------------------------------
`api/app` and `simulator/app` are BOTH top-level packages named `app`; putting the
simulator on this interpreter's path shadows one or the other depending on import order,
which is why `api/tests/conftest.py` shells out for the roster instead. The two services
are separate containers and never share an interpreter in production either.

The duplication is accepted, but not left to drift: `test_curated.py::test_branch_codes_
match_the_simulator_roster` obtains the roster out-of-process and asserts the two
derivations agree on all 234 codes. A shared `pwa_curated` package is the clean long-term
answer and is logged as a follow-up — it would touch the simulator, the seed script and
two Dockerfiles, which is outside a frontend-foundation PR.
"""
from __future__ import annotations

import csv
import math
import re
from collections import defaultdict
from datetime import date
from pathlib import Path

from .models import (
    BranchRow,
    BranchSeries,
    CuratedTrust,
    NationalSeries,
    NationalSeriesPoint,
    RegionRollup,
    RegionTotal,
    SeriesPoint,
)

#: Columns the loader requires. A missing one is a structural defect, not a data defect.
REQUIRED_COLUMNS = ("region", "branch_code", "province", "branch", "month", "water_sold_m3")

MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

_YM_RE = re.compile(r"^(\d{4}-\d{2})-\d{2}$")


def _normalise_month(raw: str) -> str:
    """Normalise a full date (2022-10-01) to YYYY-MM.

    Validates that the date is a real calendar date (not 2025-02-30).
    Raises ValueError if unparseable or not a real date.
    """
    try:
        date.fromisoformat(raw)
    except (ValueError, TypeError):
        raise ValueError(f"unparseable month: {raw!r}") from None
    m = _YM_RE.match(raw)
    if not m:
        raise ValueError(f"unparseable month: {raw!r}")
    return m.group(1)


def _validate_month(month: str) -> None:
    """Raise ValueError if `month` is not YYYY-MM with month in 01..12."""
    if not MONTH_RE.match(month):
        raise ValueError(f"month must be YYYY-MM with month in 01..12, got {month!r}")


def _month_offset(month: str, offset: int) -> str:
    """Return the month `offset` months before `month`.

    E.g., _month_offset("2023-01", 1) -> "2022-12".
    Works for any positive offset.
    """
    y, m = int(month[:4]), int(month[5:])
    m -= offset
    while m <= 0:
        y -= 1
        m += 12
    return f"{y:04d}-{m:02d}"


def _compute_pct(current: float, baseline: float | None) -> float | None:
    """Percentage change from baseline to current.

    Returns None when baseline is None or baseline is 0 (no defined percentage change).
    """
    if baseline is None or baseline == 0.0:
        return None
    return ((current - baseline) / baseline) * 100.0


class CuratedStore:
    """An immutable in-memory view of the curated CSV.

    Constructed once per process by the FastAPI lifespan (see `app.main`), never at import
    time — `/healthz` is deliberately dependency-free and must not be able to fail because
    a data file moved.
    """

    #: Rows whose `water_sold_m3` could not be parsed. Volume is data, not identity, so a
    #: bad one is skipped and COUNTED rather than fatal; the committed file has none, and
    #: the count makes any future one visible instead of silent.
    skipped_rows: int

    #: Basename of the source file, for the trust/provenance report. Set by `load_curated`.
    source: str

    def __init__(self) -> None:
        # (branch_code, month) -> (region, province, branch, water_sold_m3)
        self._data: dict[tuple[str, str], tuple[int, str, str, float]] = {}
        self._codes: set[str] = set()
        self._months: list[str] = []
        self.skipped_rows = 0
        self.source = ""

    def months(self) -> list[str]:
        """Every month present, ascending, unique, normalised to ``YYYY-MM``.

        The CSV stores a full date (``2022-10-01``); the API and the URL contract in
        design/INTERACTIONS.md both use ``YYYY-MM`` (``?month=2025-12``).
        """
        return list(self._months)

    def branch_codes(self) -> set[str]:
        """Every distinct `branch_code`. 234 for the committed dataset."""
        return set(self._codes)

    def trust(self) -> CuratedTrust:
        """Measured provenance & integrity of the loaded data (Path D).

        Every field is counted from what was actually loaded — nothing here is synthesised —
        so the national screen can certify on screen which figures are real. `region_count`
        is a COUNT DISTINCT of the region held on each record.
        """
        regions = {region for (region, _p, _b, _v) in self._data.values()}
        return CuratedTrust(
            source=self.source,
            record_count=len(self._data),
            branch_count=len(self._codes),
            region_count=len(regions),
            month_count=len(self._months),
            first_month=self._months[0] if self._months else None,
            last_month=self._months[-1] if self._months else None,
            skipped_rows=self.skipped_rows,
        )

    def national(self, month: str) -> RegionRollup:
        """Roll one month up to the national total and its ten regions.

        Post: ``total_m3`` equals the sum of the region totals; regions are sorted by
        volume descending; ``branch_count`` is COUNT DISTINCT branch_code.

        An unknown-but-well-formed month returns an EMPTY rollup (total 0.0, regions [])
        rather than raising — the route decides whether that is a 404.

        Raises:
            ValueError: if `month` is not ``YYYY-MM`` with a month in 01..12.
        """
        _validate_month(month)

        region_totals: dict[int, float] = defaultdict(float)
        region_codes: dict[int, set[str]] = defaultdict(set)
        seen_codes: set[str] = set()

        for (code, m), (region, _province, _branch, vol) in self._data.items():
            if m == month:
                seen_codes.add(code)
                region_totals[region] += vol
                region_codes[region].add(code)

        if not seen_codes:
            return RegionRollup(month=month, total_m3=0.0, branch_count=0, regions=[])

        total = sum(region_totals.values())
        regions = sorted(
            [
                RegionTotal(
                    region=r,
                    water_sold_m3=round(region_totals[r], 6),
                    branch_count=len(region_codes[r]),
                )
                for r in region_totals
            ],
            key=lambda rt: rt.water_sold_m3,
            reverse=True,
        )
        return RegionRollup(
            month=month,
            total_m3=round(total, 6),
            branch_count=len(seen_codes),
            regions=regions,
        )

    def national_series(self) -> NationalSeries:
        """Every month's national total and distinct-branch count, ascending.

        One pass over the data accumulates per-month totals and distinct branch_codes, so the
        result agrees point-for-point with `national(month)` without calling it 39 times. Months
        are taken from `self._months` (already sorted), so the series is ordered and complete.
        """
        totals: dict[str, float] = defaultdict(float)
        codes: dict[str, set[str]] = defaultdict(set)
        for (code, month), (_region, _province, _branch, vol) in self._data.items():
            totals[month] += vol
            codes[month].add(code)

        points = [
            NationalSeriesPoint(
                month=month,
                total_m3=round(totals[month], 6),
                branch_count=len(codes[month]),
            )
            for month in self._months
        ]
        return NationalSeries(points=points)

    def region(self, region: int, month: str) -> list[BranchRow]:
        """One region's branch league table for one month.

        Sorted by volume descending — the documented default sort — with `rank` stored
        1..n over THAT ordering so a client re-sort does not renumber it.

        `mom_pct` / `yoy_pct` are None (never 0.0) when the prior month or the year-ago
        month has no row for that branch_code, or when the baseline is 0.

        A branch reporting a legitimate 0.0 m³ IS listed, with a rank; a branch absent that
        month is simply not listed. The two must stay distinguishable.

        Raises:
            ValueError: on a region outside 1..10 or a malformed month.
        """
        if not isinstance(region, int) or region < 1 or region > 10:
            raise ValueError(f"region must be 1..10, got {region!r}")
        _validate_month(month)

        prev_month = _month_offset(month, 1)
        yoy_month = _month_offset(month, 12)

        rows: list[BranchRow] = []
        for (code, m), (r, province, branch, vol) in self._data.items():
            if m == month and r == region:
                # Compute MoM
                prev_vol: float | None = None
                prev_row = self._data.get((code, prev_month))
                if prev_row is not None:
                    prev_vol = prev_row[3]
                mom = _compute_pct(vol, prev_vol)

                # Compute YoY
                yoy_vol: float | None = None
                yoy_row = self._data.get((code, yoy_month))
                if yoy_row is not None:
                    yoy_vol = yoy_row[3]
                yoy = _compute_pct(vol, yoy_vol)

                rows.append(
                    BranchRow(
                        rank=0,  # will be assigned after sorting
                        branch_code=code,
                        branch=branch,
                        province=province,
                        region=r,
                        water_sold_m3=vol,
                        mom_pct=round(mom, 2) if mom is not None else None,
                        yoy_pct=round(yoy, 2) if yoy is not None else None,
                    )
                )

        rows.sort(key=lambda r: (-r.water_sold_m3, r.branch_code))
        for i, row in enumerate(rows):
            row.rank = i + 1
        return rows

    def branch(self, branch_code: str) -> BranchSeries:
        """One branch's full monthly history, ascending, with gaps left as gaps.

        Header geography (`branch`, `province`, `region`) is resolved AS-OF the latest
        month present for the code, matching roster.py's "describes the current network"
        rule, while each point keeps its own month's value.

        Raises:
            KeyError: if `branch_code` is not in the dataset.
        """
        if branch_code not in self._codes:
            raise KeyError(branch_code)

        points_data: list[tuple[str, float, str, str, int]] = []
        for (code, m), (region, province, branch, vol) in self._data.items():
            if code == branch_code:
                points_data.append((m, vol, branch, province, region))

        if not points_data:
            raise KeyError(branch_code)

        points_data.sort(key=lambda p: p[0])
        # Header geography from the latest month
        latest = points_data[-1]
        _latest_month, _latest_vol, latest_branch, latest_province, latest_region = latest

        points = [SeriesPoint(month=m, water_sold_m3=vol) for m, vol, *_rest in points_data]
        return BranchSeries(
            branch_code=branch_code,
            branch=latest_branch,
            province=latest_province,
            region=latest_region,
            points=points,
        )


def load_curated(path: str | Path) -> CuratedStore:
    """Parse the curated CSV into an immutable store.

    This function performs I/O; the store it returns is pure thereafter. There is no
    internal cache — the single instance is owned by the app lifespan, so its lifetime is
    the process's.

    Structural defects raise, mirroring `simulator/app/roster.py:68-95` exactly: a missing
    column, a blank identity field, a non-integer or out-of-range region, an unparseable
    month, or conflicting geography for one branch_code within one month. Failing loudly
    is right for these, because the alternative is silently changing a roll-up.

    A duplicate (branch_code, month) with an IDENTICAL volume is collapsed; one with a
    DIFFERING volume raises. (`data/curated/_defects.csv` records that byte-identical
    duplicates were already removed upstream.)

    Raises:
        FileNotFoundError: if `path` does not exist.
        ValueError: on any structural defect listed above.
    """
    path = Path(path)
    if not path.is_file():
        raise FileNotFoundError(f"curated CSV not found: {path}")

    store = CuratedStore()
    seen_months: set[str] = set()
    # (branch_code, month) -> volume, for duplicate detection
    seen_volumes: dict[tuple[str, str], float] = {}

    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            raise ValueError("CSV has no header row")

        for col in REQUIRED_COLUMNS:
            if col not in reader.fieldnames:
                raise ValueError(f"missing required column: {col!r}")

        for row_num, row in enumerate(reader, start=2):  # 1-based, header is row 1
            # Identity fields must not be blank.
            region_raw = row["region"].strip()
            branch_code = row["branch_code"].strip()
            province = row["province"].strip()
            branch = row["branch"].strip()
            month_raw = row["month"].strip()

            if not branch_code:
                raise ValueError(f"row {row_num}: blank branch_code")
            if not province:
                raise ValueError(f"row {row_num}: blank province")
            if not branch:
                raise ValueError(f"row {row_num}: blank branch")

            # Region: must be integer and in 1..10.
            try:
                region = int(region_raw)
            except ValueError:
                raise ValueError(f"row {row_num}: non-integer region {region_raw!r}") from None
            if region < 1 or region > 10:
                raise ValueError(f"row {row_num}: region out of range: {region}")

            # Month: normalise from full date to YYYY-MM.
            try:
                month = _normalise_month(month_raw)
            except ValueError:
                raise ValueError(f"row {row_num}: unparseable month {month_raw!r}") from None

            # Volume: parse, but skip if unparseable, non-finite, or NEGATIVE. Water sold cannot be
            # negative; a negative row is a data defect that would poison a roll-up, a bar width and
            # a map fill downstream, so quarantine it (counted, never fatal) exactly like a NaN.
            volume_raw = row["water_sold_m3"].strip()
            try:
                volume = float(volume_raw)
            except ValueError:
                store.skipped_rows += 1
                continue
            if not math.isfinite(volume) or volume < 0:
                store.skipped_rows += 1
                continue

            # Check for conflicting data for same (branch_code, month).
            key = (branch_code, month)
            existing = store._data.get(key)
            if existing is not None:
                existing_region, existing_province, existing_branch, existing_vol = existing
                # Conflicting geography is a structural defect.
                if (
                    existing_region != region
                    or existing_province != province
                    or existing_branch != branch
                ):
                    raise ValueError(
                        f"row {row_num}: conflicting geography for {branch_code}/{month}: "
                        f"({region}, {province!r}, {branch!r}) vs "
                        f"({existing_region}, {existing_province!r}, {existing_branch!r})"
                    )
                # Conflicting volume with same geography is a structural defect.
                if abs(existing_vol - volume) > 1e-9:
                    raise ValueError(
                        f"row {row_num}: conflicting volume for {branch_code}/{month}: "
                        f"{volume} vs {existing_vol}"
                    )
                # Collapse duplicate with identical data.
                continue

            store._data[key] = (region, province, branch, volume)
            store._codes.add(branch_code)
            seen_months.add(month)
            seen_volumes[key] = volume

    store._months = sorted(seen_months)
    store.source = path.name
    return store
