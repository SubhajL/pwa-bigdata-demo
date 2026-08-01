"""T13–T16 — the curated read API over the REAL PWA dataset (DREP-PR6 R14, R15, R16).

Ground truth in this file was MEASURED from `data/curated/water_sold_by_branch.csv`, not
remembered:

    9 126 data rows · 234 distinct branch_code · 235 distinct labels · 39 months
    (2022-10 … 2025-12) · regions 1..10 · 2025-12 total 120 999 833.55 m³

That total is also the headline KPI printed on the Stitch mockup (120,999,834), so it is
an EXTERNAL anchor rather than a self-consistency check. Asserting only
`total == sum(regions)` would stay green if the loader dropped 90% of the rows.

Authored by Claude; the implementer must not modify this file (DREP §10).
"""
from __future__ import annotations

import pathlib

import pytest
from fastapi.testclient import TestClient

from app.curated import CuratedStore, load_curated

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
CURATED_CSV = REPO_ROOT / "data" / "curated" / "water_sold_by_branch.csv"

# Measured from the committed file.
EXPECTED_MONTHS = 39
EXPECTED_BRANCH_CODES = 234
EXPECTED_REGIONS = 10
LAST_MONTH = "2025-12"
FIRST_MONTH = "2022-10"
LAST_MONTH_TOTAL_M3 = 120_999_833.55

HEADER = "region,branch_code,province,branch,month,water_sold_m3\n"


@pytest.fixture(scope="module")
def store() -> CuratedStore:
    return load_curated(CURATED_CSV)


def _write_csv(path: pathlib.Path, rows: list[str]) -> pathlib.Path:
    path.write_text(HEADER + "".join(r if r.endswith("\n") else r + "\n" for r in rows), "utf-8")
    return path


# ── T13: the store agrees with independently measured ground truth ────────────────────


def test_months_are_sorted_unique_and_complete(store: CuratedStore) -> None:
    months = store.months()
    assert len(months) == EXPECTED_MONTHS
    assert months == sorted(months)
    assert len(set(months)) == len(months)
    assert months[0] == FIRST_MONTH
    assert months[-1] == LAST_MONTH
    # Normalised from the CSV's full date (2022-10-01) to the URL contract's YYYY-MM.
    assert all(len(m) == 7 and m[4] == "-" for m in months)


def test_national_rollup_matches_the_real_december_total(store: CuratedStore) -> None:
    rollup = store.national(LAST_MONTH)
    assert rollup.total_m3 == pytest.approx(LAST_MONTH_TOTAL_M3, rel=1e-9)
    assert len(rollup.regions) == EXPECTED_REGIONS
    # Internal consistency IS still worth asserting — just never on its own.
    assert rollup.total_m3 == pytest.approx(sum(r.water_sold_m3 for r in rollup.regions), rel=1e-9)
    assert rollup.regions == sorted(rollup.regions, key=lambda r: r.water_sold_m3, reverse=True)


def test_branch_count_is_234_not_235(store: CuratedStore) -> None:
    """Labels are not identity.

    The dataset holds 234 branch_codes but 235 labels, because 5551014 is recorded as
    บ้านนาสาร in earlier months and เวียงสระ in later ones. Counting labels invents a
    branch that never existed and presents it as real PWA geography.
    """
    assert store.national(LAST_MONTH).branch_count == EXPECTED_BRANCH_CODES
    assert len(store.branch_codes()) == EXPECTED_BRANCH_CODES


def test_committed_dataset_has_no_unparseable_volumes(store: CuratedStore) -> None:
    assert store.skipped_rows == 0


def test_unknown_month_is_empty_not_an_exception(store: CuratedStore) -> None:
    rollup = store.national("1999-01")
    assert rollup.total_m3 == 0.0
    assert rollup.regions == []


def test_malformed_month_raises(store: CuratedStore) -> None:
    for bad in ("2025-13", "2025-1", "2025-12-01", "nonsense", ""):
        with pytest.raises(ValueError):
            store.national(bad)


# ── T14: drift test against the simulator's derivation of the same file ───────────────


def test_branch_codes_match_the_simulator_roster(
    store: CuratedStore, simulator_roster: frozenset[str]
) -> None:
    """The API and the simulator must derive the SAME 234 branches from the same CSV.

    This is the oracle that justifies re-implementing the CSV read in `api/` rather than
    importing `simulator/app` — which is forbidden, because both are top-level packages
    named `app` (see conftest.pytest_sessionstart). The roster is obtained out-of-process
    by the `simulator_roster` fixture for exactly that reason.
    """
    roster_codes = {
        asset_id.removeprefix("PWA-").removesuffix("-P1")
        for asset_id in simulator_roster
        if asset_id.startswith("PWA-")
    }
    assert roster_codes == store.branch_codes()


