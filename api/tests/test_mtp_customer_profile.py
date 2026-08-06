"""PR-I S2 — the pure Map Ta Phut customer/reading generator (DREP R4–R10).

No database: this pins the deterministic dataset the seed later persists. The generator
lives in `scripts/` and is import-safe (no simulator dependency), so both `seed_db.py` and
this suite import it directly; `conftest.pytest_sessionstart` puts REPO_ROOT on the path.

The locked design is a DEMONSTRATION dataset, not a Map Ta Phut statistic: exactly 200
accounts, top-level type mix 140/35/25, and the fixed subtype table below.

Authored by Claude; the implementer must not modify this file (DREP §10).
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import fields

import pytest
from scripts.map_ta_phut_customer_profile import (
    MTP_AREA,
    MTP_BRANCH,
    MTP_PRESSURE_ZONE_ID,
    MTP_PROFILE_VERSION,
    SUBTYPE_ALLOCATION,
    SUBTYPE_COUNT,
    DemoMeterReadingSeed,
    build_map_ta_phut_profiles,
    build_monthly_readings,
    find_pii,
    validate_demo_customer_profile,
)


def test_profile_has_exactly_200_accounts() -> None:
    assert len(build_map_ta_phut_profiles()) == 200


def test_top_level_type_distribution_is_140_35_25() -> None:
    profiles = build_map_ta_phut_profiles()
    assert Counter(p.type_code for p in profiles) == {1: 140, 2: 35, 3: 25}


def test_joint_type_subtype_distribution_matches_the_locked_table() -> None:
    """Independent type and subtype counters both pass even if subtype 21 were wrongly
    attached to top-level type 1. This pins the (type, subtype) PAIR (Codex §3)."""
    profiles = build_map_ta_phut_profiles()
    assert Counter((p.type_code, p.subtype_code) for p in profiles) == dict(SUBTYPE_ALLOCATION)


def test_every_subtype_sits_under_its_correct_top_level_type() -> None:
    profiles = build_map_ta_phut_profiles()
    expected_type = {subtype: type_code for (type_code, subtype) in SUBTYPE_ALLOCATION}
    for p in profiles:
        assert p.type_code == expected_type[p.subtype_code]


def test_ids_are_unmistakably_synthetic_and_unique() -> None:
    profiles = build_map_ta_phut_profiles()
    for p in profiles:
        assert p.customer_id.startswith("SIM-MTP-")
        assert p.account_no.startswith("SIM-MTP-")
        assert p.meter_no.startswith("SIM-MTP-")
    for attr in ("customer_id", "account_no", "meter_no"):
        values = [getattr(p, attr) for p in profiles]
        assert len(set(values)) == 200, f"{attr} is not unique"


def test_addresses_and_geography_are_simulated_ban_chang_rayong() -> None:
    profiles = build_map_ta_phut_profiles()
    for p in profiles:
        assert "จำลอง" in p.address_label
        assert p.area == MTP_AREA
        assert p.branch == MTP_BRANCH
    assert "จำลอง" in MTP_BRANCH, "the branch label itself must read as simulated"


def test_no_personal_or_pii_like_fields() -> None:
    """No name/phone/email/national id / coordinate in any profile field, using the SAME shared
    `find_pii` the validator uses (one source of truth — g2-qcheck round 3)."""
    profiles = build_map_ta_phut_profiles()
    for p in profiles:
        for f in fields(p):
            value = str(getattr(p, f.name))
            assert find_pii(value) is None, f"PII-like value in {p.customer_id}.{f.name}: {value!r}"


def test_subtype_table_has_exactly_seventeen_pairs() -> None:
    """The locked table is 4 + 6 + 7 = 17 distinct (type, subtype) pairs — pinned so docs quoting
    a subtype count cannot drift from the data (g2-qcheck round 3)."""
    assert len(SUBTYPE_ALLOCATION) == SUBTYPE_COUNT == 17
    assert len({subtype for _type, subtype in SUBTYPE_ALLOCATION}) == 17


def test_pressure_zone_and_profile_version_are_pinned() -> None:
    profiles = build_map_ta_phut_profiles()
    assert MTP_PROFILE_VERSION == "mtp-low-pressure-200-v1"
    for p in profiles:
        assert p.pressure_zone_id == MTP_PRESSURE_ZONE_ID == "MTP-LPZ-01"
        assert p.profile_version == MTP_PROFILE_VERSION
        assert p.simulated is True


def test_node_binding_is_120_on_the_first_node_and_80_on_the_last() -> None:
    """Upstream corridor reaches 200; the last leg reaches only its 80 (traversal proof
    lives in test_topology; this pins the seed side)."""
    profiles = build_map_ta_phut_profiles()
    assert Counter(p.node for p in profiles) == {"n1": 120, "n2": 80}


def test_each_account_has_exactly_twelve_readings_2400_total() -> None:
    profiles = build_map_ta_phut_profiles()
    readings = build_monthly_readings(profiles)
    assert len(readings) == 2400
    per_customer = Counter(r.customer_id for r in readings)
    assert set(per_customer.values()) == {12}
    assert set(per_customer) == {p.customer_id for p in profiles}


def test_readings_are_cumulative_arithmetically_consistent_and_continuous() -> None:
    profiles = build_map_ta_phut_profiles()
    readings = build_monthly_readings(profiles)
    by_customer: dict[str, list[DemoMeterReadingSeed]] = defaultdict(list)
    for r in readings:
        by_customer[r.customer_id].append(r)
    for rows in by_customer.values():
        rows.sort(key=lambda r: r.period)
        periods = [r.period for r in rows]
        assert periods == sorted(periods) and len(set(periods)) == 12
        prev = None
        for r in rows:
            assert isinstance(r.reading_m3, int) and isinstance(r.usage_m3, int)
            assert r.usage_m3 == r.reading_m3 - r.previous_reading_m3
            assert r.reading_m3 >= r.previous_reading_m3
            assert r.usage_m3 >= 0
            if prev is not None:
                assert r.previous_reading_m3 == prev.reading_m3, "period continuity broken"
            prev = r


def test_generator_is_reproducible_for_a_fixed_seed_and_month() -> None:
    """Two calls must be byte-identical — no wall-clock, no unseeded rng (Codex §3)."""
    assert build_map_ta_phut_profiles() == build_map_ta_phut_profiles()
    profiles = build_map_ta_phut_profiles()
    assert build_monthly_readings(profiles) == build_monthly_readings(profiles)


def test_periods_are_the_fixed_twelve_months_not_wall_clock_relative() -> None:
    """Pins the exact periods so a `date.today()`-relative implementation (which two immediate
    calls would NOT catch) fails here instead (Codex §3)."""
    readings = build_monthly_readings(build_map_ta_phut_profiles())
    assert sorted({r.period for r in readings}) == [
        "2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09",
        "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
    ]


@pytest.mark.parametrize(
    "bad_month",
    ["2026-13", "2026-00", "2026-1", "10000-01", "0000-01", "0001-01", "not-a-month"],
)
def test_build_monthly_readings_rejects_a_malformed_end_month(bad_month: str) -> None:
    """Strict 'YYYY-MM', real calendar month, and no year-underflow — '0001-01' back-walks to year
    0000 which is not a real month, so it is refused too (g2-qcheck rounds 2-4)."""
    profiles = build_map_ta_phut_profiles()
    with pytest.raises(ValueError):
        build_monthly_readings(profiles, end_month=bad_month)


def test_validate_accepts_the_canonical_dataset() -> None:
    profiles = build_map_ta_phut_profiles()
    readings = build_monthly_readings(profiles)
    validate_demo_customer_profile(profiles, readings)  # must not raise


def test_validate_is_fail_closed_on_a_wrong_count() -> None:
    profiles = build_map_ta_phut_profiles()
    readings = build_monthly_readings(profiles)
    with pytest.raises(ValueError):
        validate_demo_customer_profile(profiles[:199], readings)


def test_validate_is_fail_closed_on_a_non_synthetic_id() -> None:
    import dataclasses

    profiles = build_map_ta_phut_profiles()
    readings = build_monthly_readings(profiles)
    tampered = [dataclasses.replace(profiles[0], account_no="REAL-000001"), *profiles[1:]]
    with pytest.raises(ValueError):
        validate_demo_customer_profile(tampered, readings)


@pytest.mark.parametrize(
    "pii",
    [
        "081-234-5678",           # hyphenated phone
        "081.234.5678",           # dotted phone (a blocklist would miss this)
        "1-2345-67890-12-3",      # separator-formatted 13-digit national id
        "13.7563 N, 100.5018 E",  # coordinates
        "13.75 N, 100.50 E",      # short-decimal coordinates (a blocklist would miss this)
        "resident@example.com",   # email
        "สมชาย ใจดี",              # a plausible Thai NAME — no blocklist can catch this
    ],
)
def test_validate_rejects_pii_embedded_after_the_address_marker(pii: str) -> None:
    """Anything after `ที่อยู่จำลอง:` that is not the exact synthetic address is refused by the
    ALLOWLIST — including a name, which the PII blocklist could never catch (g2-qcheck round 4)."""
    import dataclasses

    profiles = build_map_ta_phut_profiles()
    readings = build_monthly_readings(profiles)
    tampered = [
        dataclasses.replace(profiles[0], address_label=f"ที่อยู่จำลอง: {pii}"),
        *profiles[1:],
    ]
    with pytest.raises(ValueError):
        validate_demo_customer_profile(tampered, readings)
