# Coding Log — PR-16 · AI Assistant (Stitch S9)

Baseline `main` @ 7350803. Branch `feat/pr16-ai-assistant`. Lifecycle: g-coding (Path B, screen 4 of
4 — the last). Non-scoring proposal screen. **Completes Path B.**

## Scope
The `assistant` screen (`/assistant`, Stitch S9): a SCRIPTED assistant (PR-PLAN: "AI Assistant
(scripted)"). No live LLM — every answer is a fixed script; every figure illustrative.

## What shipped
- A chat opening with a seeded exchange (national NRW overview + a single-hue NRW-by-region bar chart
  + recommendations + provenance citations).
- **Suggested-question chips** + a **composer input** are real: asking appends a user turn + a canned
  answer; empty input ignored; unrecognised input → an honest FALLBACK ("…ยังไม่ได้เชื่อมต่อกับ LLM จริง").
- Right sidebar: suggested questions, "Your Data Scope", and a SIMULATED AI **Guardrails** panel.
- Honesty: every assistant answer card carries a `SimulatedBadge`; header + footer + composer
  disclaimers state the answers are scripted, not a real LLM/real data. Message ids are a counter
  (deterministic — no Date/Math.random). Wired via nav `built:true` + `SCREENS.assistant`.

## Files
New: `web/src/features/assistant/{assistant.config.ts,assistantModel.ts,ChatMessage.tsx,AssistantSidebar.tsx,ChatComposer.tsx}`,
`web/src/screens/AiAssistantScreen.tsx`; tests `assistant.test.ts`, `AiAssistantScreen.test.tsx`,
`features/assistant/assistantWiring.test.tsx`. Edited: `routes.tsx`, `nav.ts`.

## Gates
`pnpm typecheck` clean · `pnpm lint` clean · `pnpm test` 461 pass (3× no-flake) · `pnpm build` green.
Pure `answerFor` routing unit-tested; screen behaviour (seed, chip, typed question, fallback, empty
input, input-clears) tested; `assistantWiring.test.tsx` guards real-screen-vs-placeholder. h1 carries
the nav labelTh "ผู้ช่วยอัจฉริยะ".

## Stitch S9 vs live
Faithful + thin, and genuinely interactive where the mock is a static transcript (conversation grows
from real chip/input actions, honest scripted fallback). NRW answer chart = single hue, single axis.
Screenshot in scratchpad.

## QCHECK (Tier-1 adversarial, general-purpose agent)
VERDICT **SHIP**. No CRITICAL/HIGH/MEDIUM. P0 honesty satisfied (every answer card badged). Two LOW
honesty-nuance notes addressed for extra rigor: (2) citation chips could read as genuine provenance →
prefixed with an "อ้างอิง (จำลอง):" label; (NIT) typed-question test now asserts the composer clears.
LOW (1) — the "LLM Thai-optimized" header badge — kept as the *proposed* capability (mock-faithful),
sitting beside the SIMULATED badge + footer disclaimer, within the honesty contract. Determinism,
tokens, dataviz (single-hue single-axis bars), affordances (no dead controls) all verified clean.
Tier-2 Codex not run: static presentational screen, no domain/security/contract semantics.
