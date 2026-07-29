"""Config invariants that the wire contract depends on.

`run_id` is not cosmetic. `message_id` is `uuid5(NS, run_id|asset_id|tick)`, and the
S2 consumer stores `message_id` as the primary key of its ingress ledger with
ON CONFLICT DO NOTHING. If two simulator runs share a run_id, every message of the
second run collides with the first and is silently dropped as a duplicate — the
pipeline reports healthy and ingests nothing. So a blank run_id must never survive.
"""
from __future__ import annotations

import pytest

from app.config import SimSettings, get_settings


def test_blank_run_id_env_still_yields_a_unique_run_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """docker-compose declares `RUN_ID: ""`, which pydantic reads as a real value.

    An empty env var counts as "provided", so the default_factory never fires and
    run_id would be "" for every container start.
    """
    monkeypatch.setenv("RUN_ID", "")

    assert get_settings().run_id.strip(), "blank RUN_ID must fall back to a generated id"


def test_whitespace_run_id_is_also_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RUN_ID", "   ")

    assert get_settings().run_id.strip()


def test_explicit_run_id_is_honoured(monkeypatch: pytest.MonkeyPatch) -> None:
    """The demo director pins RUN_ID to label a scenario; that must still work."""
    monkeypatch.setenv("RUN_ID", "scenario-pump-anomaly-07")

    assert get_settings().run_id == "scenario-pump-anomaly-07"


def test_two_processes_get_different_run_ids(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RUN_ID", raising=False)

    assert SimSettings().run_id != SimSettings().run_id
