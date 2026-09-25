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
  CONSECUTIVE_ABSENCE_ALERT,
  formatDays,
  gradeSummaryRows,
  isChronicallyAbsent,
  learnerRate,
  schoolDetailRows,
  schoolSummaryRows,
  SEXES,
} from "@/lib/utils/absenteeism";
import { groupLearnersBySex } from "@/lib/utils/learnerSex";

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

// ---------------------------------------------------------------------------
// Adviser level: one section, one line per learner, boys then girls.
// ---------------------------------------------------------------------------

export interface SectionAbsenteeismLearner {
  name: string;
  lrn: string | null;
  sex: string | null;
  daysAbsent: number;
  tardy: number;
  longestStreak: number;
}

export interface SectionAbsenteeismPrintParams {
  schoolId: string | number;
  schoolYear: string;
  periodLabel: string;
  sectionLabel: string;
  classDays: number;
  learners: SectionAbsenteeismLearner[];
  adviserName: string;
  principalName: string | null;
  principalTitle: string | null;
}

export async function generateSectionAbsenteeismPrint(
  params: SectionAbsenteeismPrintParams,
): Promise<void> {
  const {
    schoolId,
    schoolYear,
    periodLabel,
    sectionLabel,
    classDays,
    learners,
    adviserName,
    principalName,
    principalTitle,
  } = params;

  const school = await fetchReportSchool(schoolId);

  const line = (l: SectionAbsenteeismLearner, i: number) => {
    const flags = [
      isChronicallyAbsent(l.daysAbsent, classDays) ? "Chronic" : "",
      l.longestStreak >= CONSECUTIVE_ABSENCE_ALERT
        ? `${l.longestStreak} days in a row`
        : "",
    ]
      .filter(Boolean)
      .join("; ");
    return `<tr>
  <td class="ctr">${i + 1}</td>
  <td>${esc(l.name)}</td>
  <td class="ctr">${esc(l.lrn ?? "")}</td>
  <td class="ctr">${esc(formatDays(l.daysAbsent))}</td>
  <td class="ctr">${esc(learnerRate(l.daysAbsent, classDays))}</td>
  <td class="ctr">${l.tardy}</td>
  <td class="ctr">${l.longestStreak}</td>
  <td>${esc(flags)}</td>
</tr>`;
  };

  const subtotal = (label: string, rows: SectionAbsenteeismLearner[]) => {
    const days = rows.reduce((s, l) => s + l.daysAbsent, 0);
    const absent = rows.filter((l) => l.daysAbsent > 0).length;
    const tardy = rows.reduce((s, l) => s + l.tardy, 0);
    const rate =
      rows.length > 0 && classDays > 0
        ? `${((days / (rows.length * classDays)) * 100).toFixed(2)}%`
        : "—";
    return `<tr class="subtotal">
  <td></td>
  <td>${esc(label)} — ${rows.length} learner${rows.length === 1 ? "" : "s"}, ${absent} with absences</td>
  <td></td>
  <td class="ctr">${esc(formatDays(days))}</td>
  <td class="ctr">${esc(rate)}</td>
  <td class="ctr">${tardy}</td>
  <td></td>
  <td>${rows.filter((l) => isChronicallyAbsent(l.daysAbsent, classDays)).length} chronic</td>
</tr>`;
  };

  const groups = groupLearnersBySex(learners, (l) => l.sex);
  const body = groups
    .map(
      (g) => `<tr><td colspan="8" style="font-weight:bold;">${esc(g.label)}</td></tr>
${g.rows.map(line).join("\n")}
${subtotal(`Total ${g.label.toLowerCase()}`, g.rows)}`,
    )
    .join("\n");

  const html = `<table class="report" style="font-size:8.5pt;">
  <thead>
    <tr>
      <th style="width:4%">#</th>
      <th style="width:30%">Learner</th>
      <th style="width:12%">LRN</th>
      <th style="width:9%">Days Absent</th>
      <th style="width:9%">Absence Rate</th>
      <th style="width:8%">Times Tardy</th>
      <th style="width:10%">Longest Consecutive Absence</th>
      <th>Remarks</th>
    </tr>
  </thead>
  <tbody>
    ${body}
    ${subtotal("Combined", learners)}
  </tbody>
</table>
<p style="font-size:8pt; font-style:italic;">
  ${esc(formatDays(classDays))} class days held in the period. Counted as SF2
  counts them: a learner who missed only one session of the day is tardy, not
  absent. Chronic = absent on at least ${CHRONIC_THRESHOLD_PERCENT}% of class days.
  A learner absent ${CONSECUTIVE_ABSENCE_ALERT} or more consecutive class days is
  due a home visitation (SF2, instruction 5).
</p>`;

  printHTMLContent(
    buildReportDocument({
      school,
      title: "Learner Absenteeism Report",
      subtitle: `${sectionLabel} — School Year ${schoolYear} — ${periodLabel}`,
      body: learners.length > 0 ? html : `<p class="empty">No learners.</p>`,
      preparedBy: adviserName,
      principalName,
      principalTitle,
    }),
  );
}
