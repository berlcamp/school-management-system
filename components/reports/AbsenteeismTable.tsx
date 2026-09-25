"use client";

import { cn } from "@/lib/utils";
import {
  ABSENTEEISM_MEASURES,
  AbsenteeismTableRow,
  CHRONIC_THRESHOLD_PERCENT,
  SEXES,
} from "@/lib/utils/absenteeism";

/**
 * One absenteeism table — label column, then Male / Female / Total under each
 * measure. Shared by the SDO and school-level report pages so the two read
 * identically.
 */
export function AbsenteeismTable({
  rows,
  labelHeader,
  caption,
}: {
  rows: AbsenteeismTableRow[];
  labelHeader: string;
  caption?: string;
}) {
  return (
    <div className="app__table_shell [&_tbody_td]:tabular-nums">
      {caption && (
        <div className="border-b border-border bg-muted/50 px-4 py-2 text-sm font-medium">
          {caption}
        </div>
      )}
      <div className="app__table_wrapper overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th rowSpan={2} className="min-w-[180px] text-left font-medium">
                {labelHeader}
              </th>
              {ABSENTEEISM_MEASURES.map((m) => (
                <th
                  key={m.key}
                  colSpan={3}
                  className="border-l text-center text-xs font-medium"
                >
                  {m.label}
                </th>
              ))}
            </tr>
            <tr>
              {ABSENTEEISM_MEASURES.map((m) =>
                SEXES.map((s) => (
                  <th
                    key={`${m.key}-${s.key}`}
                    className={cn(
                      "text-center text-xs font-medium",
                      s.key === "male" && "border-l",
                    )}
                  >
                    {s.label}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className={cn(
                  row.kind === "subtotal" && "bg-muted/30 font-medium",
                  row.kind === "total" && "bg-muted/50 font-semibold",
                )}
              >
                <td>
                  {row.label}
                  {row.detail && (
                    <div className="text-xs font-normal text-muted-foreground">
                      {row.detail}
                    </div>
                  )}
                </td>
                {ABSENTEEISM_MEASURES.map((m) =>
                  SEXES.map((s) => (
                    <td
                      key={`${m.key}-${s.key}`}
                      className={cn(
                        "text-center",
                        s.key === "male" && "border-l",
                        s.key === "total" && "font-medium",
                      )}
                    >
                      {m.value(row.figures[s.key])}
                    </td>
                  )),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AbsenteeismFootnote() {
  return (
    <p className="text-xs text-muted-foreground">
      M = male, F = female, T = total. Absences come from the daily attendance
      advisers encode, counted as SF2 counts them: a learner who missed only one
      session of the day is tardy, not absent, and holidays and suspensions on
      the school calendar are not class days. <b>Chronically absent</b> = absent
      on at least {CHRONIC_THRESHOLD_PERCENT}% of class days in the period.{" "}
      <b>Absenteeism rate</b> = days absent ÷ (enrolled learners × class days
      held). Only currently enrolled learners are counted — dropped and
      transferred-out learners are excluded. A section that has not encoded
      attendance reads as full attendance.
    </p>
  );
}
