"""TS1.3 — every published envelope satisfies the committed wire contract.

`contracts/telemetry-envelope.v1.schema.json` is the single artifact shared with
the S2 consumer. Validating against the file (rather than against the producer's
own pydantic model) is what makes the contract real: a model change that is not
also a contract change fails here.
"""
from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

import pytest
from jsonschema import Draft202012Validator, FormatChecker

from app.models import Device, Envelope, FaultMode
from app.publish import make_envelope
from app.roster import load_devices


@pytest.fixture(scope="module")
def validator(envelope_schema: dict[str, Any]) -> Draft202012Validator:
    Draft202012Validator.check_schema(envelope_schema)
    return Draft202012Validator(envelope_schema, format_checker=FormatChecker())


def _as_wire(env: Envelope) -> dict[str, Any]:
    """Serialise exactly the way run() puts bytes on the wire."""
    payload: dict[str, Any] = json.loads(env.model_dump_json())
    return payload


def test_envelope_matches_committed_contract(validator: Draft202012Validator) -> None:
    device = load_devices()[0]
    payload = _as_wire(make_envelope(device, tick=0, run_id="run-a", mode=FaultMode.NORMAL))

    validator.validate(payload)
    assert payload["asset_id"] == device.asset_id


def test_every_signal_the_simulator_emits_is_in_the_contract(
    validator: Draft202012Validator, envelope_schema: dict[str, Any]
) -> None:
    """Sweep every device KIND, not just the first N devices.

    The first 234 roster entries are all pumps, so slicing the head of the list
    exercises exactly one kind while claiming to cover all of them. Select one
    device per kind explicitly instead.
    """
    allowed = set(envelope_schema["properties"]["signal"]["enum"])
    roster = load_devices()
    per_kind: dict[str, Device] = {str(d.kind): d for d in reversed(roster)}
    assert set(per_kind) >= {"pump", "motor", "valve"}, (
        f"roster does not cover the demo kinds; got {sorted(per_kind)}"
    )

    seen_by_kind: dict[str, set[str]] = {}
    for kind, device in per_kind.items():
        for tick in range(12):
            payload = _as_wire(
                make_envelope(device, tick=tick, run_id="run-a", mode=FaultMode.NORMAL)
            )
            validator.validate(payload)
            seen_by_kind.setdefault(kind, set()).add(payload["signal"])

    for kind, signals in seen_by_kind.items():
        assert signals, f"{kind} emitted no signals"
        outside = sorted(signals - allowed)
        assert not outside, f"{kind} signals outside the contract: {outside}"
    assert seen_by_kind["pump"] != seen_by_kind["valve"], (
        "a pump and a valve must not report the same signal repertoire"
    )


def test_message_id_is_stable_within_a_run_and_unique_across_runs() -> None:
    """The Codex finding: logical-event identity, not delivery identity.

    Stable for equal (run_id, asset_id, tick) so a QoS-1 redelivery is idempotent;
    different across run_ids so a simulator restart is never mistaken for a replay
    and silently suppressed.
    """
    device = load_devices()[0]

    a1 = make_envelope(device, tick=7, run_id="run-a", mode=FaultMode.NORMAL)
    a2 = make_envelope(device, tick=7, run_id="run-a", mode=FaultMode.NORMAL)
    b = make_envelope(device, tick=8, run_id="run-a", mode=FaultMode.NORMAL)
    c = make_envelope(device, tick=7, run_id="run-b", mode=FaultMode.NORMAL)

    assert a1.message_id == a2.message_id, "same (run,asset,tick) must be stable"
    assert a1.message_id != b.message_id, "different tick must differ"
    assert a1.message_id != c.message_id, "different run must differ"


def test_timestamp_is_timezone_aware_utc(validator: Draft202012Validator) -> None:
    """A naive timestamp is dead-lettered by S2, so it must never be produced."""
    device = load_devices()[0]
    env = make_envelope(device, tick=3, run_id="run-a", mode=FaultMode.NORMAL)

    assert env.ts.tzinfo is not None, "ts must be timezone-aware"
    offset = env.ts.utcoffset()
    assert offset is not None and offset == timedelta(0), (
        f"ts must be UTC specifically, not merely aware; offset was {offset}"
    )
    validator.validate(_as_wire(env))
