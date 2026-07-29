import { NavLink } from "react-router-dom";

import type { NavItem, NavSection } from "@/routes/nav";
import { NAV_ITEMS, NAV_SECTIONS } from "@/routes/nav";
import { cn } from "@/lib/utils";

export interface SidebarProps {
  readonly items?: readonly NavItem[];
  readonly sections?: readonly NavSection[];
  readonly className?: string;
}

/**
 * Brand block + grouped navigation, rendered from the registry (never a second copy).
 *
 * Requirements the tests enforce:
 *  - a `<nav>` (role `navigation`) containing one `<a>` per registry item, grouped under
 *    its section's Thai heading;
 *  - the active link carries `aria-current="page"` and NOTHING ELSE does — exactly one in
 *    the whole tree. React Router's `NavLink` with `end` handles this; a naive prefix
 *    match makes "/" active on every route, which is the classic bug here;
 *  - the active link additionally renders a dedicated marker element carrying
 *    `data-current-marker`, so "current" is conveyed by more than colour. A class name is
 *    not sufficient evidence — it can be colour-only — so the marker must be a real node.
 *  - each link renders its registry `icon` and its Thai label.
 */
export function Sidebar({
  items = NAV_ITEMS,
  sections = NAV_SECTIONS,
  className,
}: SidebarProps): JSX.Element {
  const grouped = new Map<string, NavItem[]>();
  for (const item of items) {
    const list = grouped.get(item.section) ?? [];
    list.push(item);
    grouped.set(item.section, list);
  }

  return (
    <nav className={cn("flex flex-col gap-6", className)}>
      {sections.map((section) => {
        const sectionItems = grouped.get(section.id);
        if (!sectionItems || sectionItems.length === 0) return null;
        return (
          <div key={section.id}>
            <h3 className="mb-2 px-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
              {section.labelTh}
            </h3>
            <ul className="flex flex-col gap-0.5">
              {sectionItems.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <NavLink
                      to={item.path}
                      end
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors duration-[var(--anim-fast)] ease-standard",
                          isActive
                            ? "bg-surface-container text-on-surface"
                            : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface",
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                          <span>{item.labelTh}</span>
                          {isActive && (
                            <span data-current-marker className="ms-auto block h-5 w-1 rounded-full bg-primary" />
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
