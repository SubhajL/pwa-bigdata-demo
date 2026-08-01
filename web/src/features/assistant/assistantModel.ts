/**
 * Pure logic for the scripted assistant: route a question to its canned answer, and the seeded
 * opening conversation. Kept out of the component so the routing is unit-testable.
 */
import {
  FALLBACK_ANSWER,
  SEED_ANSWER,
  SEED_QUESTION,
  SUGGESTED_QUESTIONS,
  type ScriptedAnswer,
} from "./assistant.config";

export type ChatRole = "user" | "assistant";

export interface ChatTurn {
  readonly id: string;
  readonly role: ChatRole;
  /** Present on a user turn. */
  readonly text?: string;
  /** Present on an assistant turn. */
  readonly answer?: ScriptedAnswer;
}

/**
 * Route a typed/clicked question to a scripted answer by keyword overlap; the best-matching suggested
 * question wins, and anything with no overlap gets the honest FALLBACK. Deterministic — no LLM.
 */
export function answerFor(text: string): ScriptedAnswer {
  const haystack = text.toLowerCase();
  let best: { score: number; answer: ScriptedAnswer } | null = null;
  for (const q of SUGGESTED_QUESTIONS) {
    const score = q.keywords.filter((k) => haystack.includes(k.toLowerCase())).length;
    if (score > 0 && (best === null || score > best.score)) best = { score, answer: q.answer };
  }
  return best?.answer ?? FALLBACK_ANSWER;
}

/** The opening exchange shown on load (deterministic ids — no Date/Math.random). */
export const INITIAL_CONVERSATION: readonly ChatTurn[] = [
  { id: "m0", role: "user", text: SEED_QUESTION },
  { id: "m1", role: "assistant", answer: SEED_ANSWER },
];
