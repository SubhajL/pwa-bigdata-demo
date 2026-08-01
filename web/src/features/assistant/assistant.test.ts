/**
 * PR-16 (S9) — the scripted assistant data + routing. Config invariants (the "cite every answer"
 * guardrail) and the pure keyword router, tested without a DOM.
 */
import { describe, expect, it } from "vitest";

import { FALLBACK_ANSWER, SEED_ANSWER, SUGGESTED_QUESTIONS } from "./assistant.config";
import { answerFor, INITIAL_CONVERSATION } from "./assistantModel";

describe("assistant.config", () => {
  it("offers four suggested questions, each with a cited answer (guardrail)", () => {
    expect(SUGGESTED_QUESTIONS).toHaveLength(4);
    for (const q of SUGGESTED_QUESTIONS) expect(q.answer.citations.length).toBeGreaterThan(0);
  });

  it("seeds an answer with the NRW bars and recommendations", () => {
    expect(SEED_ANSWER.bars?.length).toBeGreaterThan(0);
    expect(SEED_ANSWER.recommendations?.length).toBeGreaterThan(0);
  });

  it("keeps the fallback honestly uncited", () => {
    expect(FALLBACK_ANSWER.citations).toHaveLength(0);
  });
});

describe("answerFor", () => {
  it("routes a matching question to its scripted answer", () => {
    const nrw = SUGGESTED_QUESTIONS.find((q) => q.id === "nrw-top")!;
    expect(answerFor(nrw.textTh)).toBe(nrw.answer);
  });

  it("routes energy questions to the energy answer", () => {
    expect(answerFor("อยากทราบต้นทุนพลังงาน")).toBe(
      SUGGESTED_QUESTIONS.find((q) => q.id === "energy-cost")!.answer,
    );
  });

  it("falls back honestly when nothing matches", () => {
    expect(answerFor("สวัสดีครับ")).toBe(FALLBACK_ANSWER);
  });
});

describe("INITIAL_CONVERSATION", () => {
  it("opens with a user question and an assistant answer", () => {
    expect(INITIAL_CONVERSATION.map((t) => t.role)).toEqual(["user", "assistant"]);
    expect(new Set(INITIAL_CONVERSATION.map((t) => t.id)).size).toBe(INITIAL_CONVERSATION.length);
  });
});
