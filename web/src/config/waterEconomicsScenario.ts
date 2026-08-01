/**
 * SIMULATED water-economics scenario (shared by the role dashboards PR-10/11/12).
 *
 * Open data publishes water SOLD but not water PRODUCED, so NRW — (produced − sold)/produced —
 * and every figure downstream of it (energy cost, energy cost per sold m³) cannot be computed
 * from real data (POC_SPEC §3.2). This module holds ONE documented, versioned set of assumptions
 * so the three dashboards can never drift into three incompatible synthetic stories. Every value
 * these assumptions produce is SIMULATED and is rendered only beside a `SimulatedBadge`.
 *
 * These are ASSUMPTIONS, not PWA facts. With DMAMA's `realtime_water_produce` feed (POC_SPEC
 * §3.3) the produced-water numerator becomes real and this scenario is replaced by a live source.
 */

export interface WaterEconomicsScenario {
  readonly scenarioId: string;
  readonly version: string;
  /** Assumed system NRW as a fraction 0 ≤ r < 1 (produced water that is never billed). */
  readonly nrwRate: number;
  /** Assumed specific energy to abstract, treat and distribute one produced m³ (kWh/m³). */
  readonly kwhPerProducedM3: number;
  /** Assumed utility electricity tariff (THB per kWh). */
  readonly thbPerKwh: number;
  /** Human-readable basis for each assumption — shown/citable, so a reader can judge it. */
  readonly basis: string;
  readonly simulated: true;
}

export const WATER_ECONOMICS_SCENARIO: WaterEconomicsScenario = {
  scenarioId: "pwa-poc-baseline",
  version: "2026-08-01",
  // Order-of-magnitude figures for a Thai water utility; deliberately round, not precise claims.
  nrwRate: 0.3,
  kwhPerProducedM3: 0.45,
  thbPerKwh: 4.2,
  basis:
    "สมมติฐานตัวอย่างสำหรับ POC — NRW ~30%, พลังงาน ~0.45 kWh/ลบ.ม., ค่าไฟ ~4.2 บาท/kWh " +
    "(ระดับ order-of-magnitude ของกิจการประปา ไม่ใช่ค่าที่วัดจริงของ กปภ.)",
  simulated: true,
};

/** A scenario is usable only if every assumption is in range; otherwise callers must render `—`. */
export function isValidScenario(s: WaterEconomicsScenario): boolean {
  return (
    Number.isFinite(s.nrwRate) &&
    s.nrwRate >= 0 &&
    s.nrwRate < 1 &&
    Number.isFinite(s.kwhPerProducedM3) &&
    s.kwhPerProducedM3 >= 0 &&
    Number.isFinite(s.thbPerKwh) &&
    s.thbPerKwh >= 0
  );
}
