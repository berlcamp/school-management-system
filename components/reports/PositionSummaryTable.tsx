"use client";

import { cn } from "@/lib/utils";
import {
  NOT_SPECIFIED,
  PositionCounts,
  PositionSummary,
  positionSchoolRows,
} from "@/lib/utils/positionSummary";
import { Fragment } from "react";

/** What sits under each position: nothing, its schools, or its people. */
export type PositionDetail = "none" | "schools" | "names";

function sexLabel(gender: string | null): string {
  if (gender === "male") return "M";
  if (gender === "female") return "F";
  return "—";
}

/**
 * Staff by Position / Designation — Male / Female / Total per position, with
 * an optional per-school or per-person breakdown under each. Shared by the SDO
 * and school-level pages so the two read identically.
 */
export function PositionSummaryTable({
  summary,
  detail,
}: {
  summary: PositionSummary;
  detail: PositionDetail;
}) {
  // The column only appears when there is something in it.
  const showUnrecorded = summary.unrecorded > 0;

  const figures = (c: PositionCounts) => (
    <>
      <td className="text-center">{c.male}</td>
      <td className="text-center">{c.female}</td>
      {showUnrecorded && <td className="text-center">{c.unrecorded}</td>}
      <td className="text-center font-medium">{c.total}</td>
    </>
  );

  return (
    <div className="app__table_shell [&_tbody_td]:tabular-nums">
      <div className="app__table_wrapper overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="min-w-[220px] text-left font-medium">
                Position / Designation
              </th>
              <th className="w-20 text-center font-medium">Male</th>
              <th className="w-20 text-center font-medium">Female</th>
              {showUnrecorded && (
                <th className="w-24 text-center font-medium">
                  Sex not recorded
                </th>
              )}
              <th className="w-20 text-center font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {summary.groups.map((g) => (
              <Fragment key={g.label}>
                <tr
                  className={cn(
                    detail !== "none" && "bg-muted/30 font-medium",
                  )}
                >
                  <td
                    className={cn(
                      g.label === NOT_SPECIFIED && "italic text-muted-foreground",
                    )}
                  >
                    {g.label}
                  </td>
                  {figures(g)}
                </tr>
                {detail === "schools" &&
                  positionSchoolRows(g).map((s) => (
                    <tr key={`${g.label}-${s.schoolId}`}>
                      <td className="pl-8 text-muted-foreground">
                        {s.schoolName}
                      </td>
                      {figures(s)}
                    </tr>
                  ))}
                {detail === "names" &&
                  g.staff.map((p) => (
                    <tr key={`${g.label}-${p.id}`}>
                      <td className="pl-8" colSpan={showUnrecorded ? 5 : 4}>
                        {p.name}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {sexLabel(p.gender)}
                        </span>
                      </td>
                    </tr>
                  ))}
              </Fragment>
            ))}
            <tr className="bg-muted/50 font-semibold">
              <td>Total</td>
              {figures(summary)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PositionSummaryFootnote() {
  return (
    <p className="text-xs text-muted-foreground">
      Active staff records only, counted under the Position / Designation on
      each person&apos;s record in Staff. Teacher positions typed before the
      dropdown existed (&quot;TEACHER III&quot;, &quot;Teacher 3&quot;) are
      counted as the listed position; other positions are grouped ignoring
      capitalisation. <b>Not specified</b> = no position on the record — set it
      in Staff to move the person into the right row. Personnel-only records
      (accounting, security guard, utility worker) are included; division
      office accounts are not.
    </p>
  );
}
