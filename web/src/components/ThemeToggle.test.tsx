/**
 * The header light/dark toggle (Phase 2).
 *
 * Default = follow the OS (the jsdom stub reports light), so with nothing stored the
 * document must carry NO `data-theme` — the OS still wins. A click pins the opposite
 * scheme: it stamps <html> and persists the choice. A persisted choice is restored on
 * mount. Only the DOM/storage side effects are asserted; the pixel result is a
 * globals.css concern proven by tokens.test.ts.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { THEME_STORAGE_KEY } from "@/lib/theme";

import { ThemeToggle } from "./ThemeToggle";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("ThemeToggle", () => {
  it("follows the OS by default — pins no scheme until asked", () => {
    render(<ThemeToggle />);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    // Showing light → the control offers to switch TO dark.
    expect(screen.getByRole("button", { name: /โหมดมืด/ })).toBeInTheDocument();
  });

  it("switches to dark on click: stamps <html> and persists the choice", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /โหมดมืด/ }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByRole("button", { name: /โหมดสว่าง/ })).toBeInTheDocument();
  });

  it("restores a persisted dark choice on mount", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeToggle />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: /โหมดสว่าง/ })).toBeInTheDocument();
  });

  it("toggles back to light on a second click", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button")); // → dark
    fireEvent.click(screen.getByRole("button")); // → light
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});
