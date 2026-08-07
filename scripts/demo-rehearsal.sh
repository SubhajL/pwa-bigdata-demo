#!/usr/bin/env bash
# Gate A2 judge rehearsal (Phase-4 exit-gate item). Runs the readiness gate, then drives the
# literal judge sequence against the LIVE stack (docs/demo-runbook.md item 2.4 + the ≤30 s
# item-3.3 budget) and archives four measured timings — trigger→area, click→drawer,
# model-critical, and recovery — into a demo-rehearsal/v1 JSON stamped with HEAD, source
# cleanliness, and the model artifact hash. A breach leaves a result:failed archive AND exits
# non-zero; the verdict is reported from the archive itself. Certification additionally REFUSES a
# dirty worktree (like demo-acceptance.sh): the archive is still written, but `make demo-rehearsal`
# exits non-zero unless the tree is clean, so a dirty run cannot pass as Gate A2 evidence.
#
# Usage: scripts/demo-rehearsal.sh   (or: make demo-rehearsal)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"

# 1. Readiness gate (preserves volumes; brings the stack up and proves every scored surface live).
"$ROOT/scripts/demo-preflight.sh"

# 2. Stamp the evidence path with HEAD + a UTC timestamp + PID, mirroring the acceptance manifest.
#    The same sha is passed to the spec so the filename and the in-file sha cannot diverge.
sha="$(git -C "$ROOT" rev-parse HEAD)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="${EVIDENCE_DIR:-${TMPDIR:-/tmp}/pwa-demo-evidence}"
REHEARSAL_OUT="${REHEARSAL_OUT:-${EVIDENCE_DIR%/}/rehearsal-${stamp}-${sha:0:12}-$$.json}"
mkdir -p "$(dirname "$REHEARSAL_OUT")"
if [ -e "$REHEARSAL_OUT" ]; then
  echo "REFUSED: REHEARSAL_OUT already exists (refusing to clobber evidence): $REHEARSAL_OUT" >&2
  exit 2
fi
export REHEARSAL_OUT REHEARSAL_SHA="$sha"

# 3. Drive + measure. Capture the Playwright exit code WITHOUT aborting, so the verdict is always
#    reported from the archive (a breach writes result:failed before it fails the gate).
echo "→ rehearsing the judge sequence (archive → $REHEARSAL_OUT) …"
rehearse_rc=0
( cd "$ROOT/e2e" && pnpm exec playwright test --config playwright.rehearsal.config.ts ) || rehearse_rc=$?

# 4. Report the archived verdict (python3 is a hard project dependency, per demo-preflight.sh). The
#    reporter carries its OWN teeth: exit 1 on a timing breach OR a dirty worktree (uncertifiable
#    evidence), independent of the Playwright exit code.
verdict_rc=0
if [ -f "$REHEARSAL_OUT" ]; then
  python3 - "$REHEARSAL_OUT" <<'PY' || verdict_rc=$?
import json, sys
a = json.load(open(sys.argv[1]))
t, thr, s = a["timings"], a["thresholds"], a["source"]
passed = a["result"] == "passed"
clean = bool(s["clean"])
on_main = (s["origin_main"] == "") or (a["sha"] == s["origin_main"])
print("────────────────────────────────────────")
print(f"  trigger → footprint   {t['trigger_to_area_ms']:>7} ms  (≤ {thr['trigger_to_area_ms']})")
print(f"  click → drawer(200)   {t['click_to_drawer_ms']:>7} ms  (≤ {thr['click_to_drawer_ms']})")
print(f"  model → critical      {t['model_critical_ms']:>7} ms  (≤ {thr['model_critical_ms']})")
print(f"  recovery (cleared)    {t['recovery_ms']:>7} ms  (≤ {thr['recovery_ms']})")
print(f"  sha {a['sha'][:12]} · clean={clean} · branch={s['branch']} · artifact {a['artifact_sha256'][:12]}…")
print(f"  captured {a['captured_at_utc']}")
print("────────────────────────────────────────")
if not passed:
    print("✗ REHEARSAL FAILED — " + "; ".join(a["breaches"]))
    sys.exit(1)
if not clean:
    print("✗ NOT CERTIFIABLE — dirty worktree; timings are within budget but this is not valid Gate A2 evidence")
    sys.exit(1)
if not on_main:
    print("⚠ REHEARSED (timings within budget) — but HEAD is not the local origin/main ref; fetch to confirm before certifying")
    sys.exit(0)
print("✓ REHEARSED — every judge-sequence timing within budget, clean worktree at origin/main")
sys.exit(0)
PY
else
  echo "✗ REHEARSAL FAILED — no archive was produced (see the Playwright output above)"
  verdict_rc=1
fi

# The run fails if EITHER the Playwright process failed OR the archived verdict is not certifiable.
if [ "$rehearse_rc" -ne 0 ] || [ "$verdict_rc" -ne 0 ]; then
  exit 1
fi
