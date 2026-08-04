"""Static evidence-truth tests (PR-A, evidence/documentation drift).

The operator docs, demo scripts, and UI narration are judge-facing surfaces: a judge
follows them literally. Each test here pins a documented claim to the implemented
behavior (post PR #30) so a known-stale phrase cannot return:

* the E2E spec count and the demo-director spec are reported accurately,
* seeded/simulated impact customers are never called "real",
* ``demo-preflight`` is a stack-readiness gate, not a cold start (volumes survive it),
* the demo director's ``bad_asset`` narration names direct DB injection — it does not
  claim the MQTT-consumer validation path, which belongs to the scored item-1.5 proof
  (``make demo-scenario MODE=bad_asset`` through the real simulator/broker).

These tests read repository files only; no stack, network, or database is involved.
"""

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

COVERAGE = REPO / "docs" / "demo-coverage.md"
RUNBOOK = REPO / "docs" / "demo-runbook.md"
E2E_README = REPO / "e2e" / "README.md"
E2E_TESTS = REPO / "e2e" / "tests"
MAKEFILE = REPO / "Makefile"
PREFLIGHT = REPO / "scripts" / "demo-preflight.sh"
PANEL = REPO / "web" / "src" / "features" / "twin" / "DemoScenarioPanel.tsx"

#: Judge-facing files whose prose may describe the seeded/affected customer list.
_CUSTOMER_CLAIM_FILES = (RUNBOOK, COVERAGE, E2E_README, PREFLIGHT)


def _read(path: Path) -> str:
    assert path.is_file(), f"expected repository file missing: {path}"
    return path.read_text(encoding="utf-8")


def _actual_spec_count() -> int:
    """Static count of Playwright test cases under the configured `testDir`.

    Approximates `playwright test --list`: recursive over the `*.spec.ts` / `*.test.ts`
    patterns Playwright discovers, counting `test(` at any indentation (describe-nested)
    plus annotated `test.skip/fixme/only/fail(` cases. Fixture calls like `test.beforeAll`
    do not match. If a spec style lands that this misses, the count comparison fails and
    this helper is the thing to fix.
    """
    specs = sorted(E2E_TESTS.rglob("*.spec.ts")) + sorted(E2E_TESTS.rglob("*.test.ts"))
    assert specs, f"no Playwright specs found under {E2E_TESTS}"
    case = re.compile(r"^\s*test(?:\.(?:skip|fixme|only|fail))?\(", re.MULTILINE)
    return sum(len(case.findall(_read(p))) for p in specs)


def test_demo_docs_match_current_director() -> None:
    """Coverage doc and E2E README describe the PR #30 suite, not the pre-director one."""
    coverage = _read(COVERAGE)
    readme = _read(E2E_README)

    claimed = re.search(r"\((\d+) specs", coverage)
    assert claimed is not None, "docs/demo-coverage.md no longer states the E2E spec count"
    assert int(claimed.group(1)) == _actual_spec_count(), (
        f"docs/demo-coverage.md claims {claimed.group(1)} specs but e2e/tests defines "
        f"{_actual_spec_count()} — update the doc to the real count"
    )

    for doc, name in ((coverage, COVERAGE), (readme, E2E_README)):
        assert "scenario-transitions" in doc, (
            f"{name.relative_to(REPO)} omits scenario-transitions.spec.ts — the demo-director "
            "E2E landed in PR #30 and is part of the verified suite"
        )

    # The pre-PR-7 tuning caveat is retired: P-2 backfills critical and pressure_drop
    # drives pressure below the band; the timed transitions are observed live.
    for stale in ("health ≈ 64", "stays inside the twin's band"):
        assert stale not in readme, (
            f"e2e/README.md still carries the retired pre-PR-7 caveat ({stale!r})"
        )


def test_coverage_keeps_gate_a1_evidence_boundary() -> None:
    """Built/wired coverage must not be promoted to complete E2E proof before Gate A1."""
    coverage = _read(COVERAGE)

    assert "16/16 built and wired" in coverage, (
        "docs/demo-coverage.md must describe implementation coverage as built and wired"
    )
    assert "Gate A1 pending" in coverage, (
        "docs/demo-coverage.md must retain the acceptance boundary until PR-D/PR-E land"
    )
    for gap in ("PR-D", "3.1", "3.2", "PR-E", "3.4", "3.5", "3.6"):
        assert gap in coverage, f"docs/demo-coverage.md omits the remaining {gap} evidence gap"
    for criterion in ("3.1", "3.2", "3.4", "3.5", "3.6"):
        assert re.search(rf"^\| {re.escape(criterion)} \|[^\n]*\| ◑ ", coverage, re.M), (
            f"docs/demo-coverage.md must mark pending criterion {criterion} partial"
        )

    forbidden = (
        r"16/16[^\n]{0,100}"
        r"(?:demonstrable|E2E[- ]?(?:verified|proven)|verified by `?make demo-e2e)",
        r"(?:every|all) scored (?:item|behavior)s?[^\n]{0,100}"
        r"(?:verified end-to-end|shown & verified)",
    )
    for pattern in forbidden:
        assert re.search(pattern, coverage, re.I) is None, (
            f"docs/demo-coverage.md restored a pre-Gate-A1 readiness claim: {pattern!r}"
        )


