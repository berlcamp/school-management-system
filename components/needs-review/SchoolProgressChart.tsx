"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/needs-review/StatusPill";
import {
  MODULE_GUIDES,
  MODULE_KEYS,
  averageProgress,
  formatProgress,
  moduleResult,
  schoolProgress,
  sortSchoolProgress,
  type NeedsReviewSchool,
  type ProgressSort,
  type SchoolProgress,
} from "@/lib/utils/needsReview";
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

const ROWS_SHOWN = 15;

/**
 * Ranked bars comparing the schools the page's filters leave in view. Division
 * page only. Each row opens the modules behind its figure.
 */
export function SchoolProgressChart({ schools }: { schools: readonly NeedsReviewSchool[] }) {
  const [sort, setSort] = useState<ProgressSort>("lowest");
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => schools.map(schoolProgress), [schools]);
  const sorted = useMemo(() => sortSchoolProgress(rows, sort), [rows, sort]);
  const average = useMemo(() => averageProgress(rows), [rows]);
  const visible = showAll ? sorted : sorted.slice(0, ROWS_SHOWN);

  return (
    <section aria-labelledby="nr-progress-title" className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="nr-progress-title" className="text-sm font-semibold">
            Progress by school
          </h2>
          <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">
            Each figure is the average progress of the modules that apply to the school, all weighted
            equally. Select a school to see its modules.
          </p>
        </div>
        <div className="flex items-end gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden="true" className="h-3 w-0.5 rounded-full bg-foreground" />
              Average
            </p>
            <p className="text-lg font-semibold leading-7 tabular-nums">{formatProgress(average)}</p>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="nr-progress-sort" className="text-xs text-muted-foreground">
              Sort
            </Label>
            <Select value={sort} onValueChange={(v) => setSort(v as ProgressSort)}>
              <SelectTrigger id="nr-progress-sort" className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lowest">Lowest first</SelectItem>
                <SelectItem value="highest">Highest first</SelectItem>
                <SelectItem value="name">School name</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <ul className="mt-3">
        {visible.map((row) => (
          <ProgressRow
            key={row.school.school_id}
            row={row}
            average={average}
            open={openId === row.school.school_id}
            onToggle={() =>
              setOpenId((current) => (current === row.school.school_id ? null : row.school.school_id))
            }
          />
        ))}
      </ul>

      {sorted.length > ROWS_SHOWN && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${sorted.length} schools`}
        </Button>
      )}
    </section>
  );
}

function ProgressRow({
  row,
  average,
  open,
  onToggle,
}: {
  row: SchoolProgress;
  average: number;
  open: boolean;
  onToggle: () => void;
}) {
  const { school, percent, completeModules, applicableModules } = row;
  const panelId = `nr-progress-${school.school_id}`;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_auto]"
      >
        <span className="text-sm font-medium">{school.school_name}</span>
        <span className="col-span-2 row-start-2 block md:col-span-1 md:col-start-2 md:row-start-1" aria-hidden="true">
          <span className="relative block h-3.5 rounded-r bg-muted">
            <span
              className="absolute inset-y-0 left-0 rounded-r bg-sky-600 dark:bg-sky-400"
              style={{ width: `${percent}%` }}
            />
            <span
              className="absolute -inset-y-1 w-0.5 -translate-x-1/2 bg-foreground"
              style={{ left: `${average}%` }}
            />
          </span>
        </span>
        <span className="flex items-center justify-end gap-2 whitespace-nowrap">
          <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
            {completeModules} of {applicableModules} modules complete
          </span>
          <span className="w-10 text-right text-sm font-semibold tabular-nums">{formatProgress(percent)}</span>
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open && (
        <ul id={panelId} className="mb-2 ml-2 mt-1 divide-y rounded-lg border">
          {MODULE_KEYS.map((key) => {
            const result = moduleResult(school, key);
            return (
              <li key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <StatusPill status={result.status} />
                <span className="min-w-0 flex-1 font-medium">{MODULE_GUIDES[key].title}</span>
                <span className="w-full text-xs tabular-nums text-muted-foreground sm:w-auto">
                  {result.detail}
                  {result.progress !== null && ` · ${formatProgress(result.progress)}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
