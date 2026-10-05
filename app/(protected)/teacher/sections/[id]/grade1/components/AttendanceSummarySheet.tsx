"use client";

import { LearnerSexGroupRow } from "@/components/LearnerSexGroupHeader";
import { GRADE1_ATTENDANCE_MONTHS } from "@/lib/constants/pace";
import { fmtDays, type MonthAttendance } from "@/lib/utils/grade1Workbook";
import { groupLearnersBySex } from "@/lib/utils/learnerSex";
import Link from "next/link";
import { Fragment } from "react";
import type { WorkbookLearner } from "../useGrade1Workbook";

/**
 * G1 - ATTENDANCE SUMMARY — days present per learner per month. The workbook
 * has the adviser type these; here they are counted from the daily attendance
 * through the school calendar on the same rules as SF2 and the card, so the
 * card and this sheet always agree. Edit attendance in the Attendance module.
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
  const classDays = first?.map((m) => m.classDays) ?? GRADE1_ATTENDANCE_MONTHS.map(() => 0);
  const totalClassDays = classDays.reduce((a, b) => a + b, 0);

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
        and the school calendar up to today. September is shown once, under Term 1, as on the printed card.
      </p>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-xs">
            <tr className="border-b">
              <th className="px-2 py-1.5 text-left font-medium">Learners&rsquo; Names</th>
              {GRADE1_ATTENDANCE_MONTHS.map((m) => (
                <th key={m.label} className="px-1 py-1.5 text-center font-medium">
                  {m.label.slice(0, 3).toUpperCase()}
                </th>
              ))}
              <th className="px-2 py-1.5 text-center font-semibold">TOTAL</th>
            </tr>
            <tr className="border-b bg-muted/60">
              <th className="px-2 py-1 text-left font-normal italic">No. of school days</th>
              {classDays.map((d, i) => (
                <th key={i} className="px-1 py-1 text-center font-normal tabular-nums">
                  {fmtDays(d)}
                </th>
              ))}
              <th className="px-2 py-1 text-center font-semibold tabular-nums">{fmtDays(totalClassDays)}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.key}>
                <LearnerSexGroupRow label={g.label} count={g.rows.length} colSpan={GRADE1_ATTENDANCE_MONTHS.length + 2} />
                {g.rows.map((l, i) => {
                  const months = attendance[l.id] ?? [];
                  const total = months.reduce((a, m) => a + m.present, 0);
                  return (
                    <tr key={l.id} className="border-b hover:bg-muted/40">
                      <td className="whitespace-nowrap px-2 py-1">
                        <span className="mr-2 inline-block w-5 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                        {l.name}
                      </td>
                      {months.map((m) => (
                        <td
                          key={m.label}
                          title={m.absent ? `${fmtDays(m.absent)} absent` : undefined}
                          className={`px-1 py-1 text-center tabular-nums ${m.absent ? "text-amber-700" : ""}`}
                        >
                          {fmtDays(m.present)}
                        </td>
                      ))}
                      <td className="px-2 py-1 text-center font-semibold tabular-nums">{fmtDays(total)}</td>
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
