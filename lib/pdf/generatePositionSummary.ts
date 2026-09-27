/**
 * Printable: "Staff by Position / Designation" — the headcount per position by
 * sex, as the report renders it on screen, at one school or division-wide.
 */

import {
  buildReportDocument,
  esc,
  fetchDivisionHeader,
  fetchReportSchool,
} from "@/lib/pdf/reportShell";
import { printHTMLContent } from "@/lib/pdf/utils";
import { format } from "date-fns";
import {
  PositionCounts,
  PositionSummary,
  positionSchoolRows,
} from "@/lib/utils/positionSummary";

export interface PositionSummaryPrintParams {
  /** null = division-wide. */
  schoolId: string | number | null;
  summary: PositionSummary;
  detail: "none" | "schools" | "names";
  preparedBy: string;
  principalName: string | null;
  principalTitle: string | null;
}

function sexLabel(gender: string | null): string {
  if (gender === "male") return "M";
  if (gender === "female") return "F";
  return "—";
}

export async function generatePositionSummaryPrint(
  params: PositionSummaryPrintParams,
): Promise<void> {
  const { schoolId, summary, detail, preparedBy, principalName, principalTitle } =
    params;

  const divisionWide = schoolId === null;
  const school = divisionWide
    ? await fetchDivisionHeader()
    : await fetchReportSchool(schoolId);

  const showUnrecorded = summary.unrecorded > 0;
  const cols = showUnrecorded ? 5 : 4;

  const figures = (c: PositionCounts) => `
  <td class="ctr">${c.male}</td>
  <td class="ctr">${c.female}</td>
  ${showUnrecorded ? `<td class="ctr">${c.unrecorded}</td>` : ""}
  <td class="ctr"><b>${c.total}</b></td>`;

  const rows = summary.groups
    .map((g) => {
      const head = `<tr${detail === "none" ? "" : ' class="subtotal"'}>
  <td>${esc(g.label)}</td>${figures(g)}
</tr>`;
      if (detail === "schools") {
        return (
          head +
          positionSchoolRows(g)
            .map(
              (s) => `<tr>
  <td style="padding-left:18px;">${esc(s.schoolName)}</td>${figures(s)}
</tr>`,
            )
            .join("\n")
        );
      }
      if (detail === "names") {
        return (
          head +
          g.staff
            .map(
              (p, i) => `<tr>
  <td colspan="${cols}" style="padding-left:18px;">${i + 1}. ${esc(p.name)} (${sexLabel(
    p.gender,
  )})${divisionWide ? ` — ${esc(p.school_name)}` : ""}</td>
</tr>`,
            )
            .join("\n")
        );
      }
      return head;
    })
    .join("\n");

  const body =
    summary.groups.length > 0
      ? `<table class="report" style="width:${detail === "none" ? "70%" : "100%"}; margin:0 auto 10px;">
  <thead>
    <tr>
      <th>Position / Designation</th>
      <th style="width:10%">Male</th>
      <th style="width:10%">Female</th>
      ${showUnrecorded ? '<th style="width:12%">Sex Not Recorded</th>' : ""}
      <th style="width:10%">Total</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
    <tr class="subtotal"><td>TOTAL</td>${figures(summary)}</tr>
  </tbody>
</table>
<p style="font-size:8pt; font-style:italic;">
  Active staff records only${
    divisionWide
      ? `, ${summary.schoolCount} school${summary.schoolCount === 1 ? "" : "s"}`
      : ""
  }. "Not specified" = no position on the staff record. Division office
  accounts are not counted.
</p>`
      : `<p class="empty">No active staff records.</p>`;

  printHTMLContent(
    buildReportDocument({
      school,
      title: "Staff by Position / Designation",
      subtitle: `As of ${format(new Date(), "MMMM d, yyyy")}${
        divisionWide ? " — All Schools" : ""
      }`,
      body,
      preparedBy,
      principalName,
      principalTitle,
    }),
  );
}