# ── T15: missing vs zero, at the data layer ───────────────────────────────────────────


def test_mom_and_yoy_are_none_not_zero_when_the_comparison_month_is_absent(
    tmp_path: pathlib.Path,
) -> None:
    csv = _write_csv(
        tmp_path / "c.csv",
        [
            # A appears only in 2023-01 -> no prior month, no year-ago month.
            "1,A001,จันทบุรี,สาขา A,2023-01-01,100.0",
            # B has both comparison points: 2022-01 (year ago) and 2022-12 (prior month).
            "1,B002,จันทบุรี,สาขา B,2022-01-01,200.0",
            "1,B002,จันทบุรี,สาขา B,2022-12-01,400.0",
            "1,B002,จันทบุรี,สาขา B,2023-01-01,500.0",
        ],
    )
    rows = {r.branch_code: r for r in load_curated(csv).region(1, "2023-01")}

    # The distinction the whole module exists for: "no comparison" is not "no change".
    assert rows["A001"].mom_pct is None
    assert rows["A001"].yoy_pct is None
    assert rows["B002"].mom_pct == pytest.approx(25.0)  # 400 -> 500
    assert rows["B002"].yoy_pct == pytest.approx(150.0)  # 200 -> 500


def test_zero_baseline_yields_none_not_infinity(tmp_path: pathlib.Path) -> None:
    csv = _write_csv(
        tmp_path / "c.csv",
        [
            "1,C003,จันทบุรี,สาขา C,2022-12-01,0.0",
            "1,C003,จันทบุรี,สาขา C,2023-01-01,50.0",
        ],
    )
    row = load_curated(csv).region(1, "2023-01")[0]
    assert row.mom_pct is None


def test_zero_volume_branch_is_listed_and_ranked(tmp_path: pathlib.Path) -> None:
    """A branch that sold nothing is DATA; a branch that did not report is ABSENT."""
    csv = _write_csv(
        tmp_path / "c.csv",
        [
            "1,D004,จันทบุรี,สาขา D,2023-01-01,0.0",
            "1,E005,จันทบุรี,สาขา E,2023-01-01,10.0",
            # Present in a different month only — must not appear in 2023-01 at all.
            "1,F006,จันทบุรี,สาขา F,2022-12-01,99.0",
        ],
    )
    rows = load_curated(csv).region(1, "2023-01")
    codes = [r.branch_code for r in rows]
    assert codes == ["E005", "D004"]  # volume desc
    assert [r.rank for r in rows] == [1, 2]
    zero = next(r for r in rows if r.branch_code == "D004")
    assert zero.water_sold_m3 == 0.0
    assert "F006" not in codes


def test_negative_volume_row_is_quarantined_not_ingested(tmp_path: pathlib.Path) -> None:
    """Water sold cannot be negative; such a row is quarantined (counted), never rolled up.

    A negative volume that reached `national()`/`region()` would poison a KPI total and, downstream,
    a bar width and a map fill (both of which assume a non-negative magnitude). Reject it at the
    door like a NaN, and keep the count so a future bad row is visible rather than silent.
    """
    csv = _write_csv(
        tmp_path / "c.csv",
        [
            "1,G007,ตราด,สาขา G,2023-01-01,10.0",
            "1,H008,ตราด,สาขา H,2023-01-01,-5.0",  # impossible → quarantined
        ],
    )
    store = load_curated(csv)
    assert store.skipped_rows == 1
    codes = [r.branch_code for r in store.region(1, "2023-01")]
    assert codes == ["G007"]
    assert "H008" not in codes
    assert store.national("2023-01").total_m3 == pytest.approx(10.0)


def test_rank_is_stored_over_the_default_sort(store: CuratedStore) -> None:
    rows = store.region(2, LAST_MONTH)
    assert rows, "region 2 must have branches in the last month"
    assert [r.rank for r in rows] == list(range(1, len(rows) + 1))
    volumes = [r.water_sold_m3 for r in rows]
    assert volumes == sorted(volumes, reverse=True)


def test_branch_series_is_ascending_with_gaps_left_as_gaps(tmp_path: pathlib.Path) -> None:
    csv = _write_csv(
        tmp_path / "c.csv",
        [
            "3,G007,สมุทรสาคร,ชื่อเก่า,2022-10-01,10.0",
            # 2022-11 deliberately missing — a gap must NOT be filled with a zero.
            "3,G007,สมุทรสาคร,ชื่อใหม่,2022-12-01,30.0",
        ],
    )
    series = load_curated(csv).branch("G007")
    assert [p.month for p in series.points] == ["2022-10", "2022-12"]
    # Header geography is as-of the LATEST month, matching roster.py's identity rule.
    assert series.branch == "ชื่อใหม่"
    assert series.region == 3


