"""PR-F — the exact-SHA acceptance harness and the safe cold gate, behaviorally.

Gate A1 must be reproducible and non-destructive-by-default: `make demo-acceptance-3x`
runs the §7 suite three consecutive times and writes an evidence manifest (exact SHA,
dirty flag, warm/cold label, artifact hash, per-run exits and timings), and
`make demo-e2e-cold` REFUSES to destroy volumes without the exact confirmation.

Everything here runs against PATH-stubbed `curl`/`docker` and an injected
`DEMO_E2E_CMD`, so no container, database, or browser is involved — these are contract
tests of the harness scripts themselves, the shell-test infrastructure PR-D/PR-E QCHECK
deferred to this PR.
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import stat
import subprocess

REPO = pathlib.Path(__file__).resolve().parents[2]
ACCEPTANCE = REPO / "scripts" / "demo-acceptance.sh"
PROBE = REPO / "scripts" / "lib" / "artifact-provenance-probe.sh"

DIGEST_A = "a" * 64
DIGEST_B = "b" * 64


def _stub(directory: pathlib.Path, name: str, script: str) -> None:
    path = directory / name
    path.write_text(f"#!/usr/bin/env bash\n{script}\n", encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IEXEC)


def _env_with(stubs: pathlib.Path, **extra: str) -> dict[str, str]:
    env = dict(os.environ)
    env["PATH"] = f"{stubs}:{env['PATH']}"
    env.update(extra)
    return env


# ── the provenance probe, five behavioral cases (deferred from PR-D/PR-E QCHECK) ───────


def _run_probe(stubs: pathlib.Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(PROBE), "http://stub-api"],
        capture_output=True, text=True, env=_env_with(stubs), timeout=30,
    )


def _curl_stub_json(sha: str) -> str:
    return f'echo \'{{"artifact_sha256": "{sha}"}}\''


def _docker_stub_digest(sha: str) -> str:
    return f'echo "{sha}"'


def test_probe_reports_a_match_and_exits_zero(tmp_path: pathlib.Path) -> None:
    _stub(tmp_path, "curl", _curl_stub_json(DIGEST_A))
    _stub(tmp_path, "docker", _docker_stub_digest(DIGEST_A))
    result = _run_probe(tmp_path)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "matches the running image" in result.stdout


def test_probe_reports_a_real_mismatch_and_exits_one(tmp_path: pathlib.Path) -> None:
    _stub(tmp_path, "curl", _curl_stub_json(DIGEST_A))
    _stub(tmp_path, "docker", _docker_stub_digest(DIGEST_B))
    result = _run_probe(tmp_path)
    assert result.returncode == 1, result.stdout + result.stderr
    assert "!=" in result.stdout


def test_probe_treats_curl_failure_as_probe_failure_not_verdict(tmp_path: pathlib.Path) -> None:
    _stub(tmp_path, "curl", "exit 7")
    _stub(tmp_path, "docker", _docker_stub_digest(DIGEST_A))
    result = _run_probe(tmp_path)
    assert result.returncode == 2, result.stdout + result.stderr
    assert "probe failed" in result.stdout
    assert "!=" not in result.stdout


def test_probe_treats_exec_failure_as_probe_failure_not_verdict(tmp_path: pathlib.Path) -> None:
    _stub(tmp_path, "curl", _curl_stub_json(DIGEST_A))
    _stub(tmp_path, "docker", "exit 1")
    result = _run_probe(tmp_path)
    assert result.returncode == 2, result.stdout + result.stderr
    assert "probe failed" in result.stdout


def test_probe_treats_malformed_output_as_probe_failure(tmp_path: pathlib.Path) -> None:
    # A noisy producer whose output merely CONTAINS a digest line must not produce a
    # verdict — whole-string validation, exactly what the preflight promises.
    _stub(tmp_path, "curl", _curl_stub_json(DIGEST_A))
    _stub(tmp_path, "docker", f'printf "warning: something\\n{DIGEST_A}\\n"')
    result = _run_probe(tmp_path)
    assert result.returncode == 2, result.stdout + result.stderr
    assert "probe failed" in result.stdout


def test_preflight_delegates_to_the_extracted_probe() -> None:
    """The preflight must run the SAME probe the harness tests prove — not a divergent
    inline copy that these five cases no longer cover."""
    preflight = (REPO / "scripts" / "demo-preflight.sh").read_text(encoding="utf-8")
    assert "artifact-provenance-probe.sh" in preflight


# ── the acceptance runner: exact-SHA manifest, labels, three-run propagation ───────────


def _run_acceptance(
    stubs: pathlib.Path, evidence: pathlib.Path, **env: str
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(ACCEPTANCE)],
        capture_output=True, text=True, timeout=60, cwd=REPO,
        env=_env_with(stubs, EVIDENCE_DIR=str(evidence), **env),
    )


def _manifests(evidence: pathlib.Path) -> list[dict[str, object]]:
    return [
        json.loads(p.read_text(encoding="utf-8")) for p in sorted(evidence.glob("*.json"))
    ]


def _stub_stack(stubs: pathlib.Path) -> None:
    _stub(stubs, "curl", _curl_stub_json(DIGEST_A))
    _stub(stubs, "docker", _docker_stub_digest(DIGEST_A))


def test_acceptance_writes_an_exact_sha_manifest(
    tmp_path: pathlib.Path,
) -> None:
    stubs, evidence = tmp_path / "stubs", tmp_path / "evidence"
    stubs.mkdir()
    _stub_stack(stubs)
    result = _run_acceptance(
        stubs, evidence, DEMO_E2E_CMD="true", RUNS="1", ACCEPTANCE_TEST_MODE="1"
    )
    assert result.returncode == 0, result.stdout + result.stderr

    (manifest,) = _manifests(evidence)
    head = subprocess.run(
        ["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=REPO, check=True
    ).stdout.strip()
    assert manifest["sha"] == head, "the manifest must record the EXACT commit"
    assert isinstance(manifest["dirty"], bool)
    assert manifest["mode"] == "warm"
    assert manifest["result"] == "passed"
    assert manifest["artifact_sha256"] == DIGEST_A
    # The executed gate command is recorded, so no reader must guess whether §7 ran.
    assert manifest["gate_command"] == "true"


def test_acceptance_labels_a_cold_run_cold(tmp_path: pathlib.Path) -> None:
    stubs, evidence = tmp_path / "stubs", tmp_path / "evidence"
    stubs.mkdir()
    _stub_stack(stubs)
    result = _run_acceptance(
        stubs, evidence, DEMO_E2E_CMD="true", RUNS="1", ACCEPTANCE_MODE="cold",
        ACCEPTANCE_TEST_MODE="1",
    )
    assert result.returncode == 0, result.stdout + result.stderr
    (manifest,) = _manifests(evidence)
    assert manifest["mode"] == "cold"


def test_acceptance_runs_three_times_and_records_each(tmp_path: pathlib.Path) -> None:
    stubs, evidence = tmp_path / "stubs", tmp_path / "evidence"
    stubs.mkdir()
    _stub_stack(stubs)
    result = _run_acceptance(
        stubs, evidence, DEMO_E2E_CMD="true", ACCEPTANCE_TEST_MODE="1"
    )  # RUNS defaults to 3
    assert result.returncode == 0, result.stdout + result.stderr
    (manifest,) = _manifests(evidence)
    runs = manifest["runs"]
    assert isinstance(runs, list) and len(runs) == 3
    assert all(r["exit"] == 0 for r in runs)


def test_acceptance_propagates_a_failed_run_and_still_writes_evidence(
    tmp_path: pathlib.Path,
) -> None:
    """Gate A1 demands three CONSECUTIVE passes: the first failure aborts, the overall
    exit is non-zero, and the manifest records the failure — evidence of a failed
    acceptance is still evidence."""
    stubs, evidence = tmp_path / "stubs", tmp_path / "evidence"
    stubs.mkdir()
    _stub_stack(stubs)
    result = _run_acceptance(
        stubs, evidence, DEMO_E2E_CMD="false", ACCEPTANCE_TEST_MODE="1"
    )
    assert result.returncode != 0
    (manifest,) = _manifests(evidence)
    assert manifest["result"] == "failed"
    runs = manifest["runs"]
    assert isinstance(runs, list) and len(runs) == 1, "abort at the FIRST failed run"
    assert runs[0]["exit"] != 0


# ── the cold gate refuses without exact confirmation ───────────────────────────────────


def _run_make_cold(stubs: pathlib.Path, **env: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["make", "demo-e2e-cold"],
        capture_output=True, text=True, timeout=60, cwd=REPO, env=_env_with(stubs, **env),
    )


def test_cold_gate_refuses_without_confirmation_and_touches_nothing(
    tmp_path: pathlib.Path,
) -> None:
    calls = tmp_path / "docker-calls.log"
    _stub(tmp_path, "docker", f'echo "$@" >> "{calls}"')
    result = _run_make_cold(tmp_path)
    assert result.returncode != 0
    assert "CONFIRM_VOLUME_RESET=1" in result.stdout + result.stderr
    assert not calls.exists(), "the refused cold gate must not run ANY docker command"


def test_cold_gate_requires_the_exact_confirmation_value(tmp_path: pathlib.Path) -> None:
    calls = tmp_path / "docker-calls.log"
    _stub(tmp_path, "docker", f'echo "$@" >> "{calls}"')
    result = _run_make_cold(tmp_path, CONFIRM_VOLUME_RESET="yes")
    assert result.returncode != 0
    assert not calls.exists(), "a near-miss confirmation must not destroy volumes"


# ── g-check round 1: the acceptance gate must be fail-closed and forgery-resistant ─────


def _run_make(target: str, stubs: pathlib.Path, **env: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["make", target],
        capture_output=True, text=True, timeout=60, cwd=REPO, env=_env_with(stubs, **env),
    )


def test_demo_down_is_also_guarded_by_the_exact_confirmation(tmp_path: pathlib.Path) -> None:
    """`demo-down` removes volumes too: leaving it unguarded made the runbook's
    "nothing is reset implicitly" claim false (g-check HIGH)."""
    calls = tmp_path / "docker-calls.log"
    _stub(tmp_path, "docker", f'echo "$@" >> "{calls}"')
    result = _run_make("demo-down", tmp_path)
    assert result.returncode != 0
    assert not calls.exists(), "demo-down destroyed volumes without confirmation"


def test_make_ignore_errors_cannot_bypass_the_cold_guard(tmp_path: pathlib.Path) -> None:
    """`make -i` (or inherited MAKEFLAGS=-i) ignores a recipe's exit status, so a guard in
    a SEPARATE recipe shell is no guard at all — the destructive step must be unreachable
    inside the same guarded process (g-check HIGH, reproduced by the reviewer)."""
    calls = tmp_path / "docker-calls.log"
    _stub(tmp_path, "docker", f'echo "$@" >> "{calls}"')
    for target in ("demo-down", "demo-e2e-cold"):
        _run_make(target, tmp_path, MAKEFLAGS="-i")
        assert not calls.exists(), f"{target} destroyed volumes under MAKEFLAGS=-i"


def test_runs_must_be_a_positive_integer(tmp_path: pathlib.Path) -> None:
    """`RUNS=0` printed "ACCEPTED — 0 consecutive run(s) passed" and exited 0 — a green
    Gate A1 that ran nothing (g-check HIGH)."""
    stubs, evidence = tmp_path / "stubs", tmp_path / "evidence"
    stubs.mkdir()
    _stub_stack(stubs)
    for bad in ("0", "-1", "two", " ", "3x"):
        result = _run_acceptance(
            stubs, evidence, DEMO_E2E_CMD="true", ACCEPTANCE_TEST_MODE="1", RUNS=bad
        )
        assert result.returncode != 0, f"RUNS={bad!r} was accepted"
        assert "ACCEPTED" not in result.stdout
        assert not _manifests(evidence), f"RUNS={bad!r} wrote an acceptance manifest"


def test_the_3x_target_pins_three_runs_against_an_inherited_RUNS(
    tmp_path: pathlib.Path,
) -> None:
    """`demo-acceptance-3x` must mean THREE — an inherited RUNS=1 must not weaken it."""
    makefile = (REPO / "Makefile").read_text(encoding="utf-8")
    recipe = re.search(r"^demo-acceptance-3x:.*?(?=^\S|\Z)", makefile, re.M | re.S)
    assert recipe is not None
    assert "RUNS=3" in recipe.group(0), "the 3x target does not pin RUNS=3"


def test_the_gate_command_override_is_refused_outside_test_mode(
    tmp_path: pathlib.Path,
) -> None:
    """`DEMO_E2E_CMD=true` wrote result "passed" without running the gate, indistinguishable
    from real evidence. Production mode must refuse the override outright (g-check HIGH)."""
    stubs, evidence = tmp_path / "stubs", tmp_path / "evidence"
    stubs.mkdir()
    _stub_stack(stubs)
    result = _run_acceptance(stubs, evidence, DEMO_E2E_CMD="true", RUNS="1")
    assert result.returncode != 0
    assert not _manifests(evidence), "a forged manifest was written"


def test_test_mode_manifests_are_not_gate_a1_class(tmp_path: pathlib.Path) -> None:
    """A contract-test run must be unmistakable: its schema is the test class, so no
    reviewer can read it as Gate A1 evidence."""
    stubs, evidence = tmp_path / "stubs", tmp_path / "evidence"
    stubs.mkdir()
    _stub_stack(stubs)
    result = _run_acceptance(
        stubs, evidence, DEMO_E2E_CMD="true", RUNS="1", ACCEPTANCE_TEST_MODE="1"
    )
    assert result.returncode == 0, result.stdout + result.stderr
    (manifest,) = _manifests(evidence)
    assert manifest["schema"] == "demo-acceptance/v1-test"
    assert manifest["test_mode"] is True


def test_a_cold_label_requires_an_actual_volume_reset(tmp_path: pathlib.Path) -> None:
    """`ACCEPTANCE_MODE=cold` on a warm stack labelled a run cold with no reset — the label
    must be bound to the guarded reset that produced it (g-check HIGH)."""
    stubs, evidence = tmp_path / "stubs", tmp_path / "evidence"
    stubs.mkdir()
    _stub_stack(stubs)
    result = subprocess.run(
        ["bash", str(ACCEPTANCE)],
        capture_output=True, text=True, timeout=60, cwd=REPO,
        env=_env_with(
            stubs, EVIDENCE_DIR=str(evidence), DEMO_E2E_CMD="true", RUNS="1",
            ACCEPTANCE_MODE="cold",
        ),
    )
    assert result.returncode != 0, "a cold label was accepted without a reset receipt"
    assert not _manifests(evidence)


def test_provenance_is_sampled_after_the_accepted_run(tmp_path: pathlib.Path) -> None:
    """The manifest must describe the runtime that actually PASSED: sampling before the
    gate (whose preflight rebuilds containers) can record the previous artifact
    (g-check MEDIUM)."""
    stubs, evidence = tmp_path / "stubs", tmp_path / "evidence"
    stubs.mkdir()
    marker = tmp_path / "gate-ran"
    # curl reports digest B only AFTER the gate command has run.
    _stub(
        stubs, "curl",
        f'if [ -f "{marker}" ]; then echo \'{{"artifact_sha256": "{DIGEST_B}"}}\'; '
        f'else echo \'{{"artifact_sha256": "{DIGEST_A}"}}\'; fi',
    )
    _stub(stubs, "docker", _docker_stub_digest(DIGEST_A))
    result = _run_acceptance(
        stubs, evidence, RUNS="1", ACCEPTANCE_TEST_MODE="1",
        DEMO_E2E_CMD=f'touch "{marker}"',
    )
    assert result.returncode == 0, result.stdout + result.stderr
    (manifest,) = _manifests(evidence)
    assert manifest["artifact_sha256"] == DIGEST_B, (
        "the manifest recorded a pre-run snapshot, not the accepted runtime"
    )


def test_concurrent_runs_do_not_collide_on_one_manifest(tmp_path: pathlib.Path) -> None:
    """Two runners in the same second, same sha, same mode must leave TWO attributable
    manifests — one acceptance record must never overwrite another (g-check MEDIUM)."""
    stubs, evidence = tmp_path / "stubs", tmp_path / "evidence"
    stubs.mkdir()
    _stub_stack(stubs)
    procs = [
        subprocess.Popen(
            ["bash", str(ACCEPTANCE)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=REPO,
            env=_env_with(
                stubs, EVIDENCE_DIR=str(evidence), DEMO_E2E_CMD="true", RUNS="1",
                ACCEPTANCE_TEST_MODE="1",
            ),
        )
        for _ in range(2)
    ]
    for p in procs:
        assert p.wait(timeout=60) == 0
    assert len(_manifests(evidence)) == 2


# ── QCHECK round 2: the evidence must be truthful about WHAT ran, and the cold
#    capability must be unforgeable, stack-bound, and single-use ─────────────────────────


def _receipt_dir(tmp_path: pathlib.Path) -> pathlib.Path:
    d = tmp_path / "state"
    d.mkdir(exist_ok=True)
    return d


def test_manifest_records_the_resolved_executable_not_just_the_string(
    tmp_path: pathlib.Path,
) -> None:
    """`bash -c "make …"` resolves `make` through PATH: a shadowing executable produced a
    production-class passed manifest whose gate_command still read like the real target
    (g-check HIGH). The manifest must record the RESOLVED path, so evidence can never
    claim `make` while something else ran."""
    stubs, evidence = tmp_path / "stubs", tmp_path / "evidence"
    stubs.mkdir()
    _stub_stack(stubs)
    _stub(stubs, "make", "exit 0")  # a shadowing `make` that runs no gate
    result = _run_acceptance(
        stubs, evidence, RUNS="1", ACCEPTANCE_STATE_DIR=str(_receipt_dir(tmp_path))
    )
    assert result.returncode == 0, result.stdout + result.stderr
    (manifest,) = _manifests(evidence)
    assert manifest["gate_command_resolved"] == str(stubs / "make"), (
        "the manifest must name the executable that actually ran"
    )


def test_a_fabricated_receipt_cannot_authorize_a_cold_label(tmp_path: pathlib.Path) -> None:
    """Writing an epoch into the receipt path, without ever running the guarded reset,
    produced a passed production cold manifest (g-check HIGH)."""
    stubs, evidence = tmp_path / "stubs", tmp_path / "evidence"
    stubs.mkdir()
    _stub_stack(stubs)
    state = _receipt_dir(tmp_path)
    (state / "volume-reset-receipt").write_text("1754300000\n", encoding="utf-8")
    result = _run_acceptance(
        stubs, evidence, RUNS="1", ACCEPTANCE_MODE="cold",
        ACCEPTANCE_STATE_DIR=str(state), DEMO_E2E_CMD_IGNORED="1",
    )
    assert result.returncode != 0, "a hand-written receipt authorized a cold acceptance"
    assert not _manifests(evidence)


def test_one_receipt_authorizes_exactly_one_cold_run(tmp_path: pathlib.Path) -> None:
    """Two cold runners crossed the check concurrently and BOTH wrote passed cold
    manifests from a single receipt (g-check HIGH): the claim must be atomic."""
    stubs, evidence = tmp_path / "stubs", tmp_path / "evidence"
    stubs.mkdir()
    _stub_stack(stubs)
    # PRODUCTION mode (the test seam skips the receipt by design): a stubbed `make`
    # stands in for the gate, exactly as the resolved-executable test does.
    _stub(stubs, "make", "exit 0")
    state = _receipt_dir(tmp_path)
    subprocess.run(
        ["bash", str(REPO / "scripts" / "lib" / "volume-reset.sh")],
        capture_output=True, text=True, timeout=60, cwd=REPO,
        env=_env_with(stubs, CONFIRM_VOLUME_RESET="1", ACCEPTANCE_STATE_DIR=str(state)),
        check=True,
    )
    procs = [
        subprocess.Popen(
            ["bash", str(ACCEPTANCE)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=REPO,
            env=_env_with(
                stubs, EVIDENCE_DIR=str(evidence), RUNS="1", ACCEPTANCE_MODE="cold",
                ACCEPTANCE_STATE_DIR=str(state),
            ),
        )
        for _ in range(2)
    ]
    codes = [p.wait(timeout=60) for p in procs]
    assert sorted(codes)[0] == 0 and sorted(codes)[1] != 0, (
        f"exactly one cold runner may claim the receipt; got exits {codes}"
    )
    assert len(_manifests(evidence)) == 1


def test_a_future_or_malformed_receipt_is_refused(tmp_path: pathlib.Path) -> None:
    """Age had no LOWER bound, so a future timestamp passed (g-check HIGH)."""
    stubs, evidence = tmp_path / "stubs", tmp_path / "evidence"
    stubs.mkdir()
    _stub_stack(stubs)
    for content in ("99999999999\n", "not-a-number\n", "\n"):
        state = tmp_path / f"state-{abs(hash(content))}"
        state.mkdir()
        (state / "volume-reset-receipt").write_text(content, encoding="utf-8")
        result = _run_acceptance(
            stubs, evidence, RUNS="1", ACCEPTANCE_MODE="cold",
            ACCEPTANCE_STATE_DIR=str(state),
        )
        assert result.returncode != 0, f"receipt {content!r} was accepted"
    assert not _manifests(evidence)


def test_the_receipt_lives_outside_the_worktree(tmp_path: pathlib.Path) -> None:
    """A receipt written inside the repo made every default cold manifest report
    `dirty: true` on a clean checkout (g-check MEDIUM)."""
    reset = (REPO / "scripts" / "lib" / "volume-reset.sh").read_text(encoding="utf-8")
    assert "EVIDENCE_DIR" not in reset.split("# ")[0] or "ACCEPTANCE_STATE_DIR" in reset
    assert "ACCEPTANCE_STATE_DIR" in reset, (
        "the reset receipt must live in a state dir outside the worktree"
    )
    acceptance = ACCEPTANCE.read_text(encoding="utf-8")
    assert "ACCEPTANCE_STATE_DIR" in acceptance


def test_the_reset_refuses_to_follow_a_symlinked_receipt_path(
    tmp_path: pathlib.Path,
) -> None:
    """Redirection followed a planted symlink and overwrote its target — a confirmed reset
    must not extend data loss beyond the Docker volumes (g-check MEDIUM)."""
    stubs = tmp_path / "stubs"
    stubs.mkdir()
    _stub(stubs, "docker", "exit 0")
    state = _receipt_dir(tmp_path)
    victim = tmp_path / "victim.txt"
    victim.write_text("precious\n", encoding="utf-8")
    (state / "volume-reset-receipt").symlink_to(victim)

    subprocess.run(
        ["bash", str(REPO / "scripts" / "lib" / "volume-reset.sh")],
        capture_output=True, text=True, timeout=60, cwd=REPO,
        env=_env_with(stubs, CONFIRM_VOLUME_RESET="1", ACCEPTANCE_STATE_DIR=str(state)),
    )
    assert victim.read_text(encoding="utf-8") == "precious\n", "the symlink target was overwritten"


def test_test_mode_requires_exactly_one(tmp_path: pathlib.Path) -> None:
    """`ACCEPTANCE_TEST_MODE=0` enabled test mode because any non-empty value counted
    (g-check LOW): the contract says exactly `1`."""
    stubs, evidence = tmp_path / "stubs", tmp_path / "evidence"
    stubs.mkdir()
    _stub_stack(stubs)
    for bad in ("0", "true", " ", "2"):
        result = _run_acceptance(
            stubs, evidence, RUNS="1", DEMO_E2E_CMD="true", ACCEPTANCE_TEST_MODE=bad,
            ACCEPTANCE_STATE_DIR=str(_receipt_dir(tmp_path)),
        )
        assert result.returncode != 0, f"ACCEPTANCE_TEST_MODE={bad!r} was honored"
    assert not _manifests(evidence)


def test_inherited_makeflags_cannot_forge_a_passed_manifest(tmp_path: pathlib.Path) -> None:
    """GNU make honours MAKEFLAGS from the environment: `-i` turns a FAILING recipe into
    exit 0 and `-n` prints it without running it, so an inherited flag produced a
    production-class "ACCEPTED" manifest for a suite that failed or never ran
    (review-workflow HIGH, reproduced live on the real script). The runner must sanitize
    make's control variables before invoking the gate."""
    stubs, evidence = tmp_path / "stubs", tmp_path / "evidence"
    stubs.mkdir()
    _stub_stack(stubs)
    # A `make` that fails unless it was told to ignore errors / dry-run.
    _stub(
        stubs, "make",
        'if [ -n "${MAKEFLAGS:-}" ]; then echo "flags=$MAKEFLAGS"; exit 0; fi\nexit 1',
    )
    for flags in ("-i", "-n", "i"):
        result = _run_acceptance(
            stubs, evidence, RUNS="1", MAKEFLAGS=flags,
            ACCEPTANCE_STATE_DIR=str(_receipt_dir(tmp_path)),
        )
        assert result.returncode != 0, f"MAKEFLAGS={flags!r} produced an accepted run"
        manifests = _manifests(evidence)
        assert all(m["result"] == "failed" for m in manifests), (
            f"MAKEFLAGS={flags!r} wrote a passed manifest for a failing gate"
        )
        for m in evidence.glob("*.json"):
            m.unlink()
