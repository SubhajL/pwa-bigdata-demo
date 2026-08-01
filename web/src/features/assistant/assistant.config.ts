/**
 * AI Assistant (Stitch S9, PR-16) — a SCRIPTED assistant (PR-PLAN: "AI Assistant (scripted)"). Config
 * + its canned answers in one place (CLAUDE.md).
 *
 * HONESTY: there is no live LLM. Every answer is a fixed script and every figure in it is illustrative,
 * so the screen renders `SimulatedBadge`s and a disclaimer. Nothing here is a real model response or
 * real PWA data.
 */
export interface RegionNrwBar {
  readonly region: number;
  readonly nrwPct: number;
}

export interface ScriptedAnswer {
  readonly paragraphs: readonly string[];
  /** Optional single-series NRW-by-region bars (magnitude → one hue). */
  readonly bars?: readonly RegionNrwBar[];
  readonly recommendations?: readonly string[];
  /** Provenance chips — a guardrail is "cite every answer", so this is never empty for a data answer. */
  readonly citations: readonly string[];
}

export interface SuggestedQuestion {
  readonly id: string;
  readonly textTh: string;
  /** Lowercased substrings that route a typed question to this answer. */
  readonly keywords: readonly string[];
  readonly answer: ScriptedAnswer;
}

const NRW_BARS: readonly RegionNrwBar[] = [
  { region: 3, nrwPct: 35.2 },
  { region: 10, nrwPct: 34.1 },
  { region: 7, nrwPct: 33.6 },
];

/** The exchange shown when the screen loads (mirrors the S9 mock). */
export const SEED_QUESTION = "ภาพรวมน้ำสูญเสียเดือนนี้เป็นอย่างไร เจาะเขตที่น่าห่วงที่สุด";
export const SEED_ANSWER: ScriptedAnswer = {
  paragraphs: [
    "ภาพรวมทั้งประเทศ ธ.ค. 2568: ปริมาณน้ำจำหน่าย 120,999,834 ลบ.ม. (−2.0% เทียบปีก่อน) · NRW เฉลี่ย 31.4%",
    "เขตที่น่าห่วงที่สุด:",
  ],
  bars: NRW_BARS,
  recommendations: [
    "สั่งการให้สาขาสมุทรสาครทำ Step Test ในพื้นที่ DMA-03",
    "ตรวจสอบมาตรวัดหลักและปั๊ม P-2 ที่มี SEC สูง",
  ],
  citations: ["data_0072", "NRW (SIMULATED)", "Executive Dashboard"],
};

export const SUGGESTED_QUESTIONS: readonly SuggestedQuestion[] = [
  {
    id: "nrw-top",
    textTh: "NRW เขตไหนสูงสุด",
    keywords: ["nrw", "เขต", "สูง"],
    answer: {
      paragraphs: ["เขตที่มี NRW สูงสุด 3 อันดับแรก (ธ.ค. 2568):"],
      bars: NRW_BARS,
      citations: ["data_0072", "NRW (SIMULATED)"],
    },
  },
  {
    id: "energy-cost",
    textTh: "ต้นทุนพลังงานเดือนนี้",
    keywords: ["ต้นทุน", "พลังงาน"],
    answer: {
      paragraphs: ["ต้นทุนพลังงานรวมทั้งประเทศ ธ.ค. 2568: ประมาณ 48.2 ล้านบาท — สูงกว่าเดือนก่อน 3.1% จากการเดินปั๊มช่วงพีค"],
      citations: ["ต้นทุนพลังงาน (SIMULATED)", "Executive Dashboard"],
    },
  },
  {
    id: "capacity",
    textTh: "สาขาที่ผลิตน้ำใกล้เต็มกำลัง",
    keywords: ["ผลิต", "กำลัง", "เต็ม"],
    answer: {
      paragraphs: ["สาขาที่ผลิตน้ำใกล้เต็มกำลัง (>90% ของกำลังการผลิต): สมุทรสาคร, สิงห์บุรี, ปทุมธานี — ควรวางแผนขยายกำลังการผลิต"],
      citations: ["กำลังการผลิต (SIMULATED)"],
    },
  },
  {
    id: "today",
    textTh: "สรุปสถานการณ์วันนี้",
    keywords: ["สรุป", "สถานการณ์", "วันนี้"],
    answer: {
      paragraphs: ["สรุปวันนี้: การแจ้งเตือนวิกฤต 3 รายการ (ปั๊ม P-2, DMA-03), NRW เฉลี่ยทรงตัวที่ 31.4%, ระบบรับข้อมูลปกติ"],
      citations: ["Alert Center (SIMULATED)", "Executive Dashboard"],
    },
  },
];

/** Honest scripted fallback for any input that matches no suggested question. */
export const FALLBACK_ANSWER: ScriptedAnswer = {
  paragraphs: [
    "นี่คือการสาธิต — ผู้ช่วยตอบจากชุดสคริปต์ตัวอย่าง ยังไม่ได้เชื่อมต่อกับ LLM จริง",
    "ลองเลือกคำถามแนะนำทางด้านขวา",
  ],
  citations: [],
};

export const DATA_SCOPE_TH = "ข้อมูลภาพรวมระดับประเทศ / เขต / สาขา ตามสิทธิ์ผู้ใช้ (RBAC)";

export const GUARDRAILS_TH: readonly string[] = [
  "Hallucination Control",
  "ไม่เปิดเผยข้อมูลส่วนบุคคล (PII)",
  "อ้างอิงแหล่งข้อมูลทุกคำตอบ",
];

export const INPUT_DISCLAIMER_TH = "AI อาจตอบผิดพลาด ควรตรวจสอบก่อนตัดสินใจ · คำตอบเป็นสคริปต์ตัวอย่าง";
