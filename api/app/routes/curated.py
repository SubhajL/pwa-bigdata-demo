"""Read API over the REAL curated dataset (PR-6).

Every other read route in this API serves SIMULATED telemetry. These four serve real PWA
water-sold figures, and must never be marked `simulated` — mislabelling real data as
synthetic is the mirror image of the honesty rule and just as misleading to a judge.

The store is built once in the app lifespan and read off `request.app.state.curated`; a
None there means the CSV was not mounted, which is a 503 (the service is fine, this
dependency is not) rather than a 500.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from ..curated import CuratedStore
from ..models import BranchRow, BranchSeries, CuratedMonths, NationalSeries, RegionRollup

router = APIRouter(prefix="/api/curated", tags=["curated"])

#: `?month=2025-12`, the format design/INTERACTIONS.md puts in the URL.
MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"


def _store(request: Request) -> CuratedStore:
    """The process-wide store, or a 503 explaining what is missing.

    Raises:
        HTTPException: 503 when `CURATED_PATH` was unset or unreadable at startup.
    """
    store: CuratedStore | None = request.app.state.curated
    if store is None:
        raise HTTPException(
            status_code=503,
            detail="curated dataset not available — CURATED_PATH unset or unreadable at startup",
        )
    return store


@router.get("/months", response_model=CuratedMonths, summary="Months available in the real dataset")
def curated_months(request: Request) -> CuratedMonths:
    """Every month present in `water_sold_by_branch.csv`, ascending.

    39 months for the committed dataset (2022-10 … 2025-12). Real data, not simulated.
    """
    store_val = _store(request)
    months_list = store_val.months()
    return CuratedMonths(months=months_list, count=len(months_list))


@router.get("/national", response_model=RegionRollup, summary="National roll-up for one month")
def curated_national(
    request: Request,
    month: str = Query(..., pattern=MONTH_PATTERN, description="YYYY-MM, e.g. 2025-12"),
) -> RegionRollup:
    """Total water sold nationally, broken down by region, for `month`.

    `branch_count` is a COUNT DISTINCT of branch_code — 234 for a complete month, never
    235, because one branch was renamed and labels are not identity.

    Raises:
        HTTPException: 404 when the month is well-formed but absent from the dataset.
    """
    store_val = _store(request)
    try:
        rollup = store_val.national(month)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"invalid month: {month}") from None
    if rollup.branch_count == 0 and len(rollup.regions) == 0:
        raise HTTPException(status_code=404, detail=f"no data for month {month}")
    return rollup


@router.get(
    "/national/series", response_model=NationalSeries, summary="National totals for every month"
)
def curated_national_series(request: Request) -> NationalSeries:
    """The 39-month national series — total water sold and distinct branches per month.

    One call for the executive trend line and national MoM/YoY. Real data, not simulated. A
    literal path, so it never collides with `/national` (which takes a `?month=` query).
    """
    return _store(request).national_series()


@router.get(
    "/regions/{region}", response_model=list[BranchRow], summary="Branch league table for a region"
)
def curated_region(
    request: Request,
    region: int,
    month: str = Query(..., pattern=MONTH_PATTERN, description="YYYY-MM, e.g. 2025-12"),
) -> list[BranchRow]:
    """One region's branches for one month, ranked by volume descending.

    MoM/YoY are computed from the real adjacent and year-ago months, and are `null` — not
    zero — where that comparison month has no row for the branch.

    Raises:
        HTTPException: 404 for a region outside 1..10 or a month absent from the dataset.
    """
    store_val = _store(request)
    try:
        rows = store_val.region(region, month)
    except ValueError as exc:
        if "month" in str(exc):
            raise HTTPException(status_code=422, detail=str(exc)) from None
        raise HTTPException(status_code=404, detail=f"region not found: {region}") from None
    if not rows:
        raise HTTPException(status_code=404, detail=f"no data for region {region} in month {month}")
    return rows


@router.get(
    "/branches/{branch_code}", response_model=BranchSeries, summary="One branch's monthly history"
)
def curated_branch(request: Request, branch_code: str) -> BranchSeries:
    """A single branch's water-sold series, ascending, gaps left as gaps.

    Raises:
        HTTPException: 404 when `branch_code` is not in the dataset.
    """
    store_val = _store(request)
    try:
        return store_val.branch(branch_code)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"branch not found: {branch_code}") from None
