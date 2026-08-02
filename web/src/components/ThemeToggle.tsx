import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  type Theme,
  applyTheme,
  osPrefersDark,
  readStoredTheme,
  resolveTheme,
  storeTheme,
} from "@/lib/theme";

/**
 * Header control that lets a user override the OS colour scheme.
 *
 * By default the app follows the OS (globals.css). This pins the opposite scheme on
 * click — stamping <html> and persisting the choice — so an on-prem operator can force
 * light for a projector or dark for a control room regardless of the machine's setting.
 * With NOTHING stored the OS still wins (no `data-theme` is stamped), and the icon tracks
 * live OS changes. The pre-hydration script in index.html applies a stored choice before
 * first paint, so an override never flashes the OS scheme.
 *
 * Sticky by design: once toggled, the choice persists. Showing the sun means "currently
 * dark — switch to light"; the moon means the reverse.
 */
export function ThemeToggle(): JSX.Element {
  const [theme, setTheme] = useState<Theme>(() => resolveTheme());

  useEffect(() => {
    // Re-affirm a stored choice after mount (idempotent with the index.html script), so a
    // stamp is present even if that inline script was blocked. The initial useState above
    // already resolved the icon, so no setState is needed here.
    const stored = readStoredTheme();
    if (stored) applyTheme(stored);

    // While following the OS (no explicit choice), keep the icon honest if the OS scheme
    // changes under us. No stamping here — the CSS default already follows the OS.
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const onChange = (): void => {
      if (!readStoredTheme()) setTheme(osPrefersDark() ? "dark" : "light");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function toggle(): void {
    const next: Theme = theme === "dark" ? "light" : "dark";
    storeTheme(next);
    applyTheme(next);
    setTheme(next);
  }

  const isDark = theme === "dark";
  const label = isDark ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด";

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={label} title={label}>
      {isDark ? (
        <Sun className="h-5 w-5" aria-hidden="true" />
      ) : (
        <Moon className="h-5 w-5" aria-hidden="true" />
      )}
    </Button>
  );
}
