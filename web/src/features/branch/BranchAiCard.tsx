import { Bot } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";

import type { BranchStanding, BranchVitals } from "./types";

export interface BranchAiCardProps {
  readonly branch: string;
  readonly vitals: BranchVitals;
  readonly standing: BranchStanding;
}

/**
 * Scripted branch-level AI note (Stitch S3 §AI card, INTERACTIONS.md §AI card). Names THIS branch
 * and a specific action, grounded in REAL figures (rank in region, YoY). The provenance caption is
 * ALWAYS rendered — not a placeholder to delete. No violet badge: the narrative cites only real
 * facts (the simulated NRW/status live in their own badged tile, not restated here as fact).
 */
export function BranchAiCard({ branch, vitals, standing }: BranchAiCardProps): JSX.Element {
  // Decide "below median" from the REAL selected-month volume vs the REAL region median — NOT from
  // rank > count/2, which mislabels a branch sitting exactly AT the median. `null` (unknown) when
  // either is missing → the neutral recommendation.
  const belowMedian =
    vitals.m3 != null && standing.regionMedianM3 != null ? vitals.m3 < standing.regionMedianM3 : false;
  return (
    <Card className="border-l-4 border-secondary" data-testid="branch-ai">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-secondary" aria-hidden="true" />
          ผู้ช่วย AI · ข้อเสนอแนะระดับสาขา
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-body text-on-surface">
          {branch}
          {standing.rank != null && standing.branchCount > 0 && (
            <> อยู่อันดับ {standing.rank} จาก {standing.branchCount} สาขาในเขต</>
          )}
          {vitals.yoyPct != null && (
            <> · ปริมาณจำหน่าย <Num kind="percent" digits={1} value={vitals.yoyPct} /> เทียบปีก่อน</>
          )}
          .
        </p>
        <p className="text-body font-medium text-on-surface">
          ข้อเสนอแนะ · Recommendation:{" "}
          {belowMedian
            ? "ปริมาณจำหน่ายต่ำกว่าค่ากลางของเขต — ทบทวนแผนเพิ่มการจำหน่ายและเร่งตรวจสอบการสูญเสียน้ำในพื้นที่"
            : "รักษาระดับการจำหน่ายและเฝ้าระวังการสูญเสียน้ำอย่างต่อเนื่อง"}
        </p>
        <p className="text-label text-on-surface-variant" data-testid="branch-ai-provenance">
          ข้อความนี้เป็นสคริปต์ตัวอย่าง ไม่ใช่ LLM แบบเรียลไทม์
        </p>
      </CardContent>
    </Card>
  );
}
