/**
 * The navigation registry — the single source of truth for BOTH the sidebar and the
 * router (DREP-PR6 R6).
 *
 * Two consumers, one list: `Sidebar` renders it and `buildRoutes()` maps it to routes.
 * That is deliberate. A hand-maintained second copy in the router is how a nav link ends
 * up pointing at a route nobody registered, and `router.test.tsx` asserts the two cannot
 * diverge.
 *
 * WHY THIS LIST IS AUTHORED RATHER THAN TRANSCRIBED FROM STITCH
 * -------------------------------------------------------------
 * There is no single mockup nav to copy. The Stitch screens disagree with each other:
 * S6 is the only screen listing "Report Center", S7 the only one listing "Alert Center",
 * S9 carries an entirely different Thai nav, and NOT ONE of the ten lists Operations,
 * Pipeline or Predictive — the three demo-critical screens. Every screen was generated in
 * isolation, so each shows the nav that screen happened to need.
 *
 * The union is therefore the only coherent shell. Recorded in DREP §9-R6 as a deliberate
 * divergence from the mockups, not an oversight.
 */
import {
  Bell,
  Bot,
  Building2,
  CircleCheck,
  FileText,
  Factory,
  LayoutDashboard,
  Map,
  Settings,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

/** Which Stitch mockup a route is built from, so a screen PR can find its reference. */
export type ScreenKey = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8" | "S9" | "S10";

export type NavSectionId = "overview" | "operations" | "system";

export interface NavItem {
  /** Stable id; also the test key. */
  readonly id: string;
  /** Route path. Must be unique across the registry. */
  readonly path: string;
  /** Thai label — what the sidebar renders. */
  readonly labelTh: string;
  /** Latin label, for the document title and the `aria-label` of the link. */
  readonly labelEn: string;
  readonly icon: LucideIcon;
  readonly section: NavSectionId;
  readonly screen: ScreenKey;
  /**
   * `false` until the PR that builds the screen lands. A `false` entry routes to
   * `PlaceholderScreen`, which states plainly that the screen is not built yet rather
   * than rendering an empty shell that reads like a data failure.
   */
  readonly built: boolean;
  /** The PR that owns building this screen — shown on the placeholder. */
  readonly ownedBy: string;
}

export interface NavSection {
  readonly id: NavSectionId;
  readonly labelTh: string;
}

export const NAV_SECTIONS: readonly NavSection[] = [
  { id: "overview", labelTh: "ภาพรวม" },
  { id: "operations", labelTh: "การดำเนินงาน" },
  { id: "system", labelTh: "ระบบ" },
] as const;

export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: "national",
    path: "/national",
    labelTh: "ภาพรวมประเทศ",
    labelEn: "National Overview",
    icon: LayoutDashboard,
    section: "overview",
    screen: "S1",
    built: true,
    ownedBy: "PR-10",
  },
  {
    id: "regional",
    path: "/regions",
    labelTh: "ระดับเขต",
    labelEn: "Regional",
    icon: Map,
    section: "overview",
    screen: "S2",
    built: false,
    ownedBy: "PR-11",
  },
  {
    id: "branch",
    path: "/branches",
    labelTh: "ระดับสาขา",
    labelEn: "Branch",
    icon: Building2,
    section: "overview",
    screen: "S3",
    built: false,
    ownedBy: "PR-12",
  },
  {
    id: "operations",
    path: "/operations",
    labelTh: "ศูนย์ควบคุม SCADA",
    labelEn: "Operations / SCADA Twin",
    icon: Factory,
    section: "operations",
    screen: "S4",
    built: true,
    ownedBy: "PR-7",
  },
  {
    id: "pipeline",
    path: "/pipeline",
    labelTh: "คุณภาพข้อมูล",
    labelEn: "Pipeline & Quality",
    icon: CircleCheck,
    section: "operations",
    screen: "S8",
    built: true,
    ownedBy: "PR-8",
  },
  {
    id: "predictive",
    path: "/predictive",
    labelTh: "การพยากรณ์",
    labelEn: "Predictive Analytics",
    icon: TrendingUp,
    section: "operations",
    screen: "S10",
    built: true,
    ownedBy: "PR-9",
  },
  {
    id: "admin",
    path: "/admin",
    labelTh: "ผู้ดูแลระบบ",
    labelEn: "System Admin",
    icon: Settings,
    section: "system",
    screen: "S5",
    built: false,
    ownedBy: "PR-13",
  },
  {
    id: "reports",
    path: "/reports",
    labelTh: "ศูนย์รายงาน",
    labelEn: "Report Center",
    icon: FileText,
    section: "system",
    screen: "S6",
    built: false,
    ownedBy: "PR-14",
  },
  {
    id: "alerts",
    path: "/alerts",
    labelTh: "ศูนย์แจ้งเตือน",
    labelEn: "Alert Center",
    icon: Bell,
    section: "system",
    screen: "S7",
    built: false,
    ownedBy: "PR-15",
  },
  {
    id: "assistant",
    path: "/assistant",
    labelTh: "ผู้ช่วยอัจฉริยะ",
    labelEn: "AI Assistant",
    icon: Bot,
    section: "system",
    screen: "S9",
    built: false,
    ownedBy: "PR-16",
  },
] as const;

/** Lookup by path, used by the router to hand each route its own registry entry. */
export function navItemByPath(path: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.path === path);
}
