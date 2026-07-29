"""T17 — CORS (DREP-PR6 R13).

This is the test for the second half of the defect SESSION-HANDOFF §3 records: the API had
no CORS middleware at all, so a browser could not call it cross-origin.

Two things this file is careful about, both of which make the naive version vacuous:

1. A CORS **preflight** is `OPTIONS` + `Access-Control-Request-Method`. Without that
   header Starlette does not treat the request as a preflight, and the assertion measures
   nothing.
2. Middleware is attached to the module-level `app` singleton at IMPORT time. Setting
   `CORS_ORIGINS` after `app.main` is imported cannot reconfigure it, so each test builds
   a FRESH app with the environment already in place.

Authored by Claude; the implementer must not modify this file (DREP §10).
"""
from __future__ import annotations

import importlib
import sys
from collections.abc import Callable, Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

ALLOWED = "http://localhost:5173"
UNLISTED = "http://evil.example"
PROBE = "/healthz"  # no dependencies, so this measures CORS and nothing else

#: Modules this file re-imports, and must therefore put back.
_MANGLED = ("app.main", "app.config")


@pytest.fixture
def fresh_app(monkeypatch: pytest.MonkeyPatch) -> Iterator[Callable[[str], FastAPI]]:
    """Build an app whose CORS middleware was configured from a chosen CORS_ORIGINS.

    Re-importing is unavoidable: middleware is attached to the module-level `app` at
    IMPORT time, so setting the env afterwards cannot reconfigure it.

    RESTORING `sys.modules` afterwards is equally unavoidable, and is the part that is
    easy to forget. Without it every later test in the session that does
    `from app.main import app` binds to a DIFFERENT module object than the one the
    session-scoped fixtures set up against — which is exactly how this file, in an
    earlier form, made `test_latency.py::test_latest_query_uses_the_index_and_does_not_
    scan` fail while passing in isolation. Cross-file interference like that is
    indistinguishable from a real regression, so the cleanup is not optional.
    """
    saved = {name: sys.modules.get(name) for name in _MANGLED}

    def build(origins: str) -> FastAPI:
        monkeypatch.setenv("CORS_ORIGINS", origins)
        monkeypatch.setenv("MQTT_ENABLED", "0")
        monkeypatch.setenv("SCORING_ENABLED", "0")
        for name in _MANGLED:
            sys.modules.pop(name, None)
        return importlib.import_module("app.main").app  # type: ignore[no-any-return]

    try:
        yield build
    finally:
        for name, module in saved.items():
            if module is not None:
                sys.modules[name] = module
            else:  # pragma: no cover - only if this file ran before app.main was imported
                sys.modules.pop(name, None)


def test_preflight_from_a_configured_origin_is_allowed(fresh_app: Callable[[str], FastAPI]) -> None:
    client = TestClient(fresh_app(ALLOWED))
    response = client.options(
        PROBE,
        headers={"Origin": ALLOWED, "Access-Control-Request-Method": "GET"},
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == ALLOWED


def test_the_actual_GET_also_carries_the_header(fresh_app: Callable[[str], FastAPI]) -> None:
    """A successful preflight does not prove the real response is usable."""
    client = TestClient(fresh_app(ALLOWED))
    response = client.get(PROBE, headers={"Origin": ALLOWED})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == ALLOWED


def test_an_unlisted_origin_gets_no_allow_header(fresh_app: Callable[[str], FastAPI]) -> None:
    client = TestClient(fresh_app(ALLOWED))
    preflight = client.options(
        PROBE, headers={"Origin": UNLISTED, "Access-Control-Request-Method": "GET"}
    )
    assert preflight.headers.get("access-control-allow-origin") is None

    plain = client.get(PROBE, headers={"Origin": UNLISTED})
    assert plain.headers.get("access-control-allow-origin") is None


def test_multiple_origins_are_parsed_from_the_comma_separated_setting(
    fresh_app: Callable[[str], FastAPI],
) -> None:
    second = "http://127.0.0.1:5173"
    client = TestClient(fresh_app(f"{ALLOWED}, {second} , "))
    for origin in (ALLOWED, second):
        response = client.get(PROBE, headers={"Origin": origin})
        assert response.headers.get("access-control-allow-origin") == origin


def test_wildcard_is_refused_at_configuration_time(fresh_app: Callable[[str], FastAPI]) -> None:
    """Configuring `*` must FAIL, not be quietly accepted.

    The earlier version of this test configured the ALLOWED origin and then asserted `*`
    was absent from the resulting list — which is true by construction and would have
    passed even while `CORS_ORIGINS=*` produced `allow_origins=["*"]` alongside
    `allow_credentials=True`. Caught by the Tier-2 reviewer; the fix is to configure the
    dangerous value and assert the refusal.
    """
    with pytest.raises(ValueError, match=r"must not contain"):
        fresh_app("*")


def test_wildcard_mixed_with_real_origins_is_also_refused(
    fresh_app: Callable[[str], FastAPI],
) -> None:
    with pytest.raises(ValueError, match=r"must not contain"):
        fresh_app(f"{ALLOWED},*")


def test_server_timing_is_exposed_to_the_browser(fresh_app: Callable[[str], FastAPI]) -> None:
    """Scored item 1.3 is evidenced in DevTools; a cross-origin page cannot READ
    `Server-Timing` unless it is in `Access-Control-Expose-Headers`."""
    client = TestClient(fresh_app(ALLOWED))
    response = client.get(PROBE, headers={"Origin": ALLOWED})
    exposed = response.headers.get("access-control-expose-headers", "")
    assert "Server-Timing" in exposed