def test_no_real_customer_claim() -> None:
    """Seeded/simulated impact customers are never presented as real ones."""
    sources = [(p, _read(p)) for p in _CUSTOMER_CLAIM_FILES]
    sources += [(p, _read(p)) for p in sorted(E2E_TESTS.glob("*.spec.ts"))]
    for path, text in sources:
        # Honest negations ("no real customer PII") are allowed; claims are not.
        cleaned = re.sub(r"\b(?:no|not|never)\s+real\s+customer\w*", "", text, flags=re.I)
        claim = re.search(r"\breal\b[^.\n]{0,40}?\bcustomers?\b", cleaned, re.I)
        assert claim is None, (
            f"{path.relative_to(REPO)} calls seeded impact data real: {claim.group(0)!r}"
        )


def test_preflight_is_not_called_cold_start() -> None:
    """`demo-preflight` preserves volumes; only `demo-down` produces a true cold start."""
    preflight = _read(PREFLIGHT)
    assert "cold" not in preflight.lower(), (
        "scripts/demo-preflight.sh describes itself with cold-start language, but it only "
        "runs `compose up -d --build` on existing volumes"
    )
    # Pin the behavior the wording rests on: preflight must never remove volumes. If it
    # ever gains a destructive step, the non-cold-start prose above becomes the lie.
    destructive = re.search(r"down\s+(?:-v|--volumes)|volume\s+(?:rm|prune)", preflight)
    assert destructive is None, (
        f"scripts/demo-preflight.sh gained a volume-destroying step ({destructive.group(0)!r}) "
        "— it is documented as preserving volumes"
    )

    makefile = _read(MAKEFILE)
    help_line = next(
        (line for line in makefile.splitlines() if line.startswith("demo-preflight:")), ""
    )
    assert help_line, "Makefile lost its demo-preflight target"
    assert "cold" not in help_line.lower(), (
        f"Makefile advertises demo-preflight as a cold start: {help_line!r}"
    )

    runbook = _read(RUNBOOK)
    assert re.search(r"^## 0\. Cold start", runbook, re.M) is None, (
        "docs/demo-runbook.md §0 labels the preflight step a cold start"
    )
    assert re.search(r"true\s+cold\s+start.{0,200}demo-down", runbook, re.S | re.I), (
        "docs/demo-runbook.md must document the true cold start as `make demo-down` "
        "(volume removal) followed by preflight"
    )


def test_bad_asset_narration_names_direct_injection() -> None:
    """The director's bad-asset path is narrated as direct injection, not MQTT validation."""
    panel = _read(PANEL)
    # Honest negations ("Nothing here traverses the MQTT consumer") are allowed; any
    # remaining MQTT-consumer mention would be a positive path claim, which is false.
    no_negations = re.sub(
        r"\b(?:nothing|no|not|never)\b[^.]{0,80}?MQTT[-\s]consumer", "", panel, flags=re.I | re.S
    )
    claim = re.search(r"MQTT[-\s]consumer", no_negations, re.I)
    assert claim is None, (
        "DemoScenarioPanel.tsx claims injected rows travel the MQTT-consumer path — "
        "api/app/demo.py writes them directly to the database"
    )
    assert re.search(r"insert(?:ed|s)? directly", panel, re.I), (
        "DemoScenarioPanel.tsx must name the actual mechanism: rows are inserted "
        "directly into the database (source='DEMO')"
    )

    runbook = _read(RUNBOOK)
    assert re.search(r"จำลองข้อมูลเสีย \(DLQ\)\*{0,2}\s*\(item 1\.5\)", runbook) is None, (
        "docs/demo-runbook.md presents the director's DLQ button as the item-1.5 proof; "
        "the scored proof is the simulator's MQTT path (`make demo-scenario MODE=bad_asset`)"
    )
    assert re.search(r"MODE=bad_asset", runbook), (
        "docs/demo-runbook.md must keep the real MQTT bad-asset trigger for item 1.5"
    )
