"""Shared contracts (Codex #10: defined in S0, consumed by later slices)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

DeviceKind = Literal["pump", "motor", "valve", "sensor"]
Signal = Literal["pressure_bar", "flow_m3h", "power_kw", "vibration", "bearing_temp_c"]


class Device(BaseModel):
    asset_id: str
    kind: DeviceKind
    branch: str
    province: str
    region: int
    dma: str | None = None


class Reading(BaseModel):
    """A validated telemetry point. Produced by S2 `validate()`.

    `message_id` and `run_id` are carried through from the wire envelope: the ledger
    keys idempotency on the former, and the conservation invariant is only meaningful
    when scoped by the latter (otherwise two demo runs against one volume contaminate
    each other's counts).
    """
    message_id: str
    run_id: str
    ts: datetime
    asset_id: str
    signal: Signal
    value: float


class DeadLetter(BaseModel):
    """A rejected message routed to the DLQ (S2)."""
    message_id: str
    run_id: str | None
    asset_id: str | None
    reason: str
    raw: dict[str, Any]


#: Twin status vocabulary. Named so callers and tests can annotate it without a cast —
#: CLAUDE.md forbids silencing the type checker to make code compile.
TwinStatus = Literal["normal", "warning", "critical", "nodata"]


class TwinEvent(BaseModel):
    """WS payload pushed to the digital twin (S3 transport, S6 emit).

    The health fields are declared here, in the slice that lands the transport, even
    though nothing populates them until S6 scores devices. Shipping a status-only frame
    first and widening it later would be a breaking change for any client already built
    against it — and `health` is already a `kind` this event advertises, so the shape has
    to be able to carry one. `event_version` exists so a client can tell the difference.

    All health values are SIMULATED, as is every telemetry value in this demo.
    """

    event_version: Literal[1] = 1
    kind: Literal["status", "health"]
    asset_id: str
    status: TwinStatus
    observed_at: datetime | None = None
    published_at: datetime | None = None

    #: Populated by S6's scoring pass; absent on a plain status frame.
    health_score: float | None = None
    pttf_hours: float | None = None
    model_version: str | None = None
    #: The reading that triggered a status frame, when there was one.
    signal: Signal | None = None
    value: float | None = None


class ScenarioRequest(BaseModel):
    """Run-ID-scoped demo scenario trigger (S-D scenario API)."""
    scenario: str = Field(..., description="e.g. pump_anomaly | pressure_drop | bad_asset")
    run_id: str


# ── predictive maintenance (slice S6, scored items 3.3–3.6) ────────────────────────────
#
# Every field below is SIMULATED, including the model's outputs: the estimator was fitted
# on generated lifecycles, so a health score is a statement about this demo's synthetic
# physics and nothing else. `simulated` is carried on the wire rather than added by the UI
# so the marker cannot be lost by a client that forgets it (CLAUDE.md §Honesty of data).

#: What a technician can say about a prediction. Mirrors the CHECK constraint in
#: `infra/db/004_feedback.sql`; the two must be changed together.
Verdict = Literal["confirmed", "false_alarm", "repaired", "deferred"]


class SignalContribution(BaseModel):
    """One signal's share of a health prediction, for THIS window (scored item 3.6)."""

    signal: Signal
    #: Positive means the signal is pushing health DOWN relative to a nominal device.
    contribution: float


class HealthResponse(BaseModel):
    """Health, PTTF and RCA for one asset (scored items 3.3/3.6)."""

    asset_id: str
    status: TwinStatus
    #: None together with `status == "nodata"`. A device without enough telemetry to score
    #: reports nothing rather than a default: a zero here would render as a failing pump.
    health_score: float | None = None
    pttf_hours: float | None = None
    pttf_out_of_range: bool | None = None
    model_version: str | None = None
    #: Timestamp of the newest reading in the scored window — what the score is *about*.
    observed_at: datetime | None = None
    #: When the score was computed. Both are reported because item 3.3 is a latency claim,
    #: and one timestamp cannot evidence the gap between observation and reaction.
    scored_at: datetime | None = None
    contributions: list[SignalContribution] = Field(default_factory=list)
    simulated: bool = True
    #: Why the asset is unscoreable, when it is. Absent on a successful score.
    detail: str | None = None


class WorklistItem(BaseModel):
    """One row of the risk-ranked worklist (scored item 3.5)."""

    rank: int
    asset_id: str
    branch: str | None = None
    health_score: float
    pttf_hours: float | None = None
    status: TwinStatus
    model_version: str
    scored_at: datetime
    simulated: bool = True


class FeedbackRequest(BaseModel):
    """A technician's verdict on a prediction (scored item 3.4)."""

    asset_id: str = Field(..., description="Device the feedback is about; must be on the roster.")
    verdict: Verdict = Field(..., description="confirmed | false_alarm | repaired | deferred")
    note: str | None = Field(default=None, max_length=2000)
    submitted_by: str | None = Field(default=None, max_length=200)
    #: What the model predicted when the technician looked. Optional so a judge can POST a
    #: minimal body straight from Swagger UI and still get a 200.
    predicted_health: float | None = None
    predicted_pttf_hours: float | None = None
    model_version: str | None = None


class FeedbackAck(BaseModel):
    """Proof the feedback was PERSISTED, not merely accepted (scored item 3.4).

    `id` is the database identity of the stored row. Returning it is what makes "200 and
    persisted" checkable by a judge in one step — without it, a route that dropped the
    payload on the floor would look identical from the browser.
    """

    id: int
    asset_id: str
    verdict: Verdict
    created_at: datetime
    stored: bool = True


class RcaResponse(BaseModel):
    """Top contributing signals behind an asset's current health (scored item 3.6)."""

    asset_id: str
    model_version: str | None = None
    observed_at: datetime | None = None
    #: Ranked by absolute contribution, largest first. Empty only when unscoreable.
    contributions: list[SignalContribution] = Field(default_factory=list)
    simulated: bool = True
    detail: str | None = None


# ── model card + two-dataset comparison (slice S9-A, scored items 3.1 / 3.2) ────────────
#
# `GET /api/model` is the on-screen source for item 3.1 (the trained model, its algorithm
# and parameters) and item 3.2 (Health/PTTF differ across ≥2 datasets). The card fields
# come from the `model_card.json` that shipped WITH the loaded artifact; the two datasets
# are scored through that same artifact. Every value is SIMULATED — the model was fitted on
# generated lifecycles.


class EstimatorCard(BaseModel):
    """One fitted estimator's public description (item 3.1)."""

    estimator_class: str
    #: Serialisable `get_params()` of the fitted estimator, as recorded in the card.
    hyperparameters: dict[str, Any]
    target: str
    units: str
    preprocessing: list[str] = Field(default_factory=list)


class MetricPair(BaseModel):
    """Held-out error of the model against a dummy baseline (item 3.1/3.2 evidence)."""

    model_mae: float
    baseline_mae: float


class DatasetScore(BaseModel):
    """Health and PTTF for one reserved demo lifecycle, scored through the shipped artifact.

    `name` is `healthy` or `degraded`. That these two differ materially is scored item 3.2.
    The two are scored at IN-DOMAIN windows: the healthy (censored) run at its first window,
    the failing run at its last window ending BEFORE failure — the model's honest view of a
    device about to fail, not a post-failure saturation the model was never trained on.
    """

    name: str
    lifecycle_id: str
    health_score: float
    pttf_hours: float
    #: True when PTTF sits at the top of the range the model was trained on, so it must be
    #: read as "at least this long" — surfaced (not dropped) so a large PTTF is not presented
    #: as an exact estimate. A healthy demo device is censored, so this is normally True for it.
    pttf_out_of_range: bool
    status: TwinStatus


class ModelCardResponse(BaseModel):
    """The trained-model card + the two-dataset comparison (scored items 3.1 and 3.2)."""

    model_version: str
    #: Keyed by target (`health`, `pttf`).
    pipelines: dict[str, EstimatorCard]
    metrics: dict[str, MetricPair]
    data_sha256: str
    created_from: dict[str, int] = Field(default_factory=dict)
    censoring: dict[str, Any] = Field(default_factory=dict)
    limitations: list[str] = Field(default_factory=list)
    #: [healthy, degraded], scored live through the loaded artifact (item 3.2).
    datasets: list[DatasetScore] = Field(default_factory=list)
    simulated: bool = True


# ── curated real data (PR-6, ผนวก ๕/๖ role dashboards) ─────────────────────────────────
#
# These are the ONLY values in this API that are not simulated. They come from
# `data/curated/water_sold_by_branch.csv` — real PWA water-sold figures for 234 branches
# over 39 months — so none of them carries a `simulated` flag, and none of them may be
# rendered with a SIMULATED marker either. Mislabelling real data is the mirror image of
# the honesty rule and is just as wrong.
#
# Identity note: a branch IS its `branch_code`. Labels are not stable — code 5551014 is
# recorded as บ้านนาสาร in earlier months and เวียงสระ in later ones, which is why the
# dataset has 234 codes but 235 labels. See `simulator/app/roster.py`.


class RegionTotal(BaseModel):
    """One region's share of a month's national total."""

    region: int
    water_sold_m3: float
    #: COUNT DISTINCT branch_code reporting in that month.
    branch_count: int


class RegionRollup(BaseModel):
    """National roll-up for one month (ผนวก ๕ §2.1)."""

    month: str = Field(..., description="YYYY-MM")
    total_m3: float
    #: COUNT DISTINCT branch_code nationally. 234 for a complete month, never 235.
    branch_count: int
    #: Sorted by water_sold_m3 descending.
    regions: list[RegionTotal] = Field(default_factory=list)


class BranchRow(BaseModel):
    """One row of a region's branch league table (ผนวก ๖ §2.1)."""

    #: 1-based over the DEFAULT sort (volume desc) and STORED, so a client-side re-sort
    #: does not renumber it — rank means "rank by volume", not "row position"
    #: (design/INTERACTIONS.md §Sorting).
    rank: int
    branch_code: str
    #: The label recorded in THIS month's row. A per-month table shows the name in use
    #: that month; no cross-month reconciliation is applied here.
    branch: str
    province: str
    region: int
    water_sold_m3: float
    #: None — never 0.0 — when the comparison month has no row for this branch_code, or
    #: when its baseline is 0 (a zero baseline has no defined percentage change).
    mom_pct: float | None = None
    yoy_pct: float | None = None


class SeriesPoint(BaseModel):
    """One month of one branch's history."""

    month: str
    water_sold_m3: float


class BranchSeries(BaseModel):
    """A single branch's monthly history (ผนวก ๗)."""

    branch_code: str
    #: Resolved AS-OF the latest month present for this code, so the header describes the
    #: current network rather than a union of history.
    branch: str
    province: str
    region: int
    #: Ascending by month. Gaps are NOT filled — a missing month is absent, not zero.
    points: list[SeriesPoint] = Field(default_factory=list)


class CuratedMonths(BaseModel):
    """Months available in the curated dataset."""

    months: list[str] = Field(default_factory=list)
    count: int


# ── digital twin topology (slice S4a, scored items 2.1 / 2.3 / 2.4) ────────────────────
#
# The topology, its coordinates and the five customer ids are SIMULATED — generated by
# `scripts/seed_db.py`, with no real customer PII. Only `branch` comes from the real
# curated roster. Coordinates are SCHEMATIC (a process diagram), not GIS.


class TwinNode(BaseModel):
    """A junction in the process schematic."""

    node: str
    x: float
    y: float


class TwinPipe(BaseModel):
    """One edge, with the geometry needed to draw it.

    `pipe_id` is NOT unique: the primary key is (pipe_id, from_node, to_node), so a single
    id can name several edges and every one of them matters to an impact query.
    """

    pipe_id: str
    from_node: str
    to_node: str
    dma: str | None = None
    x1: float
    y1: float
    x2: float
    y2: float


class TwinDeviceView(BaseModel):
    """A device placed on the schematic, with its latest known status."""

    asset_id: str
    kind: DeviceKind
    node: str
    x: float
    y: float
    dma: str | None = None
    status: TwinStatus = "nodata"
    simulated: bool = True


class TwinTopology(BaseModel):
    """Everything `ProcessSchematic` needs to draw itself — nothing hardcoded client-side."""

    nodes: list[TwinNode] = Field(default_factory=list)
    pipes: list[TwinPipe] = Field(default_factory=list)
    devices: list[TwinDeviceView] = Field(default_factory=list)
    simulated: bool = True


class AffectedCustomer(BaseModel):
    """A service point downstream of a failed pipe. SIMULATED — a generated id, no PII."""

    customer_id: str
    node: str
    area: str
    branch: str


class ImpactResponse(BaseModel):
    """Who loses water when `pipe_id` fails (scored item 2.4)."""

    pipe_id: str
    #: Every edge traversed, sorted. More than one edge can share `pipe_id`.
    affected_pipe_ids: list[str] = Field(default_factory=list)
    #: Deduplicated by customer_id and sorted by it, so the UI does not reshuffle.
    customers: list[AffectedCustomer] = Field(default_factory=list)
    count: int = 0
    simulated: bool = True


class SecResponse(BaseModel):
    """Specific Energy Consumption, kWh/m3 (scored item 2.3).

    A known asset with no usable pair returns 200 with `sec_kwh_per_m3 = None` and a
    `detail`, mirroring how `/api/health` reports `nodata`. 404 is reserved for an asset
    that is not on the roster at all. A confident number computed from two readings taken
    far apart is worse than an em dash.
    """

    asset_id: str
    sec_kwh_per_m3: float | None = None
    power_kw: float | None = None
    flow_m3h: float | None = None
    #: Each signal carries its OWN timestamp: telemetry stores one signal per row and the
    #: simulator cycles signals, so the two readings normally differ in time.
    power_observed_at: datetime | None = None
    flow_observed_at: datetime | None = None
    #: |power_observed_at - flow_observed_at| in seconds; None when either is missing.
    skew_s: float | None = None
    simulated: bool = True
    detail: str | None = None


class SignalBand(BaseModel):
    """One signal's plausible operating band, exposed so the twin can classify direction."""

    low: float
    high: float


class BandsResponse(BaseModel):
    """The physical operating bands, keyed by signal (scored item 2.4).

    Read-only static constants. The frontend uses them to distinguish a pressure DROP
    (value below `low`) from a spike (value above `high`) without hardcoding thresholds.
    """

    bands: dict[str, SignalBand]
    simulated: bool = True
