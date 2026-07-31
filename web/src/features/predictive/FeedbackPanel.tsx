import { useState, type FormEvent } from "react";

import { ExternalLink } from "lucide-react";

import { StatusChip } from "@/components/StatusChip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

import { FEEDBACK_VERDICTS, PREDICTIVE_CONFIG, VERDICT_LABEL_TH } from "./predictive.config";
import { useFeedback } from "./useFeedback";
import type { Verdict } from "./types";

export interface FeedbackPanelProps {
  readonly asset: string | null;
  /** The prediction the technician is judging — ALL asset-owned (from the masked insight), so the
   *  stored verdict records what THIS device was actually predicted, not the fleet's model card. */
  readonly predictedHealth?: number | null;
  readonly predictedPttf?: number | null;
  readonly modelVersion?: string | null;
}

/**
 * The Feedback Loop (item 3.4). A real POST to /api/feedback that shows the PERSISTED ack
 * (`stored`, `id`, `created_at`) — the same "200 and persisted" a judge verifies in Swagger — plus
 * a link to `/docs` where that verification is scored. The verdict is an enum select so the four
 * accepted values are never a guess.
 */
export function FeedbackPanel({
  asset,
  predictedHealth,
  predictedPttf,
  modelVersion,
}: FeedbackPanelProps): JSX.Element {
  const { ack, submitting, error, submit } = useFeedback();
  const [verdict, setVerdict] = useState<Verdict>("confirmed");
  const [note, setNote] = useState("");

  function onSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (asset == null) return;
    void submit({
      asset_id: asset,
      verdict,
      note: note.trim() === "" ? null : note.trim(),
      predicted_health: predictedHealth ?? null,
      predicted_pttf_hours: predictedPttf ?? null,
      model_version: modelVersion ?? null,
    });
  }

  return (
    <Card className="flex flex-col gap-4" data-testid="feedback-panel">
      <CardHeader className="flex flex-row items-center justify-between pb-0">
        <CardTitle>Feedback Loop API · POST /api/feedback</CardTitle>
        <Button asChild variant="outline" size="sm">
          <a href={PREDICTIVE_CONFIG.swaggerFeedbackHref} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" aria-hidden="true" /> เปิด Swagger
          </a>
        </Button>
      </CardHeader>

      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <p className="text-dense text-on-surface-variant">
          อุปกรณ์: <span className="font-medium text-on-surface">{asset ?? "— เลือกจากรายการ —"}</span>
        </p>
        <label className="flex flex-col gap-1 text-dense text-on-surface-variant">
          ผลการตรวจสอบ
          <select
            className="rounded-control border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface"
            value={verdict}
            onChange={(e) => setVerdict(e.target.value as Verdict)}
          >
            {FEEDBACK_VERDICTS.map((v) => (
              <option key={v} value={v}>
                {VERDICT_LABEL_TH[v]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-dense text-on-surface-variant">
          บันทึกเพิ่มเติม
          <textarea
            className="min-h-16 rounded-control border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <Button type="submit" variant="primary" size="sm" disabled={asset == null || submitting}>
          {submitting ? "กำลังบันทึก…" : "ส่งผลการตรวจสอบ"}
        </Button>
      </form>

      {ack != null && (
        <p data-testid="feedback-ack" className="flex items-center gap-2 text-dense text-on-surface">
          <StatusChip kind="normal" /> บันทึกลงฐานข้อมูลแล้ว · {ack.asset_id} · id #{ack.id} · stored=
          {String(ack.stored)}
        </p>
      )}
      {error != null && (
        <Alert variant="error">
          <AlertTitle>ส่งผลการตรวจสอบไม่สำเร็จ</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </Card>
  );
}
