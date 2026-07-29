/**
 * The content extremes design/INTERACTIONS.md says every data component must handle and
 * the mockups never show.
 *
 * A fixture module, deliberately consumed by tests rather than by a screen — the
 * no-orphan rule in CLAUDE.md targets components and routes, not test data. Screen PRs
 * (PR-7 onwards) render their components against these before they are considered done.
 *
 * Verbatim from INTERACTIONS.md §"Content extremes":
 *   0 branches · 1 branch · 235 branches · a 60-character branch name (must truncate with
 *   a tooltip, never wrap the row to two lines) · null customer count (renders "—", never
 *   0 and never NaN) · Thai + Latin in the same cell · a branch reporting 0 m³
 *   (legitimate, and must be distinguishable from missing).
 *
 * NOTE on 235: that is an OVERFLOW STRESS COUNT, not a claim about the data. The real
 * dataset has 234 distinct branch_codes and 235 distinct labels, because one branch was
 * renamed (5551014: บ้านนาสาร -> เวียงสระ). Identity is the code, never the label — see
 * simulator/app/roster.py.
 */

export interface BranchFixture {
  readonly branch_code: string;
  readonly branch: string;
  readonly province: string;
  readonly region: number;
  readonly water_sold_m3: number;
  /** null models "not reported", which must render as "—" and never as 0. */
  readonly customers: number | null;
  readonly mom_pct: number | null;
  readonly yoy_pct: number | null;
}

/** Exactly 60 characters, to prove truncation + tooltip rather than a two-line row. */
export const SIXTY_CHAR_BRANCH_NAME: string = "ก".repeat(60);

export interface Extremes {
  readonly empty: readonly BranchFixture[];
  readonly single: readonly BranchFixture[];
  readonly overflow: readonly BranchFixture[];
  readonly longName: BranchFixture;
  readonly nullCustomers: BranchFixture;
  readonly mixedScript: BranchFixture;
  readonly zeroVolume: BranchFixture;
}

function makeBranch(index: number): BranchFixture {
  const code = String(index).padStart(7, "0");
  return {
    branch_code: code,
    branch: `สาขาทดสอบ ${index}`,
    province: "กรุงเทพมหานคร",
    region: 1,
    water_sold_m3: 10000 + index * 10,
    customers: 500 + index,
    mom_pct: 1.0,
    yoy_pct: 2.0,
  };
}

/**
 * Build the fixture set.
 *
 * `overflow` must contain exactly 235 rows with UNIQUE branch_codes, so a table under
 * test cannot accidentally pass by de-duplicating.
 */
export function buildExtremes(): Extremes {
  const overflow: BranchFixture[] = Array.from({ length: 235 }, (_, i) => makeBranch(i + 1));

  return {
    empty: [],
    single: [makeBranch(1)],
    overflow,
    longName: {
      branch_code: "LONG001",
      branch: SIXTY_CHAR_BRANCH_NAME,
      province: "นครราชสีมา",
      region: 5,
      water_sold_m3: 50000,
      customers: 2000,
      mom_pct: null,
      yoy_pct: null,
    },
    nullCustomers: {
      branch_code: "NULLCUS",
      branch: "สาขาไม่มีข้อมูลลูกค้า",
      province: "ชลบุรี",
      region: 2,
      water_sold_m3: 30000,
      customers: null,
      mom_pct: null,
      yoy_pct: null,
    },
    mixedScript: {
      branch_code: "MIX001",
      branch: "สาขา ABC District 123",
      province: "ระยอง",
      region: 2,
      water_sold_m3: 15000,
      customers: 800,
      mom_pct: -2.5,
      yoy_pct: 3.1,
    },
    zeroVolume: {
      branch_code: "ZERO001",
      branch: "สาขาปริมาณศูนย์",
      province: "นนทบุรี",
      region: 1,
      water_sold_m3: 0,
      customers: 100,
      mom_pct: null,
      yoy_pct: null,
    },
  };
}
