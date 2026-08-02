/**
 * Theme override — the small amount of logic behind the header light/dark toggle.
 *
 * The app follows the OS by default: globals.css declares `:root { color-scheme: light dark }`
 * and every colour is a `light-dark(<light>, <dark>)` token, so the UA picks the branch.
 * A user can PIN a scheme instead. The mechanism is deliberately NOT a second set of token
 * definitions (that would violate the one-definition-site rule tokens.test.ts T1 enforces):
 * we stamp `data-theme` on <html>, and globals.css maps `:root[data-theme="…"]` to a fixed
 * `color-scheme`, which re-resolves every existing `light-dark()` to that branch.
 *
 * The storage key is duplicated by the pre-hydration script in index.html (which cannot
 * import this module); keep the two in sync.
 */
export const THEME_STORAGE_KEY = "pwa-theme";

export type Theme = "light" | "dark";

/** The persisted explicit choice, or `null` when the user follows the OS. */
export function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    // Storage can throw in private mode or when disabled; treat as "follow the OS".
    return null;
  }
}

/** Persist an explicit choice. A failure is non-fatal — the session still honours it. */
export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* no-op: applyTheme still pins the scheme for this page load */
  }
}

/** What the OS currently prefers. */
export function osPrefersDark(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
}

/** The scheme actually in effect: an explicit choice if stored, else the OS preference. */
export function resolveTheme(): Theme {
  return readStoredTheme() ?? (osPrefersDark() ? "dark" : "light");
}

/**
 * Pin a scheme by stamping `data-theme` on <html>. globals.css turns that into a fixed
 * `color-scheme`, flipping every `light-dark()` token — no token is redefined.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
}
