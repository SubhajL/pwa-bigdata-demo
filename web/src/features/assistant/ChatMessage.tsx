import { Bot } from "lucide-react";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import type { RegionNrwBar, ScriptedAnswer } from "./assistant.config";
import type { ChatTurn } from "./assistantModel";

/** NRW-by-region — a SINGLE series, so one hue (magnitude = bar width), one axis, direct value labels. */
function NrwBars({ bars }: { readonly bars: readonly RegionNrwBar[] }): JSX.Element {
  const max = Math.max(...bars.map((b) => b.nrwPct));
  return (
    <ul className="flex flex-col gap-2" aria-label="NRW รายเขต">
      {bars.map((bar) => (
        <li key={bar.region} className="grid grid-cols-[4rem_1fr_3.5rem] items-center gap-2">
          <span className="text-xs text-on-surface-variant">เขต {bar.region}</span>
          <span className="h-3 overflow-hidden rounded-pill bg-surface-container">
            <span className="block h-full rounded-pill bg-primary" style={{ width: `${(bar.nrwPct / max) * 100}%` }} />
          </span>
          <span className="text-right text-xs text-on-surface tabular">{bar.nrwPct}%</span>
        </li>
      ))}
    </ul>
  );
}

/** The assistant's scripted answer body: text, optional bars, recommendations and citation chips. */
function AnswerBody({ answer }: { readonly answer: ScriptedAnswer }): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      {answer.paragraphs.map((p, i) => (
        <p key={i} className="text-sm text-on-surface">{p}</p>
      ))}
      {answer.bars && <NrwBars bars={answer.bars} />}
      {answer.recommendations && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-on-surface">ข้อเสนอแนะ:</span>
          <ol className="ml-4 list-decimal text-sm text-on-surface-variant">
            {answer.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        </div>
      )}
      {answer.citations.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {/* The sources are illustrative — the whole card is SIMULATED; this label keeps the chips
              from reading as genuine provenance. */}
          <span className="text-xs text-on-surface-variant">อ้างอิง (จำลอง):</span>
          {answer.citations.map((c) => (
            <Badge key={c} variant="outline">{c}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/** One chat turn: a right-aligned user bubble, or a left-aligned assistant answer card (badged
 *  SIMULATED, since every answer is scripted illustrative data — not a real model response). */
export function ChatMessage({ turn }: { readonly turn: ChatTurn }): JSX.Element {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end" data-testid="chat-user">
        <div className="max-w-[80%] rounded-card bg-primary px-4 py-2 text-sm text-on-primary">{turn.text}</div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2" data-testid="chat-assistant">
      <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-surface-container text-primary">
        <Bot className="h-4 w-4" aria-hidden="true" />
      </span>
      <Card className="flex-1">
        <CardContent className="flex flex-col gap-3 py-4">
          <div className="flex justify-end">
            <SimulatedBadge />
          </div>
          {turn.answer && <AnswerBody answer={turn.answer} />}
        </CardContent>
      </Card>
    </div>
  );
}
