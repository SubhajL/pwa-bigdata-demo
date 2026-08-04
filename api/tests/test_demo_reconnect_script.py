"""Shell-level regressions for the scored broker reconnect stopwatch."""

import os
import subprocess
import textwrap
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "scripts" / "demo-reconnect.sh"


def _executable(path: Path, source: str) -> None:
    path.write_text(textwrap.dedent(source).lstrip(), encoding="utf-8")
    path.chmod(0o755)


def test_slow_compose_restart_consumes_the_same_30_second_budget(tmp_path: Path) -> None:
    """A Compose call that returns at t=31 must fail before polling can claim recovery."""
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    docker_marker = tmp_path / "docker-called"
    date_state = tmp_path / "date-state"

    _executable(
        fake_bin / "docker",
        """
        #!/bin/sh
        : > "$FAKE_DOCKER_MARKER"
        exit 0
        """,
    )
    _executable(
        fake_bin / "curl",
        """
        #!/bin/sh
        printf '%s\n' '{"state":"connected","received":10,"conservation":{"telemetry":10}}'
        """,
    )
    _executable(
        fake_bin / "date",
        """
        #!/bin/sh
        if [ -f "$FAKE_DATE_STATE" ]; then
          printf '%s\n' 131
        else
          : > "$FAKE_DATE_STATE"
          printf '%s\n' 100
        fi
        """,
    )

    env = os.environ.copy()
    env["PATH"] = f"{fake_bin}{os.pathsep}{env['PATH']}"
    env["FAKE_DOCKER_MARKER"] = str(docker_marker)
    env["FAKE_DATE_STATE"] = str(date_state)
    result = subprocess.run(
        ["bash", str(SCRIPT)],
        cwd=REPO,
        env=env,
        capture_output=True,
        text=True,
        timeout=5,
        check=False,
    )

    assert docker_marker.is_file(), "the harness never reached docker compose restart"
    assert result.returncode != 0
    assert "restart command exceeded the 30s budget" in result.stderr


def test_hung_compose_restart_is_terminated_at_the_deadline(tmp_path: Path) -> None:
    """The script must actively stop a restart command that does not return."""
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    docker_marker = tmp_path / "docker-called"

    _executable(
        fake_bin / "docker",
        """
        #!/bin/sh
        : > "$FAKE_DOCKER_MARKER"
        exec /bin/sleep 20
        """,
    )
    _executable(
        fake_bin / "curl",
        """
        #!/bin/sh
        printf '%s\n' '{"state":"connected","received":10,"conservation":{"telemetry":10}}'
        """,
    )

    env = os.environ.copy()
    env["PATH"] = f"{fake_bin}{os.pathsep}{env['PATH']}"
    env["FAKE_DOCKER_MARKER"] = str(docker_marker)
    env["DEMO_RECONNECT_BUDGET_S"] = "1"
    started = time.monotonic()
    result = subprocess.run(
        ["bash", str(SCRIPT)],
        cwd=REPO,
        env=env,
        capture_output=True,
        text=True,
        timeout=5,
        check=False,
    )
    elapsed = time.monotonic() - started

    assert docker_marker.is_file(), "the harness never reached docker compose restart"
    assert result.returncode != 0
    assert elapsed < 3
    assert "restart command exceeded the 1s budget" in result.stderr
