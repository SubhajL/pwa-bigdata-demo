import { CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { DATA_SCOPE_TH, GUARDRAILS_TH, SUGGESTED_QUESTIONS } from "./assistant.config";

export interface AssistantSidebarProps {
  readonly onAsk: (text: string) => void;
}

/** Suggested questions — clicking one asks it (a real action; the conversation grows). */
function SuggestedCard({ onAsk }: AssistantSidebarProps): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> คำถามแนะนำ
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q.id}
            type="button"
            onClick={() => onAsk(q.textTh)}
            className="rounded-control border border-outline-variant px-3 py-2 text-left text-sm text-on-surface transition-colors duration-[var(--anim-fast)] ease-standard hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {q.textTh}
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

/** The S9 right column: suggested questions, data scope, and the AI guardrails (SIMULATED). */
export function AssistantSidebar({ onAsk }: AssistantSidebarProps): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <SuggestedCard onAsk={onAsk} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ขอบเขตข้อมูลของคุณ · Your Data Scope</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-on-surface-variant">{DATA_SCOPE_TH}</CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" /> การควบคุมความเสี่ยง AI
          </CardTitle>
          <SimulatedBadge />
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {GUARDRAILS_TH.map((g) => (
            <span key={g} className="flex items-center gap-2 text-sm text-on-surface">
              <CheckCircle2 className="h-4 w-4 text-status-normal" aria-hidden="true" /> {g}
            </span>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
