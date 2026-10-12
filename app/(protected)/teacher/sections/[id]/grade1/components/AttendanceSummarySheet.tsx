"use client";

import { LearnerSexGroupRow } from "@/components/LearnerSexGroupHeader";
import { fmtDays, grade1AttendanceRows, type MonthAttendance } from "@/lib/utils/grade1Workbook";
import { groupLearnersBySex } from "@/lib/utils/learnerSex";
import Link from "next/link";
import { Fragment } from "react";
import type { WorkbookLearner } from "../useGrade1Workbook";

/**
 * G1 - ATTENDANCE SUMMARY — days present per learner per month. The workbook
 * has the adviser type these; here they are counted from the daily attendance
 * through the school calendar on the same rules as SF2 and the card, so the
 * card and this sheet always agree. Edit attendance in the Attendance module.
 *
 * A month a term boundary falls inside (September, on the issued sheet) gets
 * one column per term once term dates are set in Settings → School Calendar.
 */
export function AttendanceSummarySheet({
  sectionId,
  schoolYear,
  learners,
  attendance,
}: {
  sectionId: string;
  schoolYear: string;
  learners: WorkbookLearner[];
  attendance: Record<string, MonthAttendance[]>;
}) {
  const groups = groupLearnersBySex(learners, (l) => l.gender);
  // Every learner shares the calendar, so any one row gives the class days.
  const first = learners[0] ? attendance[learners[0].id] : undefined;
  const columns = first ?? grade1AttendanceRows(schoolYear).map((r) => ({ ...r, classDays: 0 }));
  const classDays = columns.map((m) => m.classDays);
  const totalClassDays = classDays.reduce((a, b) => a + b, 0);
  const isSplit = (label: string) => columns.filter((m) => m.label === label).length > 1;
  const split = columns.some((m) => isSplit(m.label));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Days present, counted from the daily{" "}
        <Link
          href={`/attendance?section=${sectionId}&school_year=${schoolYear}`}
          className="underline underline-offset-2"
        >
          attendance
        </Link>{" "}
        and the school calendar up to today.{" "}
        {split ? (
          "A month a term boundary falls inside has one column per term, as on the printed card."
        ) : (
          <>
            September is shown once, under Term 1. Set the term dates in{" "}
            <Link href="/settings/calendar" className="underline underline-offset-2">
              School Calendar
            </Link>{" "}
            to split it across Terms 1 and 2 as the printed card does.
          </>
        )}
      </p>
      <div className="max-h-[75dvh] min-h-0 flex-1 overflow-auto rounded-md border bg-card lg:max-h-none">
        <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-xs">
            <tr>
              <th className="sticky left-0 z-10 border-b border-r bg-muted px-2 py-1.5 text-left font-medium">
                Learners&rsquo; Names
              </th>
              {columns.map((m) => (
                <th key={m.key} className="border-b px-1 py-1.5 text-center font-medium">
                  {m.label.slice(0, 3).toUpperCase()}
                  {isSplit(m.label) && (
                    <span className="block text-[10px] font-normal text-muted-foreground">T{m.term}</span>
                  )}
                </th>
              ))}
              <th className="border-b px-2 py-1.5 text-center font-semibold">TOTAL</th>
            </tr>
            <tr>
              <th className="sticky left-0 z-10 border-b border-r bg-muted px-2 py-1 text-left font-normal italic">
                No. of school days
              </th>
              {classDays.map((d, i) => (
                <th key={i} className="border-b px-1 py-1 text-center font-normal tabular-nums">
                  {fmtDays(d)}
                </th>
              ))}
              <th className="border-b px-2 py-1 text-center font-semibold tabular-nums">{fmtDays(totalClassDays)}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.key}>
                <LearnerSexGroupRow label={g.label} count={g.rows.length} colSpan={columns.length + 2} />
                {g.rows.map((l, i) => {
                  const months = attendance[l.id] ?? [];
                  const total = months.reduce((a, m) => a + m.present, 0);
                  return (
                    <tr key={l.id} className="group">
                      <td className="sticky left-0 whitespace-nowrap border-b border-r bg-card px-2 py-1 group-hover:bg-muted">
                        <span className="mr-2 inline-block w-5 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                        {l.name}
                      </td>
                      {months.map((m) => (
                        <td
                          key={m.key}
                          title={m.absent ? `${fmtDays(m.absent)} absent` : undefined}
                          className={`border-b px-1 py-1 text-center tabular-nums group-hover:bg-muted/40 ${m.absent ? "text-amber-700" : ""}`}
                        >
                          {fmtDays(m.present)}
                        </td>
                      ))}
                      <td className="border-b px-2 py-1 text-center font-semibold tabular-nums group-hover:bg-muted/40">{fmtDays(total)}</td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
