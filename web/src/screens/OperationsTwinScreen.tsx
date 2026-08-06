import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { WifiOff } from "lucide-react";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { StatusChip, type StatusKind } from "@/components/StatusChip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AffectedCustomerDrawer } from "@/features/twin/AffectedCustomerDrawer";
import { DemoScenarioPanel } from "@/features/twin/DemoScenarioPanel";
import { EnergyContextCard } from "@/features/twin/EnergyContextCard";
import { availabilityFromError, highlightedPipeIds, selectedPipeFeature } from "@/features/twin/gisAdapter";
import { GisPipeDetails } from "@/features/twin/GisPipeDetails";
import { LazyChunkBoundary } from "@/features/twin/LazyChunkBoundary";
import { ImpactPanel } from "@/features/twin/ImpactPanel";
import { ProcessSchematic } from "@/features/twin/ProcessSchematic";
import { SecTooltip } from "@/features/twin/SecTooltip";
import { StatusCounters } from "@/features/twin/StatusCounters";
import { TwinProvenanceLegend } from "@/features/twin/TwinProvenanceLegend";
import { TwinViewSwitcher } from "@/features/twin/TwinViewSwitcher";
import { TWIN_CONFIG } from "@/features/twin/twin.config";
import { useTwinSocket } from "@/features/twin/useTwinSocket";
import {
  deriveStatus,
  fetchBands,
  fetchCustomerDetail,
  fetchGisManifest,
  fetchGisNetwork,
  fetchImpact,
  fetchImpactZones,
  fetchSec,
  fetchTopology,
  isPressureDrop,
  outgoingPipes,
} from "@/features/twin/twinClient";
import { mergeImpactResults } from "@/features/twin/impactView";
import type {
  BandsResponse,
  DemoCustomerDetail,
  DeviceLiveState,
  GisAvailability,
  GisManifest,
  GisNetwork,
  ImpactResponse,
  ImpactZoneCollection,
  SecResponse,
  TwinEventFrame,
  TwinTopology,
  TwinView,
} from "@/features/twin/types";

// GisNetworkView statically imports MapLibre and its CSS (~387 kB gzip). Lazy-load it so
// the dark default (logical view, PIPE_GIS_ENABLED=0) never pays for that chunk — the
// MapLibre bundle is fetched only when the GIS tab is first opened (PR-R3 finding 7).
const GisNetworkView = lazy(() =>
  import("@/features/twin/GisNetworkView").then((module) => ({
    default: module.GisNetworkView,
  })),
);

const CONNECTION_LABEL: Record<string, string> = {
  connecting: "กำลังเชื่อมต่อ",
  open: "เชื่อมต่อแล้ว",
  reconnecting: "กำลังเชื่อมต่อใหม่",
  closed: "ไม่ได้เชื่อมต่อ",
  disabled: "ปิดการรับข้อมูล",
};

/**
 * Operations / SCADA digital twin (scored items 2.1–2.5).
 *
 * Composes the config file + five twin components. It owns the data the hook does not: topology
 * and bands (fetched on mount and re-fetched on every socket reopen to RESYNC — the backend has
 * no resync protocol), the merge of the persisted-health baseline with live frames, the selected
 * pump's SEC, and the affected-customer impact of the current pressure drop.
 *
 * States (INTERACTIONS.md): loading skeleton · empty · error alert · offline/stale (keep
 * last-known values, dim, badge — never blank). jsdom proves structure/attributes; the live
 * browser render and real zoom are PR-17's Playwright pass.
 */
