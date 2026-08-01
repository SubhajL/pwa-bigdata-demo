import { REGIONAL_CONFIG } from "./regional.config";

export interface RegionSelectProps {
  readonly region: number;
  readonly onChange: (region: number) => void;
}

const REGIONS: readonly number[] = Array.from(
  { length: REGIONAL_CONFIG.maxRegion - REGIONAL_CONFIG.minRegion + 1 },
  (_, i) => REGIONAL_CONFIG.minRegion + i,
);

/**
 * The เขต 1–10 selector shared by the drill screens (Regional header, Branch picker). A drill screen
 * reached straight from the sidebar has no selection; this lets the user pick one inline instead of
 * dead-ending on a prompt. Styled to match `MonthPicker`.
 */
export function RegionSelect({ region, onChange }: RegionSelectProps): JSX.Element {
  return (
    <label className="flex items-center gap-2 text-dense text-on-surface-variant">
      <span>เขต</span>
      <select
        aria-label="เลือกเขต"
        value={region}
        onChange={(event) => onChange(Number(event.target.value))}
        className="rounded-md border border-outline-variant bg-surface px-3 py-1 text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {REGIONS.map((r) => (
          <option key={r} value={r}>
            เขต {r}
          </option>
        ))}
      </select>
    </label>
  );
}
