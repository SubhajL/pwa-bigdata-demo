import { Ban, CheckCircle2, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { AI_TRIAGE_NOTE_TH, ALERT_CHANNELS, ALERT_RULES } from "./alerts.config";

export interface AlertSidebarProps {
  readonly enabledRules: ReadonlySet<string>;
  readonly onToggleRule: (id: string) => void;
}

/** A minimal accessible switch — a real `role="switch"` with `aria-checked`, styled with tokens. */
function Switch({ on, onToggle, label }: { readonly on: boolean; readonly onToggle: () => void; readonly label: string }): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition-colors duration-[var(--anim-fast)] ease-standard", on ? "bg-primary" : "bg-outline-variant")}
    >
      <span className={cn("inline-block h-4 w-4 rounded-pill bg-surface-container-lowest transition-transform duration-[var(--anim-fast)] ease-standard", on ? "translate-x-6" : "translate-x-1")} />
    </button>
  );
}

/** Alert rules — each toggle is real local state (a switch is its own effect). */
function RulesCard({ enabledRules, onToggleRule }: AlertSidebarProps): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">กฎการแจ้งเตือน · Alert Rules</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {ALERT_RULES.map((rule) => (
          <div key={rule.id} className="flex items-center justify-between gap-3">
            <span className="text-sm text-on-surface">{rule.textTh}</span>
            <Switch on={enabledRules.has(rule.id)} onToggle={() => onToggleRule(rule.id)} label={rule.textTh} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Channels — status display (icon + Thai label), never colour alone. */
function ChannelsCard(): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ช่องทางการแจ้งเตือน · Channels</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {ALERT_CHANNELS.map((ch) => (
          <div key={ch.id} className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-on-surface">
              <ch.icon className="h-4 w-4 text-on-surface-variant" aria-hidden="true" /> {ch.labelTh}
            </span>
            {ch.enabled ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-status-normal">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> เปิดใช้งาน
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-semibold text-on-surface-variant">
                <Ban className="h-4 w-4" aria-hidden="true" /> ปิด
              </span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** The S7 right column: rules, channels, and the AI-triage note. */
export function AlertSidebar({ enabledRules, onToggleRule }: AlertSidebarProps): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <RulesCard enabledRules={enabledRules} onToggleRule={onToggleRule} />
      <ChannelsCard />
      <Card>
        <CardContent className="flex items-start gap-2 py-4 text-sm text-on-surface-variant">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> {AI_TRIAGE_NOTE_TH}
        </CardContent>
      </Card>
    </div>
  );
}
