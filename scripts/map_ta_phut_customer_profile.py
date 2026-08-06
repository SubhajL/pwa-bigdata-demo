"""Deterministic Map Ta Phut low-pressure customer generator (PR-I, scored item 2.4).

Pure and dependency-free so both `scripts/seed_db.py` and the API test-suite import it
directly. Everything here is SIMULATED: a designed 200-account demonstration set, NOT an
observed Map Ta Phut distribution and NOT real customer data. Identifiers are unmistakably
`SIM-MTP-*`, addresses are `จำลอง` scenario labels, and no name/phone/email/national-id/
coordinate is ever produced (PWA privacy policy — see docs/data/map-ta-phut-customer-profile.md).

The dataset is fixed: exactly 200 accounts, top-level type mix 140/35/25, the subtype table
below, 120 accounts on the first downstream node and 80 on the last, and exactly 12 cumulative
monthly readings each (integer m³ so the arithmetic is exact, not float-approximate).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, fields

#: Versioned identity of this demonstration profile (config `MTP_CUSTOMER_PROFILE`).
MTP_PROFILE_VERSION = "mtp-low-pressure-200-v1"
MTP_PRESSURE_ZONE_ID = "MTP-LPZ-01"
#: Simulated Ban Chang / Rayong service geography. The GIS pipe source carries PWA code
#: 5531021 (Rayong) while the Map Ta Phut service point is PWA Ban Chang 5531022 — the
#: binding is SIMULATED and the branch label says so.
MTP_AREA = "ต.มาบตาพุด อ.เมืองระยอง จ.ระยอง"
MTP_BRANCH = "กปภ.สาขาบ้านฉาง (จำลอง)"

#: The locked joint (type_code, subtype_code) -> count table. Insertion order IS the seed
#: order, so customer_id SIM-MTP-00001.. walk these groups top to bottom. Official PWA 2026
#: classification codes assigned to SYNTHETIC accounts only.
SUBTYPE_ALLOCATION: dict[tuple[int, int], int] = {
    (1, 11): 105, (1, 13): 25, (1, 14): 5, (1, 18): 5,
    (2, 21): 5, (2, 22): 2, (2, 25): 3, (2, 26): 2, (2, 28): 10, (2, 29): 13,
    (3, 31): 2, (3, 32): 12, (3, 33): 5, (3, 34): 1, (3, 35): 1, (3, 37): 2, (3, 39): 2,
}
#: Derived top-level totals, pinned for the validator.
TYPE_ALLOCATION: dict[int, int] = {1: 140, 2: 35, 3: 25}

TOTAL_ACCOUNTS = 200
#: Distinct (type_code, subtype_code) pairs in the locked table (4 + 6 + 7). Pinned so a
#: mis-edit of the table is caught, and so docs quoting a subtype count cannot silently drift.
SUBTYPE_COUNT = 17
READINGS_PER_ACCOUNT = 12
FIRST_NODE = "n1"
LAST_NODE = "n2"
#: Accounts on the first downstream service node; the remainder hang off the last node, so
#: an upstream-corridor impact reaches all 200 and a last-leg query reaches only the 80.
FIRST_NODE_COUNT = 120

DEFAULT_END_MONTH = "2026-03"
DEFAULT_SEED = 20260804

_METER_SIZE = {1: "15 มม.", 2: "25 มม.", 3: "50 มม."}
_USAGE_BASE = {1: 18, 2: 55, 3: 240}
_USAGE_SPAN = {1: 12, 2: 60, 3: 900}
_START_REGISTER_BASE = 1000


@dataclass
class DemoCustomerProfileSeed:
    """One simulated Map Ta Phut service account (row of `demo_customer_profile`)."""

    customer_id: str
    account_no: str
    meter_no: str
    type_code: int
    subtype_code: int
    meter_size: str
    pressure_zone_id: str
    address_label: str
    area: str
    branch: str
    node: str
    profile_version: str
    simulated: bool


@dataclass
class DemoMeterReadingSeed:
    """One closed monthly meter period (row of `demo_customer_meter_reading`)."""

    customer_id: str
    period: str
    previous_reading_m3: int
    reading_m3: int
    usage_m3: int


def _ordered_pairs() -> list[tuple[int, int]]:
    """The 200 (type_code, subtype_code) pairs, expanded in the locked order."""
    pairs: list[tuple[int, int]] = []
    for (type_code, subtype_code), count in SUBTYPE_ALLOCATION.items():
        pairs.extend([(type_code, subtype_code)] * count)
    return pairs


def build_map_ta_phut_profiles() -> list[DemoCustomerProfileSeed]:
    """Exactly 200 deterministic profiles (DREP R6/R7). No rng, no wall-clock."""
    profiles: list[DemoCustomerProfileSeed] = []
    for i, (type_code, subtype_code) in enumerate(_ordered_pairs(), start=1):
        node = FIRST_NODE if i <= FIRST_NODE_COUNT else LAST_NODE
        profiles.append(
            DemoCustomerProfileSeed(
                customer_id=f"SIM-MTP-{i:05d}",
                account_no=f"SIM-MTP-ACC-{i:05d}",
                meter_no=f"SIM-MTP-MTR-{i:05d}",
                type_code=type_code,
                subtype_code=subtype_code,
                meter_size=_METER_SIZE[type_code],
                pressure_zone_id=MTP_PRESSURE_ZONE_ID,
                address_label=f"ที่อยู่จำลอง: จุดบริการ MTP-Z01-{i:03d}, {MTP_AREA}",
                area=MTP_AREA,
                branch=MTP_BRANCH,
                node=node,
                profile_version=MTP_PROFILE_VERSION,
                simulated=True,
            )
        )
    return profiles


def _months_ending(end_month: str, count: int) -> list[str]:
    """`count` "YYYY-MM" strings ending at `end_month`, ascending. Pure calendar math."""
    if count < 1:
        raise ValueError(f"count must be >= 1, got {count}")
    # Strict 4-digit year + 2-digit month, so '2026-1' or '10000-01' are refused here rather than
    # producing a period the DB CHECK would then reject (g2-qcheck round 2, Codex).
    if re.fullmatch(r"\d{4}-\d{2}", end_month) is None:
        raise ValueError(f"end_month must be exactly 'YYYY-MM', got {end_month!r}")
    year, month = (int(part) for part in end_month.split("-"))
    if not 1 <= month <= 12:
        raise ValueError(f"end_month has an invalid calendar month: {end_month!r}")
    if year < 1:
        raise ValueError(f"end_month year must be >= 0001, got {end_month!r}")
    months: list[str] = []
    for back in range(count - 1, -1, -1):
        y, m = year, month - back
        while m <= 0:
            m += 12
            y -= 1
        months.append(f"{y:04d}-{m:02d}")
    # The EARLIEST period must still be a real (>= 0001) 4-digit year — the back-walk from e.g.
    # '0001-01' underflows to year 0000, which the DB CHECK would accept but is not a real month
    # (g2-qcheck round 4, Codex). Guard the produced output, not just the input.
    if int(months[0][:4]) < 1:
        raise ValueError(f"end_month {end_month!r} underflows to a year before 0001")
    return months


def build_monthly_readings(
    profiles: list[DemoCustomerProfileSeed],
    *,
    end_month: str = DEFAULT_END_MONTH,
    seed: int = DEFAULT_SEED,
) -> list[DemoMeterReadingSeed]:
    """12 cumulative integer readings per profile ending `end_month` (DREP R8/R9)."""
    if not profiles:
        raise ValueError("cannot build readings for an empty profile list")
    months = _months_ending(end_month, READINGS_PER_ACCOUNT)
    readings: list[DemoMeterReadingSeed] = []
    for idx, profile in enumerate(profiles, start=1):
        base = _USAGE_BASE[profile.type_code]
        span = _USAGE_SPAN[profile.type_code]
        register = _START_REGISTER_BASE + (seed + idx) % 500
        for month_index, period in enumerate(months):
            usage = base + ((idx * 31 + month_index * 17 + seed) % (span + 1))
            previous = register
            register += usage
            readings.append(
                DemoMeterReadingSeed(
                    customer_id=profile.customer_id,
                    period=period,
                    previous_reading_m3=previous,
                    reading_m3=register,
                    usage_m3=usage,
                )
            )
    return readings


#: PII detectors — the SINGLE source of truth shared by the generator's validator AND the
#: seed/DB tests (imported via `find_pii`), so the two can never drift. Each catches a bare form
#: AND a separator-formatted form, so a value like `SIM-MTP-MTR-081-234-5678`, `1-2345-67890-12-3`,
#: or `13.7563 N, 100.5018 E` is refused even though it starts with a synthetic prefix
#: (g2-qcheck rounds 2-3).
PII_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(?<!\d)0\d{8,9}(?!\d)|\d{2,4}[-\s]\d{3}[-\s]\d{3,4}"), "phone"),
    (re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+"), "email"),
    (re.compile(r"(?<!\d)\d{13}(?!\d)|\d[-\s]?\d{4}[-\s]?\d{5}[-\s]?\d{2}[-\s]?\d"), "national id"),
    (re.compile(r"\d{1,3}\.\d{3,}\s*[NSEW]?\s*,\s*\d{1,3}\.\d{3,}"), "coordinate"),
)


def find_pii(text: str) -> str | None:
    """The label of the first PII kind found in `text`, else None. Scan each field value on its
    OWN — never a joined blob, which would splice `SIM-MTP-00001` and the numeric fields into a
    false phone-length digit run."""
    for pattern, label in PII_PATTERNS:
        if pattern.search(text):
            return label
    return None


def _no_pii(profiles: list[DemoCustomerProfileSeed]) -> None:
    """Reject any name/phone/email/national-id/coordinate value in any profile field.

    A secondary net only — `_check_synthetic_grammar` (an ALLOWLIST) is the primary guarantee.
    A blocklist can never catch an arbitrary name; the allowlist can."""
    for profile in profiles:
        for f in fields(profile):
            label = find_pii(str(getattr(profile, f.name)))
            if label is not None:
                raise ValueError(f"{profile.customer_id} carries a {label}-like value")


#: The EXACT synthetic grammar each string field must match. This is an ALLOWLIST: any value that
#: is not one of these fixed shapes — including an arbitrary name, which no blocklist can catch —
#: is refused, so no personal data can pass validation into the seed (g2-qcheck round 4, Codex).
# `[0-9]`, not `\d`: `\d` also matches Unicode decimal digits (Arabic-Indic, Thai, …); the
# canonical ids are ASCII only, so an ASCII-only class is the tighter allowlist (g2-qcheck round 5).
_CUSTOMER_ID_RE = re.compile(r"SIM-MTP-[0-9]{5}")
_ACCOUNT_RE = re.compile(r"SIM-MTP-ACC-[0-9]{5}")
_METER_RE = re.compile(r"SIM-MTP-MTR-[0-9]{5}")
_ADDRESS_RE = re.compile(rf"ที่อยู่จำลอง: จุดบริการ MTP-Z01-[0-9]{{3}}, {re.escape(MTP_AREA)}")
_METER_SIZES = frozenset(_METER_SIZE.values())


def _check_synthetic_grammar(profiles: list[DemoCustomerProfileSeed]) -> None:
    """Every string field must match its exact synthetic shape (allowlist). Fail-closed."""
    for p in profiles:
        checks = (
            (_CUSTOMER_ID_RE.fullmatch(p.customer_id), "customer_id"),
            (_ACCOUNT_RE.fullmatch(p.account_no), "account_no"),
            (_METER_RE.fullmatch(p.meter_no), "meter_no"),
            (_ADDRESS_RE.fullmatch(p.address_label), "address_label"),
        )
        for matched, field_name in checks:
            if matched is None:
                raise ValueError(f"{p.customer_id}: {field_name} is not the exact synthetic form")
        if p.area != MTP_AREA or p.branch != MTP_BRANCH:
            raise ValueError(f"{p.customer_id}: area/branch is not the fixed MTP label")
        if p.meter_size not in _METER_SIZES or p.pressure_zone_id != MTP_PRESSURE_ZONE_ID:
            raise ValueError(f"{p.customer_id}: meter_size/pressure_zone is not a known value")
        if p.node not in (FIRST_NODE, LAST_NODE) or p.profile_version != MTP_PROFILE_VERSION:
            raise ValueError(f"{p.customer_id}: node/profile_version is not a known value")
        if p.simulated is not True:
            raise ValueError(f"{p.customer_id} is not marked simulated")


def validate_demo_customer_profile(
    profiles: list[DemoCustomerProfileSeed],
    readings: list[DemoMeterReadingSeed],
) -> None:
    """Fail-closed dataset check run in the seed BEFORE any DB write (DREP R10).

    Raises ValueError naming the first violated invariant.
    """
    from collections import Counter

    if len(profiles) != TOTAL_ACCOUNTS:
        raise ValueError(f"expected {TOTAL_ACCOUNTS} profiles, got {len(profiles)}")
    if Counter(p.type_code for p in profiles) != TYPE_ALLOCATION:
        raise ValueError("top-level type distribution is not 140/35/25")
    if Counter((p.type_code, p.subtype_code) for p in profiles) != SUBTYPE_ALLOCATION:
        raise ValueError("joint (type, subtype) distribution drifted from the locked table")
    if Counter(p.node for p in profiles) != {FIRST_NODE: FIRST_NODE_COUNT,
                                             LAST_NODE: TOTAL_ACCOUNTS - FIRST_NODE_COUNT}:
        raise ValueError("node binding is not 120/80")
    _check_synthetic_grammar(profiles)  # ALLOWLIST — primary no-PII guarantee
    for attr in ("customer_id", "account_no", "meter_no"):
        values = [getattr(p, attr) for p in profiles]
        if len(set(values)) != len(values):
            raise ValueError(f"duplicate {attr}")
    _no_pii(profiles)  # secondary blocklist net
    _validate_readings(profiles, readings)


def _validate_readings(
    profiles: list[DemoCustomerProfileSeed],
    readings: list[DemoMeterReadingSeed],
) -> None:
    from collections import defaultdict

    if len(readings) != TOTAL_ACCOUNTS * READINGS_PER_ACCOUNT:
        raise ValueError(f"expected {TOTAL_ACCOUNTS * READINGS_PER_ACCOUNT} readings")
    by_customer: dict[str, list[DemoMeterReadingSeed]] = defaultdict(list)
    for r in readings:
        by_customer[r.customer_id].append(r)
    if set(by_customer) != {p.customer_id for p in profiles}:
        raise ValueError("readings do not cover exactly the profiled customers")
    for rows in by_customer.values():
        rows.sort(key=lambda r: r.period)
        if len(rows) != READINGS_PER_ACCOUNT or len({r.period for r in rows}) != READINGS_PER_ACCOUNT:
            raise ValueError("an account does not have 12 distinct monthly periods")
        prev: DemoMeterReadingSeed | None = None
        for r in rows:
            if r.usage_m3 != r.reading_m3 - r.previous_reading_m3 or r.usage_m3 < 0:
                raise ValueError(f"reading arithmetic broken for {r.customer_id} {r.period}")
            if prev is not None and r.previous_reading_m3 != prev.reading_m3:
                raise ValueError(f"reading continuity broken for {r.customer_id} {r.period}")
            prev = r
