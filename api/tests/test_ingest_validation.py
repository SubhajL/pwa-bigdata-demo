"""Pure decode/validate logic for the ingest hot path (slice S2).

These are the functions that decide TELEMETRY vs DEAD_LETTER. They are deliberately
pure — the roster is injected rather than fetched — so the decision is testable without
a broker or a database, and so `validate()` cannot accidentally issue a query per message.

R1.5 (10 pts) rides on the rejection cases below being exhaustive and never raising past
the caller.
"""
from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest

from app.ingest import DecodeError, MessageRejected, decode, validate

KNOWN = frozenset({"PWA-5511011-P1", "P-2"})


def _payload(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "message_id": "m-1",
        "run_id": "r-1",
        "ts": "2026-07-29T03:00:00+00:00",
        "asset_id": "PWA-5511011-P1",
        "signal": "pressure_bar",
        "value": 3.5,
    }
    base.update(overrides)
    return base


# ── decode ──────────────────────────────────────────────────────────────────


def test_decode_accepts_a_json_object() -> None:
    assert decode(json.dumps(_payload()).encode()) == _payload()


@pytest.mark.parametrize(
    ("raw", "why"),
    [
        (b"{not json at all", "malformed JSON"),
        (b"\xff\xfe\x00", "invalid UTF-8"),
        (b"[1, 2, 3]", "JSON array, not an object"),
        (b'"just a string"', "JSON scalar, not an object"),
        (b"", "empty payload"),
    ],
)
def test_decode_rejects_non_object_payloads(raw: bytes, why: str) -> None:
    """Every one of these must DEAD-LETTER, never bypass the pipeline or crash it."""
    with pytest.raises(DecodeError):
        decode(raw)


def test_decode_error_carries_the_original_bytes() -> None:
    """The DLQ stores the raw payload, so it must survive the failure path intact."""
    raw = b"\xff\xfe not utf8"
    with pytest.raises(DecodeError) as exc:
        decode(raw)
    assert exc.value.raw == raw


# ── validate ────────────────────────────────────────────────────────────────


def test_validate_accepts_a_known_asset() -> None:
    reading = validate(_payload(), KNOWN)

    assert reading.asset_id == "PWA-5511011-P1"
    assert reading.signal == "pressure_bar"
    assert reading.value == 3.5
    assert reading.message_id == "m-1"
    assert reading.run_id == "r-1"
    assert reading.ts == datetime(2026, 7, 29, 3, 0, tzinfo=UTC)


def test_validate_rejects_an_unknown_asset_id() -> None:
    """The headline R1.5 case: the simulator's BAD_ASSET fault mode."""
    with pytest.raises(MessageRejected) as exc:
        validate(_payload(asset_id="PWA-UNKNOWN-DEVICE-000"), KNOWN)

    assert "asset" in exc.value.reason.lower()
    assert exc.value.asset_id == "PWA-UNKNOWN-DEVICE-000"


@pytest.mark.parametrize(
    ("overrides", "expected_in_reason"),
    [
        ({"signal": "not_a_signal"}, "signal"),
        ({"value": "high"}, "value"),
        ({"value": float("nan")}, "value"),
        ({"value": float("inf")}, "value"),
        ({"ts": "2026-07-29T03:00:00"}, "timezone"),
        ({"ts": "not-a-date"}, "ts"),
        ({"message_id": ""}, "message_id"),
        ({"run_id": ""}, "run_id"),
    ],
)
def test_validate_rejects_malformed_fields(
    overrides: dict[str, object], expected_in_reason: str
) -> None:
    with pytest.raises(MessageRejected) as exc:
        validate(_payload(**overrides), KNOWN)

    assert expected_in_reason in exc.value.reason.lower()


@pytest.mark.parametrize("missing", ["message_id", "run_id", "ts", "asset_id", "signal", "value"])
def test_validate_rejects_a_missing_required_field(missing: str) -> None:
    payload = _payload()
    del payload[missing]

    with pytest.raises(MessageRejected) as exc:
        validate(payload, KNOWN)

    assert missing in exc.value.reason


def test_validate_never_returns_a_partial_reading() -> None:
    """A rejection must raise, not hand back a half-built Reading."""
    with pytest.raises(MessageRejected):
        validate(_payload(value=None), KNOWN)


def test_validate_is_pure_and_takes_the_roster_as_an_argument() -> None:
    """No DB lookup per message: swapping the roster changes the verdict, nothing else."""
    payload = _payload(asset_id="P-2")

    assert validate(payload, KNOWN).asset_id == "P-2"
    with pytest.raises(MessageRejected):
        validate(payload, frozenset({"other"}))


def test_naive_timestamp_is_rejected_rather_than_assumed_utc() -> None:
    """Silently assuming UTC would attribute readings to the wrong hour (Thailand is +07)."""
    with pytest.raises(MessageRejected):
        validate(_payload(ts="2026-07-29T03:00:00"), KNOWN)
