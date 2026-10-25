"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SBFP_DISTRICTS, type SbfpChecklistItem } from "@/lib/constants/sbfp";
import type { DistrictSchools } from "@/lib/pdf/generateSbfpForms";
import type { SbfpKitchen, SbfpProgram } from "@/lib/sbfp/queries";
import {
  schoolsByDistrict,
  type SbfpSchoolOption,
  type YesNoAnswers,
} from "@/lib/utils/sbfp";
import { useMemo } from "react";

/** Everything the four monitoring panels share. */
export interface MonitoringPanelProps {
  schoolId: string;
  schoolYear: string;
  program: SbfpProgram;
  canManage: boolean;
  /** A manager or a teacher of the school (migration 220 reuses 212's rule). */
  canLog: boolean;
  actorId: string | null;
  kitchens: SbfpKitchen[];
  schools: SbfpSchoolOption[];
}

export const canEditEntry = (
  p: Pick<MonitoringPanelProps, "canManage" | "canLog" | "actorId">,
  createdBy: string | null,
) => p.canManage || (p.canLog && p.actorId != null && createdBy === p.actorId);

/** Kitchen picker value for "At school site" (a NULL kitchen). */
export const AT_SCHOOL_SITE = "site";
export const AT_SCHOOL_SITE_LABEL = "At school site";

export function kitchenName(kitchens: SbfpKitchen[], id: string | null): string {
  if (id === null) return AT_SCHOOL_SITE_LABEL;
  return kitchens.find((k) => k.id === id)?.school_name ?? "";
}

export function KitchenSelect({
  kitchens,
  value,
  onChange,
}: {
  kitchens: SbfpKitchen[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  // A retired kitchen still shows on an entry that names it.
  const shown = kitchens.filter((k) => k.is_active || k.id === value);
  return (
    <div className="space-y-1.5">
      <Label>Assigned kitchen</Label>
      <Select
        value={value ?? AT_SCHOOL_SITE}
        onValueChange={(v) => onChange(v === AT_SCHOOL_SITE ? null : v)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {shown.map((k) => (
            <SelectItem key={k.id} value={k.id}>
              Centralized Kitchen — {k.school_name}
            </SelectItem>
          ))}
          <SelectItem value={AT_SCHOOL_SITE}>{AT_SCHOOL_SITE_LABEL}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

/** Ticked school ids → the district columns a printout shows. */
export function districtSchools(
  schools: SbfpSchoolOption[],
  ids: readonly string[],
): DistrictSchools[] {
  const picked = new Set(ids);
  return schoolsByDistrict(
    schools.filter((s) => picked.has(s.id)),
    SBFP_DISTRICTS,
  ).map((g) => ({ district: g.district, names: g.schools.map((s) => s.name) }));
}

/**
 * The division's schools in district columns, each with a checkbox. The count
 * beside the caption is the number ticked — the tool's "number of schools".
 */
export function SchoolDistrictPicker({
  label,
  schools,
  value,
  onChange,
  disabled,
}: {
  label: string;
  schools: SbfpSchoolOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const groups = useMemo(() => schoolsByDistrict(schools, SBFP_DISTRICTS), [schools]);
  const picked = new Set(value);
  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...value, id] : value.filter((v) => v !== id));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Label>{label}</Label>
        <Badge variant="secondary" className="tabular-nums">
          {value.length} school{value.length === 1 ? "" : "s"}
        </Badge>
        {value.length > 0 && !disabled && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
            Clear
          </Button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {groups.map((g) => {
          const ticked = g.schools.filter((s) => picked.has(s.id)).length;
          return (
            <div key={g.district ?? "other"} className="rounded-md border">
              <div className="flex items-center justify-between border-b px-2 py-1.5 text-xs font-semibold uppercase">
                <span>{g.district ?? "Other"}</span>
                <span className="tabular-nums text-muted-foreground">{ticked}</span>
              </div>
              <div className="max-h-56 overflow-y-auto p-2 space-y-1">
                {g.schools.map((s) => (
                  <label key={s.id} className="flex items-start gap-2 text-xs leading-tight">
                    <Checkbox
                      className="mt-0.5"
                      checked={picked.has(s.id)}
                      disabled={disabled}
                      onChange={(e) => toggle(s.id, e.target.checked)}
                    />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "Select Yes if the following indicators are observed, otherwise select No." */
export function YesNoChecklist({
  group,
  items,
  value,
  onChange,
  renderExtra,
}: {
  /** Keeps radio names unique when two checklists share an item code. */
  group: string;
  items: SbfpChecklistItem[];
  value: YesNoAnswers;
  onChange: (next: YesNoAnswers) => void;
  renderExtra?: (item: SbfpChecklistItem) => React.ReactNode;
}) {
  const set = (code: string, v: boolean) => onChange({ ...value, [code]: v });
  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="text-left font-medium px-3 py-1.5">Indicator</th>
            <th className="w-16 font-medium">Yes</th>
            <th className="w-16 font-medium">No</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.code} className="border-b last:border-0 align-top">
              <td className="px-3 py-1.5">
                {it.label}
                {renderExtra?.(it)}
              </td>
              {[true, false].map((v) => (
                <td key={String(v)} className="text-center py-1.5">
                  <input
                    type="radio"
                    className="h-4 w-4"
                    name={`yn-${group}-${it.code}`}
                    aria-label={`${it.label}: ${v ? "Yes" : "No"}`}
                    checked={value[it.code] === v}
                    onChange={() => set(it.code, v)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A None / Yes dropdown over a nullable boolean. */
export function NoneYesSelect({
  label,
  value,
  onChange,
  noLabel = "None",
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  noLabel?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={value === null ? "" : value ? "yes" : "no"}
        onValueChange={(v) => onChange(v === "yes")}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="no">{noLabel}</SelectItem>
          <SelectItem value="yes">Yes</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/** A timestamptz → the value a datetime-local input shows, in local time. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const nowLocalInput = () => toLocalInput(new Date().toISOString());

export function fromLocalInput(v: string): string {
  return new Date(v).toISOString();
}

/** The local calendar day of a timestamptz, "YYYY-MM-DD". */
export const localDay = (iso: string) => toLocalInput(iso).slice(0, 10);

/** "HH:MM" or "HH:MM:SS" from a time input → what the TIME column stores. */
export const toTimeValue = (v: string) => (v ? (v.length === 5 ? `${v}:00` : v) : null);

export const ALL_MONTHS = "__all__";

const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return MONTH_FMT.format(new Date(y, m - 1, 1));
};

export function MonthFilter({
  months,
  value,
  onChange,
}: {
  months: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_MONTHS}>All months</SelectItem>
        {months.map((m) => (
          <SelectItem key={m} value={m}>
            {monthLabel(m)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The month a day falls in, or the current one if it is in the school year. */
export function defaultMonth(months: string[], today: string): string {
  const ym = today.slice(0, 7);
  return months.includes(ym) ? ym : ALL_MONTHS;
}
