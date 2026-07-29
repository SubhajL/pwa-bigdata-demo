/**
 * T6 / T7 — the two honesty controls (DREP-PR6 R8, R9).
 *
 * `SimulatedBadge` is the marker POC_SPEC §3.2 and CLAUDE.md require on every synthetic
 * value; `StatusChip` is what makes status legible without colour. Both are the kind of
 * control that quietly rots, so these tests check ownership across the tree, not just
 * that the component renders.
 *
 * Authored by Claude; the implementer must not modify this file (DREP §10).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SIMULATED_ARIA_LABEL, SimulatedBadge } from "@/components/SimulatedBadge";
import { STATUS_LABEL_TH, StatusChip, type StatusKind } from "@/components/StatusChip";

const SRC_DIR = join(process.cwd(), "src");
const KINDS: readonly StatusKind[] = ["normal", "warning", "critical", "nodata"];

afterEach(cleanup);

function productionFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full);
    }
  };
  walk(SRC_DIR);
  return out;
}

describe("T6 — the SIMULATED marker", () => {
  it("renders visible text and the Thai screen-reader label", () => {
    render(<SimulatedBadge />);
    expect(screen.getByText("SIMULATED")).toBeInTheDocument();
    expect(screen.getByLabelText(SIMULATED_ARIA_LABEL)).toBeInTheDocument();
  });

  it("uses the exact wording the spec requires", () => {
    // Not paraphrasable: this is the sentence a screen reader speaks to a judge.
    expect(SIMULATED_ARIA_LABEL).toBe("ข้อมูลจำลอง ไม่ใช่ข้อมูลจริงของ กปภ.");
  });

  it("keeps its label when rendered inside a table header", () => {
    // INTERACTIONS.md: on a table column the pill goes in the <th>, never per cell.
    render(
      <table>
        <thead>
          <tr>
            <th>
              อัตราน้ำสูญเสีย <SimulatedBadge />
            </th>
          </tr>
        </thead>
      </table>,
    );
    expect(screen.getByLabelText(SIMULATED_ARIA_LABEL)).toBeInTheDocument();
  });

  it("is the ONLY production module that touches the reserved violet", () => {
    // Grepping the custom property alone would miss a component using the Tailwind
    // utility (`bg-simulated`), which is how the reservation would actually be broken.
    const violet = /--color-simulated|--simulated|\bbg-simulated\b|\btext-simulated\b|\bborder-simulated\b|\bviolet-\d/;
    const offenders = productionFiles()
      .filter((f) => !f.endsWith(join("components", "SimulatedBadge.tsx")))
      .filter((f) => violet.test(readFileSync(f, "utf8")));
    expect(
      offenders.map((f) => f.slice(SRC_DIR.length)),
      "violet is reserved for SIMULATED; any other use dilutes the one signal the committee is told to trust",
    ).toEqual([]);
  });
});

describe("T7 — StatusChip never encodes status by colour alone", () => {
  it.each(KINDS)("%s renders a visible Thai label and an icon", (kind) => {
    render(<StatusChip kind={kind} />);
    expect(screen.getByText(STATUS_LABEL_TH[kind])).toBeInTheDocument();
    expect(document.querySelector(`[data-icon="${kind}"]`)).not.toBeNull();
  });

  it("gives every status a DISTINCT label", () => {
    const labels = KINDS.map((k) => STATUS_LABEL_TH[k]);
    expect(new Set(labels).size).toBe(KINDS.length);
    expect(labels.every((l) => l.trim().length > 0)).toBe(true);
  });

  it("gives every status a DISTINCT icon", () => {
    // An identical icon for every state satisfies a naive "an svg exists" check while
    // encoding nothing — the icon is half of the required secondary encoding.
    const rendered = KINDS.map((kind) => {
      cleanup();
      render(<StatusChip kind={kind} />);
      const icon = document.querySelector(`[data-icon="${kind}"]`);
      expect(icon, `no icon for ${kind}`).not.toBeNull();
      return icon!.innerHTML;
    });
    expect(new Set(rendered).size, "two statuses share an icon glyph").toBe(KINDS.length);
  });

  it("treats nodata as its own state, not a silent 'normal'", () => {
    render(<StatusChip kind="nodata" />);
    expect(screen.getByText("ไม่มีข้อมูล")).toBeInTheDocument();
    expect(screen.queryByText("ปกติ")).not.toBeInTheDocument();
  });

  it("exposes the status in the accessible name, not only the fill", () => {
    // INTERACTIONS.md §Keyboard & a11y: the status belongs in the NAME.
    const { container } = render(<StatusChip kind="critical" />);
    expect(container.textContent).toContain("วิกฤต");
  });
});
