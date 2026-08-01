/**
 * Pure derivations for the Branch S3 sub-panels (Path D, PR-D3). Kept out of the components so the
 * arithmetic is unit-testable without a DOM.
 *
 * HONESTY: `peerTopPercentile` is REAL — it uses only the endpoint's real `rank`/`branchCount`.
 * `simProduction`/`simForecast` SYNTHESISE figures open data cannot supply (produced water, the
 * per-customer assumption, a naive projection); their consumers render them ONLY behind a
 * `SimulatedBadge`.
 */

/** Illustrative average monthly consumption per connection (m³) — the SIMULATED assumption that turns
 *  real sold-volume into a customer count. */
export const SIM_AVG_M3_PER_CUSTOMER = 28;

/**
 * The branch's standing as a "top X%" — REAL. rank 1 of 30 → top 3.3%. `null` when rank is unknown or
 * the region has no branches.
 */
export function peerTopPercentile(rank: number | null, branchCount: number): number | null {
  if (rank == null || branchCount <= 0) return null;
  return (rank / branchCount) * 100;
}

export interface ProductionVM {
  /** Produced water = sold / (1 − NRW). SIMULATED (NRW is simulated). */
  readonly producedM3: number | null;
  /** Water sold — REAL (echoed here for the card's produced-vs-sold framing). */
  readonly soldM3: number | null;
  /** Non-revenue water volume = produced − sold. SIMULATED. */
  readonly lossM3: number | null;
  /** Connections served ≈ sold / avg-per-customer. SIMULATED (the per-customer rate is an assumption). */
  readonly customers: number | null;
}

/** Produced / loss / customers from real sold volume and the simulated per-branch NRW. */
export function simProduction(soldM3: number | null, nrwPct: number | null): ProductionVM {
  if (soldM3 == null || soldM3 < 0 || !Number.isFinite(soldM3)) {
    return { producedM3: null, soldM3: null, lossM3: null, customers: null };
  }
  const nrw = nrwPct != null && nrwPct > 0 && nrwPct < 100 ? nrwPct / 100 : null;
  const producedM3 = nrw != null ? soldM3 / (1 - nrw) : null;
  const lossM3 = producedM3 != null ? producedM3 - soldM3 : null;
  const customers = Math.round(soldM3 / SIM_AVG_M3_PER_CUSTOMER);
  return { producedM3, soldM3, lossM3, customers };
}

export interface ForecastVM {
  readonly nextM3: number | null;
  readonly lowM3: number | null;
  readonly highM3: number | null;
}

/** A naive next-month projection: this month × (1 + MoM), with a ±3% band. SIMULATED — an illustrative
 *  "AI forecast", not a trained model. */
export function simForecast(m3: number | null, momPct: number | null): ForecastVM {
  if (m3 == null || !Number.isFinite(m3) || m3 < 0) return { nextM3: null, lowM3: null, highM3: null };
  const growth = momPct != null && Number.isFinite(momPct) ? momPct / 100 : 0;
  const nextM3 = m3 * (1 + growth);
  return { nextM3, lowM3: nextM3 * 0.97, highM3: nextM3 * 1.03 };
}
