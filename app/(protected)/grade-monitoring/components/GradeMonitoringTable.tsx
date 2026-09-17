"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getGradeLevelLabel,
  getSubjectProgramShortLabel,
} from "@/lib/constants";
import { getGradingPeriods, type GradingPeriodOption } from "@/lib/utils/schoolYear";
import {
  EncodingGridRow,
  PeriodCell,
  STATE_CLASS,
  STATE_LABEL,
  formatLastEncoded,
} from "./gradeEncoding";

interface GradeMonitoringTableProps {
  rows: EncodingGridRow[];
  schoolYear: string; // drives term (3) vs quarter (4) columns
  emptyText?: string;
  /**
   * The columns to render, from `periodColumnsFor()`. Passed in rather than
   * derived here because the school year alone cannot say how wide the grid
   * has to be once a section runs on its own period count (migration 189).
   */
  periodColumns?: GradingPeriodOption[];
  /** True when those columns are numbered because the school mixes counts. */
  periodsWidened?: boolean;
}

function PeriodStatusCell({ cell }: { cell: PeriodCell | undefined }) {
  if (!cell) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`${STATE_CLASS[cell.state]} border tabular-nums font-normal`}
          >
            {cell.state === "no_learners"
              ? "—"
              : `${cell.encoded}/${cell.expected}`}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {STATE_LABEL[cell.state]}
          {cell.state !== "no_learners" &&
            ` — ${cell.encoded} of ${cell.expected} learner${cell.expected === 1 ? "" : "s"} with a grade`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Subject teacher(s) — only those assigned to the subject in Schedules. */
function TeacherCell({ row }: { row: EncodingGridRow }) {
  const assigned = row.assignedTeachers;

  return (
    <div className="space-y-0.5">
      {assigned.length > 0 ? (
        assigned.map((t) => <div key={t}>{t}</div>)
      ) : (
        <span className="text-muted-foreground">No teacher assigned</span>
      )}
    </div>
  );
}

export function GradeMonitoringTable({
  rows,
  schoolYear,
  emptyText,
  periodColumns,
  periodsWidened = false,
}: GradeMonitoringTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-6 text-center text-sm text-muted-foreground">
        {emptyText ?? "No subject assignments found."}
      </div>
    );
  }

  const periods = periodColumns ?? getGradingPeriods(schoolYear);

  return (
    <div className="rounded-lg border bg-background overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Teacher</th>
            <th className="px-3 py-2 text-left font-medium">Subject</th>
            <th className="px-3 py-2 text-left font-medium">Section</th>
            <th className="px-3 py-2 text-left font-medium">Grade Level</th>
            {periods.map((p) => (
              <th key={p.value} className="px-3 py-2 text-center font-medium w-24">
                {p.short}
              </th>
            ))}
            <th className="px-3 py-2 text-left font-medium w-32">Last Encoded</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.key} className="hover:bg-muted/40">
              <td className="px-3 py-2">
                <TeacherCell row={row} />
              </td>
              <td className="px-3 py-2 font-medium">
                {row.subjectName}
                {row.program !== "regular" && (
                  <Badge
                    variant="secondary"
                    className="ml-1.5 text-[10px] px-1.5 py-0"
                  >
                    {getSubjectProgramShortLabel(row.program)}
                  </Badge>
                )}
              </td>
              <td className="px-3 py-2">{row.sectionName}</td>
              <td className="px-3 py-2">{getGradeLevelLabel(row.gradeLevel)}</td>
              {periods.map((p) => (
                <td key={p.value} className="px-3 py-2 text-center">
                  <PeriodStatusCell cell={row.periods[p.value]} />
                </td>
              ))}
              <td className="px-3 py-2 text-muted-foreground">
                {formatLastEncoded(row.lastEncodedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {periodsWidened && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          Columns are grading periods. Sections on the{" "}
          <span className="font-medium">Old SHS Curriculum</span> use 1&ndash;2
          for the first semester and 3&ndash;4 for the second; every other
          section uses the school year&rsquo;s own periods and shows
          &mdash; beyond them.
        </p>
      )}
    </div>
  );
}
