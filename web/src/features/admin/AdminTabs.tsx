import { cn } from "@/lib/utils";

import type { AdminTab, AdminTabId } from "./admin";

export interface AdminTabsProps {
  readonly tabs: readonly AdminTab[];
  readonly activeId: AdminTabId;
  readonly onSelect: (id: AdminTabId) => void;
}

/**
 * The S5 section tab strip. A real `role="tablist"` (not decorative links): each tab is a
 * button that switches the active panel, so keyboard and screen-reader users get the same
 * navigation the mockup implies. The active tab carries `aria-selected` and an underline —
 * status by more than colour.
 */
export function AdminTabs({ tabs, activeId, onSelect }: AdminTabsProps): JSX.Element {
  return (
    <div role="tablist" aria-label="ส่วนการตั้งค่าผู้ดูแลระบบ" className="flex flex-wrap gap-6 border-b border-outline-variant">
      {tabs.map((tab) => {
        const selected = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`admin-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls="admin-tab-panel"
            onClick={() => onSelect(tab.id)}
            className={cn(
              "-mb-px border-b-2 pb-2 text-sm font-semibold transition-colors duration-[var(--anim-fast)] ease-standard",
              selected
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-primary",
            )}
          >
            {tab.labelTh}
          </button>
        );
      })}
    </div>
  );
}
