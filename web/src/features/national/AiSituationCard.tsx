import { Bot } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { formatMonthTh } from "@/lib/format";

import { regionLabelTh } from "./national.config";
import { momYoyFromSeries } from "./nationalClient";
import type { NationalSeries, RegionRollup } from "./types";

export interface AiSituationCardProps {
  readonly rollup: RegionRollup;
  readonly series: NationalSeries;
}

/**
 * The AI situation card (Stitch S1 §D, INTERACTIONS.md §AI card). Scripted for the POC: it names a
 * SPECIFIC region and a SPECIFIC action (a recommendation with no named subject is not shipped),
 * grounded in REAL figures (top region by volume, national YoY). The provenance caption is ALWAYS
 * rendered — it is not a placeholder to delete before the demo — so no one mistakes the script for
 * a live LLM. No violet badge: this is narrative, not a synthetic KPI, and every number in it is
 * real.
 */
export function AiSituationCard({ rollup, series }: AiSituationCardProps): JSX.Element {
  const top = rollup.regions[0];
  const delta = momYoyFromSeries(series, rollup.month);
  return (
    <Card className="border-l-4 border-secondary" data-testid="ai-situation">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-secondary" aria-hidden="true" />
          บทวิเคราะห์สถานการณ์
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-body text-on-surface">
          ภาพรวมเดือน {formatMonthTh(rollup.month)}: ปริมาณจำหน่ายทั้งประเทศ{" "}
          <Num kind="m3" value={rollup.total_m3} /> (
          <Num kind="percent" digits={1} value={delta.yoyPct} /> เทียบปีก่อน)
          {top != null && (
            <>
              {" "}
              โดย {regionLabelTh(top.region)} มีปริมาณจำหน่ายสูงสุด
            </>
          )}
          .
        </p>
        {top != null && (
          <p className="text-body font-medium text-on-surface">
            ข้อเสนอแนะ · Recommendation: ทบทวนแผนบำรุงรักษาเชิงพยากรณ์ใน {regionLabelTh(top.region)}{" "}
            และเร่งตรวจสอบสาขาที่ปริมาณจำหน่ายลดลงต่อเนื่อง
          </p>
        )}
        <p className="text-label text-on-surface-variant" data-testid="ai-provenance">
          ข้อความนี้เป็นสคริปต์ตัวอย่าง ไม่ใช่ LLM แบบเรียลไทม์
        </p>
      </CardContent>
    </Card>
  );
}
