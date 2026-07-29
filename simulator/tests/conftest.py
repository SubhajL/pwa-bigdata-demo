"""Fixtures for the S1 acceptance tests.

The broker fixture starts a REAL Mosquitto (per the repo rule: the pipeline is not
mock-tested — a mock would assert our belief about the broker, not its behaviour).
"""
from __future__ import annotations

import json
import shutil
import socket
import subprocess
import sys
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "contracts" / "telemetry-envelope.v1.schema.json"
MOSQUITTO_IMAGE = "eclipse-mosquitto:2.0.20"


def pytest_sessionstart(session: pytest.Session) -> None:
    """Let tests import `scripts/seed_db.py` for the roster drift oracle."""
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))


@pytest.fixture(scope="session")
def repo_root() -> Path:
    return REPO_ROOT


@pytest.fixture(scope="session")
def envelope_schema() -> dict[str, Any]:
    """The committed wire contract shared with the S2 consumer."""
    assert SCHEMA_PATH.is_file(), f"missing wire contract: {SCHEMA_PATH}"
    with SCHEMA_PATH.open(encoding="utf-8") as fh:
        schema: dict[str, Any] = json.load(fh)
    return schema


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port: int = s.getsockname()[1]
    return port


def _wait_for_port(port: int, timeout: float = 20.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1.0):
                return
        except OSError:
            time.sleep(0.2)
    raise RuntimeError(f"mosquitto did not open port {port} within {timeout}s")


@pytest.fixture(scope="session")
def mosquitto() -> Iterator[int]:
    """A throwaway anonymous broker. Yields the host port.

    Skips (never fails) when Docker is unavailable, so a missing broker is
    distinguishable from a publishing defect — that separation is what makes the
    RED-proof of TS1.5 meaningful.
    """
    if shutil.which("docker") is None:
        pytest.skip("docker not available; integration test needs a real broker")
    port = _free_port()
    # Docker IS present, so a broker that refuses to start is an infrastructure
    # failure, not an absent optional capability. Skipping here would turn a broken
    # gate green — the integration coverage would silently stop running.
    cid = subprocess.run(
        [
            "docker", "run", "-d", "--rm",
            "-p", f"127.0.0.1:{port}:1883",
            MOSQUITTO_IMAGE,
            "mosquitto", "-c", "/mosquitto-no-auth.conf",
        ],
        capture_output=True, text=True, check=True, timeout=120,
    ).stdout.strip()
    try:
        _wait_for_port(port)
        yield port
    finally:
        subprocess.run(["docker", "kill", cid], capture_output=True, timeout=60)
