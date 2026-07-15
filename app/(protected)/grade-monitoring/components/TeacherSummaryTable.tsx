"use client";

import { Badge } from "@/components/ui/badge";
import { getGradingPeriodType } from "@/lib/utils/schoolYear";
import { TeacherSummaryRow, formatLastEncoded } from "./gradeEncoding";

interface TeacherSummaryTableProps {
  rows: TeacherSummaryRow[];
  schoolYear: string;
  emptyText?: string;
}

export function TeacherSummaryTable({
  rows,
  schoolYear,
  emptyText,
}: TeacherSummaryTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-6 text-center text-sm text-muted-foreground">
        {emptyText ?? "No teachers found."}
      </div>
    );
  }

  const periodNoun =
    getGradingPeriodType(schoolYear) === "term" ? "term" : "quarter";

  return (
    <div className="rounded-lg border bg-background overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Teacher</th>
            <th className="px-3 py-2 text-center font-medium w-28">
              Subjects Handled
            </th>
            <th className="px-3 py-2 text-center font-medium w-24">Complete</th>
            <th className="px-3 py-2 text-center font-medium w-24">Partial</th>
            <th className="px-3 py-2 text-center font-medium w-28">Not Started</th>
            <th className="px-3 py-2 text-left font-medium w-32">Last Encoded</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.key} className="hover:bg-muted/40">
              <td className="px-3 py-2 font-medium">{row.teacherName}</td>
              <td className="px-3 py-2 text-center tabular-nums">
                {row.assignments}
              </td>
              <td className="px-3 py-2 text-center tabular-nums">
                {row.complete}
              </td>
              <td className="px-3 py-2 text-center tabular-nums">
                {row.partial > 0 ? (
                  <Badge
                    variant="outline"
                    className="bg-amber-50 text-amber-700 border-amber-200 border font-normal tabular-nums"
                  >
                    {row.partial}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </td>
              <td className="px-3 py-2 text-center tabular-nums">
                {row.notStarted > 0 ? (
                  <Badge
                    variant="outline"
                    className="bg-red-50 text-red-700 border-red-200 border font-normal tabular-nums"
                  >
                    {row.notStarted}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {formatLastEncoded(row.lastEncodedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
        Counts are per subject &times; section &times; {periodNoun}. A subject taught
        by two teachers counts for both.
      </p>
    </div>
  );
}
