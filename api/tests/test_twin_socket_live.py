"""The WebSocket route against a real server — the leak `TestClient` cannot show.

A disconnect reaches an ASGI app as a *receive* event. A handler that only awaits the
outbound queue therefore never observes a client that goes away while telemetry is quiet,
and its subscriber leaks. With admission capped, enough leaked subscribers eventually
refuse a real client — so this is the failure that turns a tidy invariant into an outage.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import uuid
from collections.abc import Iterator

import httpx
import pytest
import websockets.sync.client as wsclient

from .conftest import REPO_ROOT, _free_port, _wait_for_port

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def live_ws_api(timescale_dsn: str) -> Iterator[str]:
    """uvicorn with ingest ENABLED but no broker, so the hub exists and stays quiet."""
    port = _free_port()
    env = {
        **os.environ,
        "DATABASE_URL": timescale_dsn,
        "MQTT_ENABLED": "1",
        "MQTT_HOST": "127.0.0.1",
        "MQTT_PORT": str(_free_port()),   # deliberately nothing listening: no telemetry
        "API_RUN_ID": f"wslive-{uuid.uuid4().hex[:8]}",
    }
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app",
         "--host", "127.0.0.1", "--port", str(port), "--workers", "1", "--log-level", "warning"],
        cwd=REPO_ROOT / "api", env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    try:
        _wait_for_port(port, timeout=60)
        base = f"http://127.0.0.1:{port}"
        for _ in range(60):
            try:
                if httpx.get(f"{base}/healthz", timeout=2.0).status_code == 200:
                    break
            except httpx.HTTPError:
                time.sleep(0.25)
        else:
            raise RuntimeError("uvicorn never became healthy")
        yield base
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=20)
        except subprocess.TimeoutExpired:
            proc.kill()


def _twin_url(base: str) -> str:
    return base.replace("http://", "ws://") + "/ws/twin"


def _await_subscribers(base: str, expected: int, timeout: float = 15.0) -> int:
    """Poll until the hub reports `expected` subscribers, or give up.

    Reaping happens on the server's event loop, so asserting after a fixed sleep makes the
    test a race against a loaded machine rather than a test of the behaviour.
    """
    deadline = time.monotonic() + timeout
    seen = -1
    while time.monotonic() < deadline:
        seen = httpx.get(f"{base}/api/pipeline/status", timeout=10).json()["twin_subscribers"]
        if seen == expected:
            return seen
        time.sleep(0.1)
    return seen


def test_an_idle_client_that_disconnects_does_not_leak_a_subscriber(live_ws_api: str) -> None:
    """Connect and drop repeatedly while nothing is being published.

    Under the send-only implementation each cycle leaked a subscriber, because no receive
    was ever performed and so the disconnect was never observed.
    """
    url = _twin_url(live_ws_api)
    cycles = 12

    for _ in range(cycles):
        with wsclient.connect(url, open_timeout=15):
            pass  # connect, then close immediately without reading anything
        time.sleep(0.05)

    remaining = _await_subscribers(live_ws_api, 0)

    assert remaining == 0, (
        f"{remaining} subscribers still registered after {cycles} connect/disconnect "
        "cycles with no traffic — sockets are leaking"
    )


def test_a_connected_client_is_counted_then_released(live_ws_api: str) -> None:
    url = _twin_url(live_ws_api)

    with wsclient.connect(url, open_timeout=15):
        during = _await_subscribers(live_ws_api, 1)

    after = _await_subscribers(live_ws_api, 0)

    assert during == 1
    assert after == 0


def test_the_socket_accepts_and_stays_open_while_idle(live_ws_api: str) -> None:
    """No telemetry is flowing, so the socket must simply stay open rather than error."""
    with wsclient.connect(_twin_url(live_ws_api), open_timeout=15) as ws:
        with pytest.raises(TimeoutError):
            ws.recv(timeout=1.5)
        ws.ping()          # still alive
        payload = json.dumps({"hello": "twin"})
        ws.send(payload)   # inbound traffic must not upset the sender task
        time.sleep(0.3)