def test_unknown_branch_code_raises(store: CuratedStore) -> None:
    with pytest.raises(KeyError):
        store.branch("NOT-A-CODE")


# ── loader: structural defects are loud, volume defects are counted ───────────────────


def test_missing_file_raises(tmp_path: pathlib.Path) -> None:
    with pytest.raises(FileNotFoundError):
        load_curated(tmp_path / "absent.csv")


def test_missing_column_raises(tmp_path: pathlib.Path) -> None:
    path = tmp_path / "c.csv"
    path.write_text("region,branch_code,province,branch,month\n1,A,จ,ส,2023-01-01\n", "utf-8")
    with pytest.raises(ValueError):
        load_curated(path)


@pytest.mark.parametrize(
    "row",
    [
        "1,,จันทบุรี,สาขา A,2023-01-01,100.0",  # blank code
        "1,A001,,สาขา A,2023-01-01,100.0",  # blank province
        "x,A001,จันทบุรี,สาขา A,2023-01-01,100.0",  # non-integer region
        "99,A001,จันทบุรี,สาขา A,2023-01-01,100.0",  # region out of range
        "1,A001,จันทบุรี,สาขา A,not-a-date,100.0",  # unparseable month
    ],
)
def test_structural_defects_raise(tmp_path: pathlib.Path, row: str) -> None:
    """Identity defects fail loudly — the alternative is silently changing a roll-up."""
    with pytest.raises(ValueError):
        load_curated(_write_csv(tmp_path / "c.csv", [row]))


def test_conflicting_same_month_geography_raises(tmp_path: pathlib.Path) -> None:
    with pytest.raises(ValueError):
        load_curated(
            _write_csv(
                tmp_path / "c.csv",
                [
                    "1,A001,จันทบุรี,สาขา A,2023-01-01,100.0",
                    "2,A001,ระยอง,สาขา A,2023-01-01,100.0",
                ],
            )
        )


def test_unparseable_volume_is_skipped_and_counted_not_fatal(tmp_path: pathlib.Path) -> None:
    """Volume is data, not identity. One bad number must not take the dataset down."""
    loaded = load_curated(
        _write_csv(
            tmp_path / "c.csv",
            [
                "1,A001,จันทบุรี,สาขา A,2023-01-01,100.0",
                "1,B002,จันทบุรี,สาขา B,2023-01-01,not-a-number",
            ],
        )
    )
    assert loaded.skipped_rows == 1
    assert loaded.branch_codes() == {"A001"}


# ── T16: the routes ───────────────────────────────────────────────────────────────────


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """A client whose lifespan has the real CSV mounted."""
    monkeypatch.setenv("CURATED_PATH", str(CURATED_CSV))
    monkeypatch.setenv("MQTT_ENABLED", "0")
    monkeypatch.setenv("SCORING_ENABLED", "0")
    from app.main import app

    return TestClient(app)


def test_months_route(client: TestClient) -> None:
    with client:
        response = client.get("/api/curated/months")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == EXPECTED_MONTHS
    assert body["months"][-1] == LAST_MONTH


def test_national_route_shape_and_value(client: TestClient) -> None:
    with client:
        response = client.get("/api/curated/national", params={"month": LAST_MONTH})
    assert response.status_code == 200
    body = response.json()
    assert body["total_m3"] == pytest.approx(LAST_MONTH_TOTAL_M3, rel=1e-9)
    assert body["branch_count"] == EXPECTED_BRANCH_CODES
    assert set(body) == {"month", "total_m3", "branch_count", "regions"}
    assert set(body["regions"][0]) == {"region", "water_sold_m3", "branch_count"}


def test_region_route_is_ranked_and_typed(client: TestClient) -> None:
    with client:
        response = client.get("/api/curated/regions/2", params={"month": LAST_MONTH})
    assert response.status_code == 200
    rows = response.json()
    assert rows
    assert [r["rank"] for r in rows] == list(range(1, len(rows) + 1))
    assert set(rows[0]) == {
        "rank",
        "branch_code",
        "branch",
        "province",
        "region",
        "water_sold_m3",
        "mom_pct",
        "yoy_pct",
    }