export function OperationsTwinScreen(): JSX.Element {
  const { connection, byAsset, generation } = useTwinSocket();

  const [topology, setTopology] = useState<TwinTopology | null>(null);
  const [bands, setBands] = useState<BandsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [sec, setSec] = useState<SecResponse | null>(null);
  const [impact, setImpact] = useState<ImpactResponse | null>(null);
  const [impactAsset, setImpactAsset] = useState<string | null>(null);
  const [resyncTick, setResyncTick] = useState(0);

  // The GIS view (PR-H). Loaded lazily on first switch — a dark stack (404) or a broken
  // bundle (503) must cost the logical view nothing, and the distinction is kept:
  // "disabled" is a configuration statement, "unavailable" is a failure statement.
  const [view, setView] = useState<TwinView>("logical");
  const [gisAvailability, setGisAvailability] = useState<GisAvailability>("idle");
  const [gisManifest, setGisManifest] = useState<GisManifest | null>(null);
  const [gisNetwork, setGisNetwork] = useState<GisNetwork | null>(null);
  const [gisPipe, setGisPipe] = useState<number | null>(null);

  // The clickable low-pressure impact experience (PR-J). One shared drawer, opened from the
  // footprint OR a highlighted pipe, in either view. The impact zone GeoJSON is fetched for the
  // GIS canvas layer; the footprint affordance itself needs only `impact.zone`.
  //
  // Recovery clearing is RENDER-DERIVED, not an effect: the drawer is "open" only while
  // `openForAsset` still names the CURRENTLY dropped asset. A recovery makes droppedAsset null, so
  // the drawer closes with no clearing setState (the codebase's derive-don't-store convention).
  // The asset id (not the impact object) is the identity BECAUSE the resync poll re-fetches impact
  // into a fresh object mid-incident — a reference key would spuriously close the open drawer.
  const [openForAsset, setOpenForAsset] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  // The SETTLED detail outcome for one customer: `{id, detail}` (detail null = the fetch failed).
  // Keyed by id so we can distinguish "still loading" from "loaded-but-failed" — a plain
  // `detail | null` conflates them and spins forever on a 404/500 (QCHECK round 4).
  const [detailState, setDetailState] =
    useState<{ readonly id: string; readonly detail: DemoCustomerDetail | null } | null>(null);
  const [detailRetry, setDetailRetry] = useState(0);
  const [impactZone, setImpactZone] = useState<ImpactZoneCollection | null>(null);

  // Topology + bands: on mount, on every socket (re)open (generation bump), and on the resync
  // poll below — the belt to the reconnect braces, so a long-lived session cannot drift.
  useEffect(() => {
    let cancelled = false;
    void (async (): Promise<void> => {
      try {
        const [topo, band] = await Promise.all([fetchTopology(), fetchBands()]);
        if (cancelled) return;
        setTopology(topo);
        setBands(band);
        setLoadError(null);
      } catch {
        if (!cancelled) setLoadError("ไม่สามารถโหลดแผนผังได้");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [generation, resyncTick]);

  // Periodic topology re-sync (the backend has no resync protocol). Bumps a tick the load
  // effect depends on.
  useEffect(() => {
    const id = setInterval(() => setResyncTick((t) => t + 1), TWIN_CONFIG.resyncPollMs);
    return () => clearInterval(id);
  }, []);

  // GIS bundle: fetched on the first switch to the GIS view. The ref latch makes an
  // attempt one-shot (setState only in the async continuation — screen convention;
  // React 18 makes a post-unmount setState a no-op), but a FAILED attempt releases the
  // latch: a transient transport blip during an api restart must not brick the map for
  // the whole session — switching away and back (or the notice's retry button) refetches
  // (QCHECK 2026-08-05). `viewRef` guards the success continuation: if the operator has
  // already returned to the logical view, a late arrival stores the bundle but must NOT
  // snap their selection to the bound pump (late-arrival contract).
  const gisFetchStarted = useRef(false);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    if (view !== "gis" || gisFetchStarted.current || gisAvailability !== "idle") return;
    gisFetchStarted.current = true;
    void (async (): Promise<void> => {
      try {
        const [manifest, network] = await Promise.all([
          fetchGisManifest(),
          fetchGisNetwork("map-ta-phut"),
        ]);
        setGisManifest(manifest);
        setGisNetwork(network);
        setGisAvailability("ready");
        // First load while still on GIS: select the bound pump so SEC (2.3) rides the
        // same binding. Re-entry when the bundle is already loaded is handled in
        // `changeView` below — together they cover EVERY GIS entry (PR-R3 finding 5).
        if (viewRef.current === "gis") {
          setSelected(manifest.demo_binding.scenario_asset_id);
        }
      } catch (error: unknown) {
        gisFetchStarted.current = false;
        setGisAvailability(availabilityFromError(error));
      }
    })();
  }, [view, gisAvailability]);

  const retryGis = useCallback((): void => {
    gisFetchStarted.current = false;
    setGisAvailability("idle");
  }, []);

  // Re-entering the GIS tab is the natural retry gesture after a transient failure.
  // "disabled" stays sticky on purpose: a 404 states configuration intent, and flipping
  // the flag implies an API restart — a fresh page load is the honest path there.
  const changeView = useCallback(
    (next: TwinView): void => {
      // Update the view ref SYNCHRONOUSLY (not only in the passive effect below): a GIS
      // fetch that resolves after the operator has switched back to logical must read the
      // fresh "logical" here, or it could still snap P-2 on a stale "gis" (QCHECK round 1).
      viewRef.current = next;
      if (next === "gis" && gisAvailability === "unavailable") {
        gisFetchStarted.current = false;
        setGisAvailability("idle");
      }
      // Re-entry with the bundle already loaded re-selects the bound pump, so a pump
      // left selected in the logical view can never show its SEC beside the GIS binding
      // (PR-R3 finding 5). The first-load case is handled in the fetch continuation.
      if (next === "gis" && gisManifest != null) {
        setSelected(gisManifest.demo_binding.scenario_asset_id);
      }
      setView(next);
    },
    [gisAvailability, gisManifest],
  );

  // The merged status per device: live frames win; a device with no live `health` frame falls
  // back to its topology (persisted-health) status as the baseline.
  const statusOf = useCallback(
    (assetId: string): StatusKind => {
      const live: DeviceLiveState | undefined = byAsset.get(assetId);
      const baseline = topology?.devices.find((d) => d.asset_id === assetId)?.status ?? "nodata";
      const merged: DeviceLiveState = {
        perSignal: live?.perSignal ?? {},
        health: live?.health ?? { status: baseline, value: null, observed_at: null },
      };
      return deriveStatus(merged);
    },
    [byAsset, topology],
  );

  // The active pressure drop: the device whose current pressure_bar frame is a drop. A recovery
  // (pressure back to normal) or a spike clears it automatically, and a flow frame cannot mask it
  // because it lives in a separate per-signal slot.
  const droppedAsset = useMemo((): string | null => {
    if (topology == null || bands == null) return null;
    // The MOST RECENT active drop wins, by its pressure frame's observed_at — not topology
    // order. So if A stays low and B drops later, B becomes active; and if B then recovers, A
    // (still dropped) is picked. A null timestamp sorts oldest.
    let best: { asset: string; at: string } | null = null;
    for (const device of topology.devices) {
      const ps = byAsset.get(device.asset_id)?.perSignal.pressure_bar;
      if (ps == null) continue;
      const frame: TwinEventFrame = { kind: "status", signal: "pressure_bar", status: ps.status, value: ps.value };
      if (!isPressureDrop(frame, bands)) continue;
      const at = ps.observed_at ?? "";
      if (best == null || at > best.at) best = { asset: device.asset_id, at };
    }
    return best?.asset ?? null;
  }, [topology, bands, byAsset]);

  // Fetch impact for the dropped asset's outgoing pipes; a newer drop/clear supersedes the
  // previous via the request token. setState happens ONLY in the async callback (never
  // synchronously in the effect); the "no drop" reset is render-derived below.
  const impactReq = useRef(0);
  useEffect(() => {
    const token = ++impactReq.current;
    if (droppedAsset == null || topology == null) return;
    const device = topology.devices.find((d) => d.asset_id === droppedAsset);
    // Distinct outgoing pipe_ids — a branching node can list the same id twice, and one impact
    // request per id is enough (customers are merged/deduped below).
    const pipeIds = [...new Set((device ? outgoingPipes(device.node, topology) : []).map((p) => p.pipe_id))];
    if (pipeIds.length === 0) return;
    void (async (): Promise<void> => {
      try {
        const results = await Promise.all(pipeIds.map((id) => fetchImpact(id)));
        if (token !== impactReq.current) return; // a newer drop/clear superseded this
        // Merge/dedupe across the dropped asset's outgoing pipes, preserving enriched provenance
        // order-independently (PR-J R20 — see mergeImpactResults). The footprint renders only when
        // `zone` survives, and the breakdown must be exact regardless of per-pipe result order.
        setImpact(mergeImpactResults(results, pipeIds[0]));
        setImpactAsset(droppedAsset);
      } catch {
        if (token === impactReq.current) setImpactAsset(null);
      }
    })();
  }, [droppedAsset, topology]);

  // SEC for the selected device; a newer selection supersedes the previous. Again, setState
  // only in the async callback; loading is derived from whether `sec` is for `selected`.
  // `selectedStatus` is a dependency ON PURPOSE (PR-C, item 2.3): re-clicking the selected
  // symbol is a React state no-op, so when an induced fault or recovery flips the SELECTED
  // device's rendered status, the card must refetch by itself — the judge watches the
  // symbol change and the derivation follow, on one page.
  const selectedStatus = selected != null ? statusOf(selected) : null;
  const secReq = useRef(0);
  useEffect(() => {
    void selectedStatus;
    const token = ++secReq.current;
    if (selected == null) return;
    void (async (): Promise<void> => {
      try {
        const result = await fetchSec(selected);
        if (token === secReq.current) setSec(result);
      } catch {
        if (token === secReq.current) setSec(null);
      }
    })();
  }, [selected, selectedStatus]);

  // Render-derived: show impact/affected only while a drop is active AND the fetched impact is
  // for that asset (so a cleared or superseded drop shows nothing, with no reset-setState).
  const activeImpact = droppedAsset != null && impactAsset === droppedAsset ? impact : null;
  const impactLoading = droppedAsset != null && impactAsset !== droppedAsset;
  const affectedPipeIds: ReadonlySet<string> = useMemo(
    () => new Set(activeImpact?.affected_pipe_ids ?? []),
    [activeImpact],
  );
  const displayedSec = selected != null && sec?.asset_id === selected ? sec : null;
  const secLoading = selected != null && (sec == null || sec.asset_id !== selected);

  // ── PR-J: clickable low-pressure impact wiring ─────────────────────────────────────────
  // Opening the drawer binds it to the CURRENTLY dropped asset and resets any prior row selection
  // (open to the list, never a stale detail). setState in an event handler — not an effect — so
  // recovery clearing stays render-derived.
  const openImpactDrawer = useCallback((): void => {
    setSelectedCustomerId(null);
    setOpenForAsset(droppedAsset);
  }, [droppedAsset]);
  // Derived detail view-state (like SEC): a settled outcome counts only when its id matches the
  // current selection. `loading` = no settled outcome yet; `error` = settled but failed (detail
  // null) — so a failure shows an explicit retry, never a permanent spinner.
  const detailSettled = detailState?.id === selectedCustomerId ? detailState : null;
  const customerDetail = detailSettled?.detail ?? null;
  const detailLoading = selectedCustomerId != null && detailSettled == null;
  const detailError = detailSettled != null && detailSettled.detail == null;
  const retryDetail = useCallback((): void => {
    setDetailState(null); // back to the loading state
    setDetailRetry((n) => n + 1); // re-trigger the fetch effect for the same id
  }, []);

  // The impact zone GeoJSON for the GIS canvas layer. setState only inside the async, so this is
  // not a synchronous effect setState. The value is gated at the render site by `activeImpact`,
  // so a recovery (or a late arrival after recovery) never leaves a footprint on the map.
  const zoneAvailable = activeImpact?.zone != null;
  useEffect(() => {
    if (!zoneAvailable) return;
    const ac = new AbortController();
    void (async (): Promise<void> => {
      try {
        const zones = await fetchImpactZones(undefined, ac.signal);
        if (!ac.signal.aborted) setImpactZone(zones);
      } catch {
        // The footprint affordance falls back to `impact.zone`; the map layer is simply absent.
      }
    })();
    return () => ac.abort();
  }, [zoneAvailable]);

  // Customer detail: a real AbortController per selection (PR-J R21). A newer selection aborts
  // the in-flight request in cleanup, so its late response is dropped (the aborted-signal guard);
  // detailLoading (derived above) hides the previous customer's card while the new one loads.
  useEffect(() => {
    if (selectedCustomerId == null) return;
    const id = selectedCustomerId;
    const ac = new AbortController();
    void (async (): Promise<void> => {
      try {
        const detail = await fetchCustomerDetail(id, ac.signal);
        if (!ac.signal.aborted) setDetailState({ id, detail }); // settled OK
      } catch {
        if (!ac.signal.aborted) setDetailState({ id, detail: null }); // settled FAILED → error UI
      }
    })();
    return () => ac.abort();
  }, [selectedCustomerId, detailRetry]);

  // Recovery ends the incident (droppedAsset → null). EXPLICITLY clear ALL incident state (both
  // QCHECK tiers; R12/R21/R22) so a later SAME-asset re-drop cannot silently reopen the drawer with
  // a stale customer/zone, and so the stale impact object cannot flash on re-drop. Resetting
  // `selectedCustomerId`/`zoneAvailable` re-runs the detail/zone effects' cleanups, aborting any
  // in-flight request. This null-transition is only observable via an effect and cannot be derived
  // (the resync poll churns the impact object mid-incident); the reset is idempotent and cannot
  // cascade (its guard is false once it has run).
  const clearRecoveredImpact = useCallback((): void => {
    setOpenForAsset(null);
    setSelectedCustomerId(null);
    setDetailState(null);
    setImpactZone(null);
    setImpactAsset(null);
  }, []);
  useEffect(() => {
    // Clear on recovery (droppedAsset → null) AND when the incident MOVES to a different asset
    // while a drawer is open for the old one (openForAsset no longer matches). The latter is
    // unreachable in the current single-asset (P-2-only) demo, but closing it unconditionally
    // keeps the same-asset-reopen defence sound for any future multi-asset scenario. Idempotent
    // and non-cascading: once openForAsset is null, the second clause is false.
    if (droppedAsset == null || (openForAsset != null && openForAsset !== droppedAsset)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset-on-recovery (above)
      clearRecoveredImpact();
    }
  }, [droppedAsset, openForAsset, clearRecoveredImpact]);

  // The bound pipe highlighted while its scenario asset is the active drop. Passed both as the
  // map's highlight filter AND (via the ref inside GisNetworkView) as the set whose LINE click
  // opens the drawer — the device marker stays a details-only affordance.
  const highlightedGis = useMemo(
    () =>
      gisManifest != null ? highlightedPipeIds(gisManifest.demo_binding, droppedAsset) : [],
    [gisManifest, droppedAsset],
  );

  const stale = connection === "reconnecting" || connection === "closed" || connection === "disabled";
  const statuses = useMemo(
    () => (topology?.devices ?? []).map((d) => statusOf(d.asset_id)),
    [topology, statusOf],
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        {/* Heading must contain the nav labelTh ("ศูนย์ควบคุม SCADA") — router.test.tsx T4
            finds every screen by it. */}
        <h1 className="text-headline text-on-surface">ศูนย์ควบคุม SCADA · แผงดิจิทัลเรียลไทม์</h1>
        <div className="flex items-center gap-2" aria-live="polite">
          {stale && <WifiOff className="h-4 w-4 text-status-warning" aria-hidden="true" />}
          <span className="text-dense text-on-surface-variant">{CONNECTION_LABEL[connection]}</span>
        </div>
      </header>

      {loadError != null ? (
        <Alert variant="error">
          <AlertTitle>{loadError}</AlertTitle>
          <AlertDescription>การเชื่อมต่อกับเซิร์ฟเวอร์มีปัญหา · โปรดลองใหม่อีกครั้ง</AlertDescription>
        </Alert>
      ) : topology == null ? (
        <Skeleton className="h-[560px] w-full" />
      ) : topology.devices.length === 0 ? (
        <Alert variant="info">
          <AlertTitle>ไม่มีอุปกรณ์ในแผนผัง</AlertTitle>
          <AlertDescription>ยังไม่มีข้อมูลโทโพโลยีสำหรับเขตนี้</AlertDescription>
        </Alert>
      ) : (
        <div className={stale ? "opacity-60 transition-opacity duration-[var(--anim-medium)]" : ""}>
          {stale && (
            <p className="mb-2 flex items-center gap-2 text-dense text-status-warning">
              <StatusChip kind="warning" /> ข้อมูลไม่เป็นปัจจุบัน · แสดงสถานะล่าสุดที่ทราบ
            </p>
          )}
          <StatusCounters statuses={statuses} simulated={topology.simulated} />
          <div className="mt-4">
            <TwinViewSwitcher view={view} onChange={changeView} />
          </div>
          {view === "logical" ? (
            <div
              role="tabpanel"
              id="twin-panel-logical"
              aria-labelledby="twin-tab-logical"
              className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]"
            >
              <ProcessSchematic
                topology={topology}
                statusOf={statusOf}
                affectedPipeIds={affectedPipeIds}
                selected={selected}
                onSelect={setSelected}
                onOpenImpact={openImpactDrawer}
              />
              <div className="flex flex-col gap-4">
                {selected != null && <SecTooltip assetId={selected} sec={displayedSec} loading={secLoading} />}
                <ImpactPanel impact={activeImpact} loading={impactLoading} onOpenDrawer={openImpactDrawer} />
                {/* Renders ONLY when the API reports DEMO_CONTROLS on (self-hiding). */}
                <DemoScenarioPanel />
              </div>
            </div>
          ) : (
            <div role="tabpanel" id="twin-panel-gis" aria-labelledby="twin-tab-gis">
              <GisViewSection
              availability={gisAvailability}
              onRetry={retryGis}
              manifest={gisManifest}
              network={gisNetwork}
              markerStatus={
                gisManifest != null
                  ? statusOf(gisManifest.demo_binding.scenario_asset_id)
                  : "nodata"
              }
              highlighted={highlightedGis}
              gisPipe={gisPipe}
              onSelectPipe={setGisPipe}
              selected={selected}
              displayedSec={displayedSec}
              secLoading={secLoading}
              activeImpact={activeImpact}
              impactLoading={impactLoading}
              onOpenImpact={openImpactDrawer}
              impactZone={activeImpact != null ? impactZone : null}
              />
            </div>
          )}
          <footer className="mt-2 flex items-center gap-2 text-dense text-on-surface-variant">
            <SimulatedBadge /> ค่าการวัดทั้งหมดเป็นข้อมูลจำลอง; ที่ตั้งสาขาเป็นข้อมูลจริงของ กปภ.
          </footer>
        </div>
      )}
      {/* One shared impact drawer at the screen root — reachable from both views (PR-J). Mounted
          only while its incident is still the active one, so recovery (activeImpact → null) and a
          re-drop (a fresh impact object) both close it with no clearing effect, and each open
          mounts fresh (filter/page reset to defaults). */}
      {activeImpact != null && openForAsset === droppedAsset && (
        <AffectedCustomerDrawer
          impact={activeImpact}
          open={true}
          onClose={() => setOpenForAsset(null)}
          selectedCustomerId={selectedCustomerId}
          detail={customerDetail}
          detailLoading={detailLoading}
          detailError={detailError}
          onRetryDetail={retryDetail}
          onSelectCustomer={setSelectedCustomerId}
        />
      )}
    </div>
  );
}

interface GisViewSectionProps {
  readonly availability: GisAvailability;
  readonly onRetry: () => void;
  readonly manifest: GisManifest | null;
  readonly network: GisNetwork | null;
  readonly markerStatus: StatusKind;
  readonly highlighted: readonly number[];
  readonly gisPipe: number | null;
  readonly onSelectPipe: (pipeId: number | null) => void;
  readonly selected: string | null;
  readonly displayedSec: SecResponse | null;
  readonly secLoading: boolean;
  readonly activeImpact: ImpactResponse | null;
  readonly impactLoading: boolean;
  readonly onOpenImpact: () => void;
  readonly impactZone: ImpactZoneCollection | null;
}

/**
 * The GIS half of the dual view (PR-H). Dark landing is a feature, not a failure: a 404
 * renders an explicit "not enabled" notice, a broken bundle renders an explicit
 * unavailable state — real geometry is never faked and the logical view is one tab
 * away. When the verified bundle is present, the map shares the SAME scenario state
 * (statusOf/droppedAsset/SEC) as the logical schematic.
 */
function GisViewSection({
  availability,
  onRetry,
  manifest,
  network,
  markerStatus,
  highlighted,
  gisPipe,
  onSelectPipe,
  selected,
  displayedSec,
  secLoading,
  activeImpact,
  impactLoading,
  onOpenImpact,
  impactZone,
}: GisViewSectionProps): JSX.Element {
  if (availability === "idle" || availability === "loading") {
    return <Skeleton className="mt-4 h-[560px] w-full" />;
  }
  if (availability === "disabled") {
    // A 404 says only "the flag is off" — the CLIENT cannot know why (permission
    // pending, or simply started without PIPE_GIS_ENABLED=1), so the notice states the
    // configuration fact and points at the activation procedure, asserting nothing more.
    return (
      <div className="mt-4" data-testid="gis-availability">
        <Alert variant="info">
          <AlertTitle>มุมมอง GIS ยังไม่เปิดใช้งาน</AlertTitle>
          <AlertDescription>
            ระบบนี้เริ่มทำงานโดยปิด PIPE_GIS_ENABLED ไว้ · ขั้นตอนการเปิดใช้งานอยู่ใน
            docs/data/pipe-ry-provenance.md · แผนผังกระบวนการยังใช้งานได้ตามปกติ
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  if (availability === "unavailable" || manifest == null || network == null) {
    return (
      <div className="mt-4" data-testid="gis-availability">
        <Alert variant="error">
          <AlertTitle>ชุดข้อมูล GIS ไม่พร้อมใช้งาน</AlertTitle>
          <AlertDescription>
            ชุดข้อมูลไม่ผ่านการตรวจสอบหรือเข้าถึงไม่ได้ · ระบบจะไม่แสดงข้อมูลทดแทน —
            ใช้แผนผังกระบวนการระหว่างแก้ไข
          </AlertDescription>
        </Alert>
        <button
          type="button"
          data-testid="gis-retry"
          onClick={onRetry}
          className="mt-2 rounded-md bg-surface-container px-3 py-1.5 text-dense text-on-surface hover:text-primary"
        >
          ลองเชื่อมต่อใหม่
        </button>
      </div>
    );
  }
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
      <LazyChunkBoundary
        fallback={
          <div className="h-[560px] w-full" data-testid="gis-chunk-failed">
            <Alert variant="error">
              <AlertTitle>ไม่สามารถโหลดโมดูลแผนที่ได้</AlertTitle>
              <AlertDescription>
                โปรดรีเฟรชหน้าเพื่อโหลดใหม่ · ระบบจะไม่แสดงภาพทดแทน — แผนผังกระบวนการยังใช้งานได้
              </AlertDescription>
            </Alert>
          </div>
        }
      >
        <Suspense fallback={<Skeleton className="h-[560px] w-full" />}>
          <GisNetworkView
            manifest={manifest}
            network={network}
            markerStatus={markerStatus}
            highlightedPipeIds={highlighted}
            onSelectPipe={onSelectPipe}
            impactZone={impactZone}
            onOpenImpact={onOpenImpact}
          />
        </Suspense>
      </LazyChunkBoundary>
      <div className="flex flex-col gap-4">
        {selected != null && (
          <SecTooltip assetId={selected} sec={displayedSec} loading={secLoading} />
        )}
        <EnergyContextCard
          sec={displayedSec}
          loading={secLoading}
          reference={manifest.energy_reference}
        />
        <GisPipeDetails
          feature={selectedPipeFeature(network, gisPipe)}
          boundPipeId={manifest.demo_binding.pipe_id}
        />
        <ImpactPanel impact={activeImpact} loading={impactLoading} onOpenDrawer={onOpenImpact} />
        <TwinProvenanceLegend />
        <DemoScenarioPanel />
      </div>
    </div>
  );
}
