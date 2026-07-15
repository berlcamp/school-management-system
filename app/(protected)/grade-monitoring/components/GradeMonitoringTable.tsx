"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getGradeLevelLabel } from "@/lib/constants";
import { getGradingPeriods } from "@/lib/utils/schoolYear";
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

/** Assigned teacher(s), flagging anyone who encoded but is not on the schedule. */
function TeacherCell({ row }: { row: EncodingGridRow }) {
  const assigned = row.assignedTeachers;
  const unexpected = row.encoders.filter((e) => !assigned.includes(e));

  return (
    <div className="space-y-0.5">
      {assigned.length > 0 ? (
        assigned.map((t) => <div key={t}>{t}</div>)
      ) : (
        <span className="text-muted-foreground">No teacher assigned</span>
      )}
      {unexpected.map((t) => (
        <TooltipProvider key={t}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-amber-700 text-xs cursor-default">
                {t} (encoded)
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Encoded grades here but is not assigned to this subject in
              Schedules.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}
    </div>
  );
}

export function GradeMonitoringTable({
  rows,
  schoolYear,
  emptyText,
}: GradeMonitoringTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-6 text-center text-sm text-muted-foreground">
        {emptyText ?? "No subject assignments found."}
      </div>
    );
  }

  const periods = getGradingPeriods(schoolYear);

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
                {row.isMadrasah && (
                  <Badge
                    variant="secondary"
                    className="ml-1.5 text-[10px] px-1.5 py-0"
                  >
                    MEP
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
    </div>
  );
}
