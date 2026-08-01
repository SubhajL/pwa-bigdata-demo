/**
 * PR-13 (S5) — the System Admin data contract. Pure data, so these assert the invariants a
 * component then relies on: the tabs match the mockup, every roster role has display
 * metadata, and the roster carries more than one account state to render.
 */
import { describe, expect, it } from "vitest";

import {
  ADMIN_TABS,
  ROLE_META,
  SIM_ROSTER,
  type AdminRole,
  type AdminTabId,
} from "./admin";

describe("ADMIN_TABS", () => {
  it("has the five S5 tabs with users first", () => {
    expect(ADMIN_TABS.map((t) => t.id)).toEqual([
      "users",
      "connections",
      "ai",
      "kpi",
      "backup",
    ] satisfies AdminTabId[]);
  });

  it("gives every tab a non-empty Thai label", () => {
    for (const tab of ADMIN_TABS) expect(tab.labelTh.trim().length).toBeGreaterThan(0);
  });
});

describe("ROLE_META", () => {
  it("covers every role the roster actually uses", () => {
    for (const user of SIM_ROSTER) {
      expect(ROLE_META[user.role], `no ROLE_META for ${user.role}`).toBeDefined();
    }
  });

  it("gives every role a distinct English label", () => {
    const roles = Object.keys(ROLE_META) as AdminRole[];
    const labels = roles.map((r) => ROLE_META[r].labelEn);
    expect(new Set(labels).size).toBe(roles.length);
  });
});

describe("SIM_ROSTER", () => {
  it("mirrors the mockup's first row (Executive สมชาย)", () => {
    expect(SIM_ROSTER[0]).toMatchObject({
      email: "somchai@pwa.co.th",
      role: "executive",
      active: true,
    });
  });

  it("uses pwa.co.th addresses for every user", () => {
    for (const user of SIM_ROSTER) expect(user.email).toMatch(/@pwa\.co\.th$/);
  });

  it("shows more than one account status so the column is not colour-decoration", () => {
    const states = new Set(SIM_ROSTER.map((u) => u.active));
    expect(states.size).toBe(2);
  });
});
