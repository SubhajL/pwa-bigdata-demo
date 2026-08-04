import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { WifiOff } from "lucide-react";

import { SimulatedBadge } from "@/components/SimulatedBadge";
import { StatusChip, type StatusKind } from "@/components/StatusChip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { DemoScenarioPanel } from "@/features/twin/DemoScenarioPanel";
import { ImpactPanel } from "@/features/twin/ImpactPanel";
import { ProcessSchematic } from "@/features/twin/ProcessSchematic";
import { SecTooltip } from "@/features/twin/SecTooltip";
import { StatusCounters } from "@/features/twin/StatusCounters";
import { TWIN_CONFIG } from "@/features/twin/twin.config";
import { useTwinSocket } from "@/features/twin/useTwinSocket";
import {
  deriveStatus,
  fetchBands,
  fetchImpact,
  fetchSec,
  fetchTopology,
  isPressureDrop,
  outgoingPipes,
} from "@/features/twin/twinClient";
import type {
  BandsResponse,
  DeviceLiveState,
  ImpactResponse,
  SecResponse,
  TwinEventFrame,
  TwinTopology,
} from "@/features/twin/types";

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
        const seen = new Map<string, ImpactResponse["customers"][number]>();
        const affected = new Set<string>();
        for (const r of results) {
          for (const id of r.affected_pipe_ids) affected.add(id);
          for (const c of r.customers) seen.set(c.customer_id, c);
        }
        const customers = [...seen.values()].sort((a, b) => a.customer_id.localeCompare(b.customer_id));
        setImpact({
          pipe_id: pipeIds[0],
          affected_pipe_ids: [...affected],
          customers,
          count: customers.length,
          simulated: true,
        });
        setImpactAsset(droppedAsset);
      } catch {
        if (token === impactReq.current) setImpactAsset(null);
      }
    })();
  }, [droppedAsset, topology]);

  // SEC for the selected device; a newer selection supersedes the previous. Again, setState
  // only in the async callback; loading is derived from whether `sec` is for `selected`.
  const secReq = useRef(0);
  useEffect(() => {
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
  }, [selected]);

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
          <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
            <ProcessSchematic
              topology={topology}
              statusOf={statusOf}
              affectedPipeIds={affectedPipeIds}
              selected={selected}
              onSelect={setSelected}
            />
            <div className="flex flex-col gap-4">
              {selected != null && <SecTooltip assetId={selected} sec={displayedSec} loading={secLoading} />}
              <ImpactPanel impact={activeImpact} loading={impactLoading} />
              {/* Renders ONLY when the API reports DEMO_CONTROLS on (self-hiding). */}
              <DemoScenarioPanel />
            </div>
          </div>
          <footer className="mt-2 flex items-center gap-2 text-dense text-on-surface-variant">
            <SimulatedBadge /> ค่าการวัดทั้งหมดเป็นข้อมูลจำลอง; ที่ตั้งสาขาเป็นข้อมูลจริงของ กปภ.
          </footer>
        </div>
      )}
    </div>
  );
}
