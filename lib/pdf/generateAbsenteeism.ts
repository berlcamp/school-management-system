/**
 * Printable: "Absenteeism Report" — absences by sex, per grade level and
 * section for one school, or per school and grade level for the division.
 * Same tables, same figures as the report pages (lib/utils/absenteeism.ts).
 */

import {
  buildReportDocument,
  esc,
  fetchDivisionHeader,
  fetchReportSchool,
} from "@/lib/pdf/reportShell";
import { printHTMLContent } from "@/lib/pdf/utils";
import {
  ABSENTEEISM_MEASURES,
  AbsenteeismReport,
  AbsenteeismTableRow,
  CHRONIC_THRESHOLD_PERCENT,
  gradeSummaryRows,
  schoolDetailRows,
  schoolSummaryRows,
  SEXES,
} from "@/lib/utils/absenteeism";

export interface AbsenteeismPrintParams {
  /** null = the division-wide report. */
  schoolId: string | number | null;
  schoolYear: string;
  /** "Whole school year" or "October 2026" — printed in the subtitle. */
  periodLabel: string;
  report: AbsenteeismReport;
  /** List every section, not just grade-level lines. */
  withSections: boolean;
  preparedBy: string;
  principalName: string | null;
  principalTitle: string | null;
}

function buildTable(
  title: string,
  labelHeader: string,
  rows: AbsenteeismTableRow[],
): string {
  const head1 = ABSENTEEISM_MEASURES.map(
    (m) => `<th colspan="3">${esc(m.label)}</th>`,
  ).join("");
  const head2 = ABSENTEEISM_MEASURES.map(() =>
    SEXES.map((s) => `<th style="width:4.6%">${s.label}</th>`).join(""),
  ).join("");

  const body = rows
    .map((row) => {
      const cls =
        row.kind === "total" || row.kind === "subtotal"
          ? ' class="subtotal"'
          : "";
      const cells = ABSENTEEISM_MEASURES.map((m) =>
        SEXES.map(
          (s) => `<td class="ctr">${esc(m.value(row.figures[s.key]))}</td>`,
        ).join(""),
      ).join("");
      const detail = row.detail
        ? `<div style="font-size:7pt;">${esc(row.detail)}</div>`
        : "";
      return `<tr${cls}><td>${esc(row.label)}${detail}</td>${cells}</tr>`;
    })
    .join("\n");

  return `<div class="grade-block">
  <div class="group-title" style="break-after:avoid; page-break-after:avoid;">${esc(title)}</div>
  <table class="report" style="font-size:8pt;">
    <thead>
      <tr><th rowspan="2">${esc(labelHeader)}</th>${head1}</tr>
      <tr>${head2}</tr>
    </thead>
    <tbody>
      ${body}
    </tbody>
  </table>
</div>`;
}

export async function generateAbsenteeismPrint(
  params: AbsenteeismPrintParams,
): Promise<void> {
  const {
    schoolId,
    schoolYear,
    periodLabel,
    report,
    withSections,
    preparedBy,
    principalName,
    principalTitle,
  } = params;

  const divisionWide = schoolId === null;
  const school = divisionWide
    ? await fetchDivisionHeader()
    : await fetchReportSchool(schoolId);

  const tables: string[] = [];
  if (divisionWide) {
    tables.push(buildTable("Summary by School", "School", schoolSummaryRows(report)));
    tables.push(
      buildTable("Summary by Grade Level", "Grade Level", gradeSummaryRows(report)),
    );
    if (withSections) {
      report.schools.forEach((s) =>
        tables.push(buildTable(s.name, "Grade Level / Section", schoolDetailRows(s, true))),
      );
    }
  } else {
    report.schools.forEach((s) =>
      tables.push(
        buildTable(
          withSections ? "By Grade Level and Section" : "By Grade Level",
          withSections ? "Grade Level / Section" : "Grade Level",
          schoolDetailRows(s, withSections),
        ),
      ),
    );
  }

  const classDays = report.schools.map((s) => s.classDays);
  const daysNote =
    classDays.length === 0
      ? ""
      : Math.min(...classDays) === Math.max(...classDays)
        ? `${classDays[0]} class day${classDays[0] === 1 ? "" : "s"} held in the period.`
        : `Class days held in the period range from ${Math.min(...classDays)} to ${Math.max(...classDays)} across schools, per each school's calendar.`;

  const body =
    report.schools.length > 0
      ? `${tables.join("\n")}
<p style="font-size:8pt; font-style:italic;">
  ${esc(daysNote)}
  Absences are counted from daily attendance on the SF2 rules: a learner who
  missed only one session of the day is tardy, not absent; holidays and
  suspensions on the school calendar are not class days.
  Chronically absent = absent on at least ${CHRONIC_THRESHOLD_PERCENT}% of class days.
  Absenteeism rate = days absent ÷ (enrolled × class days).
  Enrolled learners only; dropped and transferred-out learners are excluded.
</p>`
      : `<p class="empty">No enrolled learners found for SY ${esc(schoolYear)}.</p>`;

  printHTMLContent(
    buildReportDocument({
      school,
      title: "Absenteeism Report",
      subtitle: `School Year ${schoolYear} — ${periodLabel}${
        divisionWide ? " — All Schools" : ""
      }`,
      body,
      preparedBy,
      principalName,
      principalTitle,
    }),
  );
}
