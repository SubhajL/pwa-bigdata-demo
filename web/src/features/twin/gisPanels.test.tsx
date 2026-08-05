/**
 * PR-H — the GIS side panels and view switcher (rayong-pipe-gis-sec-plan Phase 3).
 *
 * Provenance is the point of these components: real pipe attributes carry a REAL label,
 * the official energy figure is CONTEXT with exact scope/year/source wording, and the
 * demo binding/marker is visibly simulated. jsdom asserts structure and wording; the
 * live rendering is the topic2-gis Playwright pass.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STATUS_LABEL_TH } from "@/components/StatusChip";

import { EnergyContextCard } from "./EnergyContextCard";
import { GisDeviceMarker } from "./GisDeviceMarker";
import { GisPipeDetails } from "./GisPipeDetails";
import { TwinProvenanceLegend } from "./TwinProvenanceLegend";
import { TwinViewSwitcher } from "./TwinViewSwitcher";
import type { EnergyReference, GisLineFeature, SecResponse } from "./types";

afterEach(cleanup);

const ENERGY_REFERENCE: EnergyReference = {
  value_kwh_per_m3: 0.54,
  unit: "kWh/m³",
  year: 2025,
  scope: "system-wide",
  operator: "East Water",
  source_url:
    "https://www.eastwater.com/en/sustainability/sustainability-overview/environment-dimension/energy-management",
  station_specific: false,
};

const SEC: SecResponse = {
  asset_id: "P-2",
  sec_kwh_per_m3: 0.253,
  power_kw: 30,
  flow_m3h: 118.6,
  power_observed_at: null,
  flow_observed_at: null,
  skew_s: 5,
  simulated: true,
  detail: null,
};

const PIPE: GisLineFeature = {
  type: "Feature",
  properties: {
    pipe_id: 4926,
    pipe_type: "HDPE",
    grade: "PE100",
    size_mm: 315,
    pipe_class: "PN6",
    length_m: 1860,
    year_installed: 2560,
    location: "ถนนสุขุมวิท",
    project_name: "งานย้ายแนวท่อ นิคมอุตสาหกรรมมาบตาพุด",
    asset_code: null,
    pwa_code: "5531021",
  },
  geometry: { type: "LineString", coordinates: [[101.19, 12.71], [101.2, 12.72]] },
};

describe("TwinViewSwitcher", () => {
  it("is an accessible tablist with the logical view selected by default", () => {
    const onChange = vi.fn();
    render(<TwinViewSwitcher view="logical" onChange={onChange} />);
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveAccessibleName(/แผนผังกระบวนการ/);
    expect(tabs[1]).toHaveAccessibleName(/แผนที่ GIS มาบตาพุด/);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
    fireEvent.click(tabs[1]);
    expect(onChange).toHaveBeenCalledWith("gis");
  });
});

describe("GisDeviceMarker", () => {
  it("shows asset, Thai status text (never colour alone), and SIMULATED placement", () => {
    render(<GisDeviceMarker assetId="P-2" status="critical" onClick={() => undefined} />);
    const marker = screen.getByTestId("gis-device-marker");
    expect(marker).toHaveAttribute("data-status", "critical");
    expect(marker).toHaveTextContent("P-2");
    expect(marker).toHaveTextContent(STATUS_LABEL_TH.critical);
    expect(marker).toHaveTextContent(/ตำแหน่งจำลอง/);
  });

  it("propagates activation", () => {
    const onClick = vi.fn();
    render(<GisDeviceMarker assetId="P-2" status="normal" onClick={onClick} />);
    fireEvent.click(screen.getByTestId("gis-device-marker"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("GisPipeDetails", () => {
  it("prompts until a pipe is selected", () => {
    render(<GisPipeDetails feature={null} boundPipeId={4926} />);
    expect(screen.getByTestId("gis-pipe-details")).toHaveTextContent(/คลิกท่อบนแผนที่/);
  });

  it("renders REAL source attributes with dashes for nulls and marks the bound pipe", () => {
    render(<GisPipeDetails feature={PIPE} boundPipeId={4926} />);
    const details = screen.getByTestId("gis-pipe-details");
    expect(details).toHaveAttribute("data-provenance", "REAL");
    expect(details).toHaveTextContent("4926");
    expect(details).toHaveTextContent("HDPE");
    expect(details).toHaveTextContent("315");
    expect(details).toHaveTextContent("PN6");
    expect(details).toHaveTextContent("ถนนสุขุมวิท");
    expect(details).toHaveTextContent("ข้อมูลจริง");
    // asset_code is null in the source — rendered as a dash, never invented.
    expect(within(details).getByTestId("gis-pipe-asset-code")).toHaveTextContent("—");
    // The P-2 attachment is a demo decision, said in Thai next to the real data.
    expect(details).toHaveTextContent(/การจับคู่จำลอง/);
  });

  it("does not claim the binding on an unbound pipe", () => {
    render(<GisPipeDetails feature={PIPE} boundPipeId={999} />);
    expect(screen.getByTestId("gis-pipe-details")).not.toHaveTextContent(/การจับคู่จำลอง/);
  });
});

describe("TwinProvenanceLegend", () => {
  it("defines all three evidence classes, field-level, in Thai", () => {
    render(<TwinProvenanceLegend />);
    const legend = screen.getByTestId("twin-provenance-legend");
    const real = within(legend).getByTestId("evidence-real");
    const official = within(legend).getByTestId("evidence-official");
    const simulated = within(legend).getByTestId("evidence-simulated");
    expect(real).toHaveTextContent(/เส้นท่อ/);
    expect(real).toHaveTextContent(/REAL/);
    expect(official).toHaveTextContent(/East Water/);
    expect(official).toHaveTextContent(/OFFICIAL/);
    expect(simulated).toHaveTextContent(/สถานะอุปกรณ์/);
    expect(simulated).toHaveTextContent(/SIMULATED/);
  });
});

describe("EnergyContextCard", () => {
  it("separates the SIMULATED live SEC from the official system-wide reference", () => {
    render(<EnergyContextCard sec={SEC} loading={false} reference={ENERGY_REFERENCE} />);
    const live = screen.getByTestId("energy-sec-live");
    expect(live).toHaveTextContent("0.253");
    expect(live).toHaveTextContent(/จำลอง/);
    // The violet badge scopes the LIVE value only. A card-level badge would brand the
    // sourced official figure as simulated — the opposite honesty defect.
    expect(within(live).getByText("SIMULATED")).toBeInTheDocument();
    const official = screen.getByTestId("energy-official-reference");
    expect(within(official).queryByText("SIMULATED")).toBeNull();
    expect(official).toHaveTextContent("0.54");
    expect(official).toHaveTextContent("kWh/m³");
    expect(official).toHaveTextContent("East Water");
    expect(official).toHaveTextContent("2025");
    expect(official).toHaveTextContent(/ทั้งระบบ/);
    const link = within(official).getByRole("link");
    expect(link).toHaveAttribute("href", ENERGY_REFERENCE.source_url);
  });

  it("shows the delta as plain arithmetic — no status colour, no target language", () => {
    render(<EnergyContextCard sec={SEC} loading={false} reference={ENERGY_REFERENCE} />);
    const delta = screen.getByTestId("energy-delta");
    expect(delta).toHaveTextContent("-0.287");
    expect(delta.className).not.toMatch(/status-/);
    const card = screen.getByTestId("energy-context-card");
    expect(card).not.toHaveTextContent(/เป้าหมาย|เกณฑ์เตือน|baseline|target/i);
  });

  it("renders a dash and no delta when SEC is not computable", () => {
    render(
      <EnergyContextCard
        sec={{ ...SEC, sec_kwh_per_m3: null, detail: "no flow_m3h reading" }}
        loading={false}
        reference={ENERGY_REFERENCE}
      />,
    );
    expect(screen.getByTestId("energy-sec-live")).toHaveTextContent("—");
    expect(screen.queryByTestId("energy-delta")).toBeNull();
    // The official figure must not fill the gap where the live value should be.
    expect(screen.getByTestId("energy-official-reference")).toHaveTextContent("0.54");
  });
});
