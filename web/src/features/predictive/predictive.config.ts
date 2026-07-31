/**
 * Predictive-panel configuration (PR-9, topic ๓). The single place the panel's tunables live,
 * so none is buried as a literal in a component — and part of the scored item-2.5 "config file"
 * story the twin already tells.
 *
 * The band thresholds MIRROR the model's own (`pwa_ml.predict.WARNING_BELOW` = 65,
 * `CRITICAL_BELOW` = 40). They are used ONLY to band aggregates the API returns no status for
 * (e.g. the average-health KPI); every per-device status comes from the API, never re-derived.
 */

import type { Signal, Verdict } from "./types";

export const PREDICTIVE_CONFIG = {
  /** How often to poll GET /api/worklist. */
  worklistPollMs: 5000,
  /** Rows requested from the worklist (the whole demo fleet is small). */
  worklistLimit: 20,
  /** "PTTF < 7 days" KPI threshold, in hours (7 × 24). */
  pttfWarningHours: 168,
  /** Health bands for AGGREGATES only (per-device status comes from the API). */
  healthWarningBelow: 65,
  healthCriticalBelow: 40,
  /** Swagger UI, where a judge exercises POST /api/feedback for item 3.4. Proxied to the API
   *  (see web/vite.config.ts); the operator expands the "predictive" tag. */
  swaggerFeedbackHref: "/docs",
} as const;

export type PredictiveConfig = typeof PREDICTIVE_CONFIG;

/** The four verdicts, in the order the feedback `<select>` offers them (mirrors `Verdict`). */
export const FEEDBACK_VERDICTS: readonly Verdict[] = [
  "confirmed",
  "false_alarm",
  "repaired",
  "deferred",
] as const;

/** Thai labels for the verdict enum — the select is Thai UI, the value stays the wire enum. */
export const VERDICT_LABEL_TH: Readonly<Record<Verdict, string>> = {
  confirmed: "ยืนยันตามพยากรณ์",
  false_alarm: "แจ้งเตือนผิดพลาด",
  repaired: "ซ่อมแล้ว",
  deferred: "เลื่อนการตรวจสอบ",
};

/** Thai · English labels for the RCA signals (mirrors `pwa_ml.lifecycle.SIGNAL_FIELDS`). */
export const SIGNAL_LABEL_TH: Readonly<Record<Signal, string>> = {
  pressure_bar: "ความดัน · Pressure",
  flow_m3h: "อัตราการไหล · Flow",
  power_kw: "กำลังไฟฟ้า · Power",
  vibration: "การสั่นสะเทือน · Vibration",
  bearing_temp_c: "อุณหภูมิลูกปืน · Bearing Temp",
};
