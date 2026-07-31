/**
 * Primitive-layer acceptance tests, including the `tabular-nums` half of R10.
 *
 * `format.test.ts` proves the STRINGS are right; nothing there can prove a rendered
 * numeral is tabular, which is what tokens.map.md actually requires ("on **every**
 * numeral"). `Num` is where that becomes enforceable.
 *
 * Authored by Claude; the implementer must not modify this file (DREP §10).
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Num } from "@/components/ui/num";
import { Skeleton } from "@/components/ui/skeleton";
import { DASH } from "@/lib/format";

afterEach(cleanup);

describe("Num — the only sanctioned way to render a numeral", () => {
  it("renders every numeral with tabular figures", () => {
    const { container } = render(<Num value={1234567} />);
    const el = container.firstElementChild;
    expect(el).not.toBeNull();
    // Columns of figures must align and a KPI must not reflow as it ticks.
    expect(el!.className).toMatch(/\btabular(-nums)?\b/);
  });

  it("shows a missing value as the dash and a real zero as 0", () => {
    const { rerender, container } = render(<Num value={null} />);
    expect(container.textContent).toBe(DASH);
    rerender(<Num value={0} />);
    expect(container.textContent).toBe("0");
  });

  it("formats each kind through the shared formatter", () => {
    const { rerender, container } = render(<Num value={1234} kind="m3" />);
    expect(container.textContent).toContain("ลบ.ม.");
    rerender(<Num value={-2} kind="percent" />);
    expect(container.textContent).toBe("-2.0%");
    rerender(<Num value={1.2345} kind="percent" digits={2} />);
    expect(container.textContent).toBe("+1.23%");
    // decimal (PR-8): latency ms / msg/s need fraction digits int would round away.
    rerender(<Num value={3.14159} kind="decimal" digits={2} />);
    expect(container.textContent).toBe("3.14");
    rerender(<Num value={0} kind="decimal" digits={2} />);
    expect(container.textContent).toBe("0.00"); // a measured zero, distinct from the dash
  });
});

describe("Button", () => {
  it("renders its children and stays a real button", () => {
    render(<Button>ส่งออกรายงาน</Button>);
    expect(screen.getByRole("button", { name: "ส่งออกรายงาน" })).toBeInTheDocument();
  });

  it("forwards disabled", () => {
    render(<Button disabled>ส่งออก</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("renders as its child when asChild is set", () => {
    render(
      <Button asChild>
        <a href="/reports">รายงาน</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "รายงาน" })).toHaveAttribute("href", "/reports");
  });

  it("keeps a focus ring rather than removing the outline outright", () => {
    // INTERACTIONS.md: never `outline: none` without a replacement.
    const { container } = render(<Button>ก</Button>);
    expect(container.firstElementChild!.className).toMatch(/focus-visible:/);
  });
});

describe("Card", () => {
  it("composes header, title and content", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>ปริมาณน้ำจำหน่าย</CardTitle>
        </CardHeader>
        <CardContent>เนื้อหา</CardContent>
      </Card>,
    );
    expect(screen.getByRole("heading", { name: "ปริมาณน้ำจำหน่าย" })).toBeInTheDocument();
    expect(screen.getByText("เนื้อหา")).toBeInTheDocument();
  });
});

describe("Badge", () => {
  it("renders its label", () => {
    render(<Badge>ปกติ</Badge>);
    expect(screen.getByText("ปกติ")).toBeInTheDocument();
  });
});

describe("Alert", () => {
  it("announces itself and carries the three-part error message", () => {
    render(
      <Alert variant="error">
        <AlertTitle>ไม่สามารถโหลดข้อมูลรายสาขาได้</AlertTitle>
        <AlertDescription>การเชื่อมต่อฐานข้อมูลหมดเวลา · กดลองใหม่อีกครั้ง</AlertDescription>
      </Alert>,
    );
    // Never a bare "Error": what happened · why · how to fix.
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("ไม่สามารถโหลดข้อมูลรายสาขาได้")).toBeInTheDocument();
    expect(screen.getByText(/กดลองใหม่อีกครั้ง/)).toBeInTheDocument();
  });
});

describe("Skeleton", () => {
  it("honours the caller's geometry instead of collapsing the layout", () => {
    // INTERACTIONS.md: skeletons match final geometry; never a centred spinner that
    // shifts the page.
    const { container } = render(<Skeleton className="h-24 w-full" />);
    expect(container.firstElementChild!.className).toContain("h-24");
    expect(container.firstElementChild!.className).toContain("w-full");
  });

  it("is hidden from the accessibility tree", () => {
    const { container } = render(<Skeleton className="h-4" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