def test_branch_route(client: TestClient) -> None:
    with client:
        code = next(iter(sorted(load_curated(CURATED_CSV).branch_codes())))
        response = client.get(f"/api/curated/branches/{code}")
    assert response.status_code == 200
    body = response.json()
    assert body["branch_code"] == code
    months = [p["month"] for p in body["points"]]
    assert months == sorted(months)


@pytest.mark.parametrize(
    ("path", "params", "expected"),
    [
        ("/api/curated/national", {"month": "1999-01"}, 404),
        ("/api/curated/national", {"month": "2025-13"}, 422),
        ("/api/curated/national", {"month": "nonsense"}, 422),
        ("/api/curated/regions/99", {"month": LAST_MONTH}, 404),
        ("/api/curated/regions/abc", {"month": LAST_MONTH}, 422),
        ("/api/curated/branches/NOT-A-CODE", None, 404),
    ],
)
def test_error_statuses(
    client: TestClient, path: str, params: dict[str, str] | None, expected: int
) -> None:
    with client:
        response = client.get(path, params=params)
    assert response.status_code == expected


def test_routes_are_declared_in_openapi_with_response_models(client: TestClient) -> None:
    """The repo treats the OpenAPI document as acceptance evidence (test_routes.py)."""
    with client:
        schema = client.get("/openapi.json").json()
    for path in (
        "/api/curated/months",
        "/api/curated/national",
        "/api/curated/regions/{region}",
        "/api/curated/branches/{branch_code}",
    ):
        assert path in schema["paths"], f"{path} missing from OpenAPI"
        content = schema["paths"][path]["get"]["responses"]["200"]["content"]
        assert "application/json" in content
        assert "schema" in content["application/json"]


def test_curated_routes_return_503_when_the_dataset_is_not_mounted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A missing bind-mount degrades these four routes only — /healthz stays up.

    R16: the store is built in the lifespan, never at import, precisely so a data file
    cannot take liveness down with it.
    """
    monkeypatch.setenv("CURATED_PATH", "")
    monkeypatch.setenv("MQTT_ENABLED", "0")
    monkeypatch.setenv("SCORING_ENABLED", "0")
    from app.main import app

    with TestClient(app) as unmounted:
        assert unmounted.get("/healthz").status_code == 200
        assert unmounted.get("/api/curated/months").status_code == 503


# ── PR-10: national monthly series (one call powering the trend + national MoM/YoY) ───────


def test_national_series_has_one_point_per_month_ascending(store: CuratedStore) -> None:
    """The series is exactly the months, in order — nothing dropped, nothing invented."""
    series = store.national_series()
    months = [p.month for p in series.points]
    assert len(months) == EXPECTED_MONTHS
    assert months == store.months()
    assert months == sorted(months)


def test_national_series_agrees_with_the_national_rollup_each_month(store: CuratedStore) -> None:
    """Each point must equal the authoritative national() rollup for that month.

    Asserting only the December total would let a mid-series month drift silently; this pins
    EVERY month's total and distinct-branch count to the single-month endpoint they must match.
    """
    series = store.national_series()
    for point in series.points:
        rollup = store.national(point.month)
        assert point.total_m3 == pytest.approx(rollup.total_m3, rel=1e-9)
        assert point.branch_count == rollup.branch_count


def test_national_series_anchors_on_the_real_december_total(store: CuratedStore) -> None:
    """External anchor: the last point is the headline figure from the Stitch mockup."""
    series = store.national_series()
    december = series.points[-1]
    assert december.month == LAST_MONTH
    assert december.total_m3 == pytest.approx(LAST_MONTH_TOTAL_M3, rel=1e-9)
    assert december.branch_count == EXPECTED_BRANCH_CODES


def test_national_series_route_shape(client: TestClient) -> None:
    with client:
        response = client.get("/api/curated/national/series")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"points"}
    assert len(body["points"]) == EXPECTED_MONTHS
    assert set(body["points"][0]) == {"month", "total_m3", "branch_count"}
    assert body["points"][-1]["month"] == LAST_MONTH
    assert body["points"][-1]["total_m3"] == pytest.approx(LAST_MONTH_TOTAL_M3, rel=1e-9)


def test_national_series_route_in_openapi_and_503_when_unmounted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The new real route is documented and degrades to 503 like its siblings."""
    monkeypatch.setenv("CURATED_PATH", "")
    monkeypatch.setenv("MQTT_ENABLED", "0")
    monkeypatch.setenv("SCORING_ENABLED", "0")
    from app.main import app

    with TestClient(app) as unmounted:
        schema = unmounted.get("/openapi.json").json()
        assert "/api/curated/national/series" in schema["paths"]
        assert unmounted.get("/api/curated/national/series").status_code == 503
