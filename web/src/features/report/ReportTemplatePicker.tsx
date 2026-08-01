import { CheckCircle, FileText } from "lucide-react";

import { cn } from "@/lib/utils";

import type { ReportTemplate, ReportTemplateId } from "./report.config";

export interface ReportTemplatePickerProps {
  readonly templates: readonly ReportTemplate[];
  readonly selectedId: ReportTemplateId;
  readonly onSelect: (id: ReportTemplateId) => void;
}

/**
 * The S6 "เลือกรูปแบบรายงาน" picker — a real `role="radiogroup"` of three cards. Selection is
 * genuine local state (drives the preview), so this is not dead chrome: the chosen card carries
 * `aria-checked` and a check icon (status by more than a border colour).
 */
export function ReportTemplatePicker({
  templates,
  selectedId,
  onSelect,
}: ReportTemplatePickerProps): JSX.Element {
  return (
    <div role="radiogroup" aria-label="เลือกรูปแบบรายงาน" className="grid gap-4 sm:grid-cols-3">
      {templates.map((template) => {
        const selected = template.id === selectedId;
        return (
          <button
            key={template.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(template.id)}
            className={cn(
              "flex flex-col gap-1 rounded-card border bg-surface-container-lowest p-4 text-left transition-colors duration-[var(--anim-fast)] ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              selected ? "border-primary" : "border-outline-variant hover:border-primary",
            )}
          >
            <span className="flex items-center justify-between text-on-surface">
              <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
              {selected && <CheckCircle className="h-5 w-5 text-primary" aria-hidden="true" />}
            </span>
            <span className="text-sm font-semibold text-on-surface">{template.titleTh}</span>
            <span className="text-xs text-on-surface-variant">{template.descTh}</span>
          </button>
        );
      })}
    </div>
  );
}
