/**
 * Data + helper for the Regional S2 sub-panels (Path D, PR-D4).
 *
 * HONESTY: per-branch NRW is SIMULATED (see `simulatedBranchNrwPct`) and the Step-Test history is an
 * ILLUSTRATIVE activity log (POC ผนวก ๖) — both are rendered ONLY behind a `SimulatedBadge`.
 */
import { sortBranchBars } from "./regionalClient";
import type { BranchBar } from "./types";

/** The `n` branches with the highest (simulated) NRW — reuses the tested tri-state sort. */
export function topBranchesByNrw(bars: readonly BranchBar[], n: number): BranchBar[] {
  return sortBranchBars(bars, "nrw", "desc").slice(0, Math.max(0, n));
}

export interface StepTest {
  readonly dateTh: string;
  readonly dma: string;
  readonly resultTh: string;
  /** Whether a leak was found — drives the icon + label (never colour alone). */
  readonly leak: boolean;
}

/** SIMULATED recent Step-Test (leak-detection) history for the region. */
export const SIM_STEP_TESTS: readonly StepTest[] = [
  { dateTh: "12 ธ.ค. 2568", dma: "DMA-03", resultTh: "พบรอยรั่ว 2 จุด — ซ่อมแล้ว", leak: true },
  { dateTh: "5 ธ.ค. 2568", dma: "DMA-07", resultTh: "ปกติ ไม่พบรอยรั่ว", leak: false },
  { dateTh: "28 พ.ย. 2568", dma: "DMA-01", resultTh: "พบรอยรั่ว 1 จุด — รอซ่อม", leak: true },
];
