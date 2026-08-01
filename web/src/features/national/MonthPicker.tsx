import { formatMonthTh } from "@/lib/format";

export interface MonthPickerProps {
  readonly months: readonly string[];
  readonly value: string;
  readonly onChange: (month: string) => void;
}

/**
 * The global month selector (Stitch S1 top bar). Options are the REAL months, labelled in the
 * Buddhist era (formatMonthTh). Selecting a month is what drives the sticky `?month=` URL state
 * (INTERACTIONS.md) — the screen owns that; this control just reports the choice.
 */
export function MonthPicker({ months, value, onChange }: MonthPickerProps): JSX.Element {
  return (
    <label className="flex items-center gap-2 text-dense text-on-surface-variant">
      <span>เดือน</span>
      <select
        aria-label="เลือกเดือน"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-outline-variant bg-surface px-3 py-1 text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {months.map((month) => (
          <option key={month} value={month}>
            {formatMonthTh(month)}
          </option>
        ))}
      </select>
    </label>
  );
}
