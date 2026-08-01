/**
 * PR-16 (S9) — the scripted AI Assistant screen. A proposal-narrative surface with SIMULATED answers
 * and REAL interactions: a suggested-question chip or the input appends a user turn + a canned answer.
 * No network / no LLM.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SIMULATED_ARIA_LABEL } from "@/components/SimulatedBadge";

import { AiAssistantScreen } from "./AiAssistantScreen";

afterEach(cleanup);

describe("AiAssistantScreen", () => {
  it("renders the heading carrying the nav label synchronously", () => {
    render(<AiAssistantScreen />);
    expect(screen.getByRole("heading", { name: /ผู้ช่วยอัจฉริยะ/ })).toBeInTheDocument();
  });

  it("opens with the seeded exchange and a SIMULATED marker", () => {
    render(<AiAssistantScreen />);
    expect(screen.getByTestId("chat-user")).toBeInTheDocument();
    expect(screen.getAllByTestId("chat-assistant").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByLabelText(SIMULATED_ARIA_LABEL).length).toBeGreaterThanOrEqual(1);
  });

  it("asks a suggested question and appends a user turn + a new answer", () => {
    render(<AiAssistantScreen />);
    const beforeAssistants = screen.getAllByTestId("chat-assistant").length;
    fireEvent.click(screen.getByRole("button", { name: "ต้นทุนพลังงานเดือนนี้" }));
    // The clicked question shows as a user turn (in the conversation, distinct from the sidebar chip),
    // and a new assistant answer is appended.
    const convo = screen.getByTestId("conversation");
    expect(within(convo).getByText("ต้นทุนพลังงานเดือนนี้")).toBeInTheDocument();
    expect(screen.getAllByTestId("chat-assistant").length).toBe(beforeAssistants + 1);
    expect(screen.getByText(/ต้นทุนพลังงานรวมทั้งประเทศ/)).toBeInTheDocument();
  });

  it("answers a typed question through the composer", () => {
    render(<AiAssistantScreen />);
    fireEvent.change(screen.getByLabelText("สอบถามข้อมูลเชิงลึก"), { target: { value: "NRW เขตไหนสูงสุด" } });
    fireEvent.submit(screen.getByLabelText("สอบถามข้อมูลเชิงลึก").closest("form")!);
    const users = screen.getAllByTestId("chat-user");
    expect(users[users.length - 1]).toHaveTextContent("NRW เขตไหนสูงสุด");
    // The composer clears after sending.
    expect(screen.getByLabelText("สอบถามข้อมูลเชิงลึก")).toHaveValue("");
  });

  it("falls back honestly for an unrecognised question", () => {
    render(<AiAssistantScreen />);
    fireEvent.change(screen.getByLabelText("สอบถามข้อมูลเชิงลึก"), { target: { value: "สวัสดีครับ" } });
    fireEvent.submit(screen.getByLabelText("สอบถามข้อมูลเชิงลึก").closest("form")!);
    expect(screen.getByText(/ยังไม่ได้เชื่อมต่อกับ LLM จริง/)).toBeInTheDocument();
  });

  it("does not send an empty question", () => {
    render(<AiAssistantScreen />);
    const before = screen.getAllByTestId("chat-user").length;
    fireEvent.submit(screen.getByLabelText("สอบถามข้อมูลเชิงลึก").closest("form")!);
    expect(screen.getAllByTestId("chat-user").length).toBe(before);
  });

  it("states in the footer that the answers are scripted, not a real LLM", () => {
    render(<AiAssistantScreen />);
    expect(screen.getByText(/ไม่ใช่ผลจาก LLM/)).toBeInTheDocument();
  });
});
