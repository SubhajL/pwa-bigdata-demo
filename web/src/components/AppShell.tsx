import { useEffect } from "react";
import { Outlet } from "react-router-dom";

import { APP_CONFIG } from "@/config/app.config";
import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

/**
 * The chrome every screen renders inside: sidebar, header, content outlet, footer.
 *
 * MUST render four landmarks, because `a11y.test.tsx` and `AppShell.test.tsx` assert them
 * and screen-reader navigation depends on them:
 *   - `banner`      — the header (`<header>`), carrying the brand and the export action
 *   - `navigation`  — the sidebar nav (`<nav>`), inside an `<aside>`
 *   - `main`        — wraps react-router's `<Outlet/>` (`<main>`)
 *   - `contentinfo` — the footer (`<footer>`)
 *
 * Compose it from `<Sidebar/>` (@/components/Sidebar) and `<Outlet/>` (react-router-dom).
 *
 * The footer carries the static Stitch links — Data Security Policy · System Status ·
 * Contact Support. "System Status" is a LINK, not a live status chip: a chip implies a
 * reading, and no status source is wired in this PR. Inventing one would be a hardcoded
 * telemetry value, which CLAUDE.md forbids. PR-8 owns the live pipeline status.
 */
export function AppShell(): JSX.Element {
  useEffect(() => {
    document.title = `${APP_CONFIG.brand} · ระบบวิเคราะห์ข้อมูลขนาดใหญ่`;
    if (!document.documentElement.lang) {
      document.documentElement.lang = "th";
    }
  }, []);

  return (
    <div className="flex h-screen bg-surface">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-outline-variant bg-surface-container-lowest">
        <div className="flex items-center gap-2 px-4 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-control bg-primary text-on-primary font-bold text-sm">
            P
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-on-surface">{APP_CONFIG.brand}</span>
            <span className="text-xs text-on-surface-variant">{APP_CONFIG.brandSub}</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <Sidebar />
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-6">
          <div className="flex items-center gap-3" />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" aria-hidden="true" />
              ส่งออกรายงาน
            </Button>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>

        {/* Footer */}
        <footer className="flex h-10 shrink-0 items-center justify-center gap-6 border-t border-outline-variant bg-surface-container-lowest px-6 text-xs text-on-surface-variant">
          <a href="/data-security" className="hover:text-on-surface transition-colors duration-[var(--anim-fast)] ease-standard">
            นโยบายความปลอดภัยข้อมูล
          </a>
          <a
            href="/system-status"
            className="hover:text-on-surface transition-colors duration-[var(--anim-fast)] ease-standard"
            aria-label="System Status"
          >
            สถานะระบบ
          </a>
          <a href="/contact" className="hover:text-on-surface transition-colors duration-[var(--anim-fast)] ease-standard">
            ติดต่อฝ่ายสนับสนุน
          </a>
        </footer>
      </div>
    </div>
  );
}
