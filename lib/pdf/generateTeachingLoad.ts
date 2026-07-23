/**
 * Printable: "Teaching Load (minutes per day)".
 * Mirrors the School Dashboard widget — Mon–Fri teaching minutes plus the
 * DepEd advisorship / ARAL equivalents.
 */

import {
  buildReportDocument,
  esc,
  fetchReportSchool,
} from "@/lib/pdf/reportShell";
import { printHTMLContent } from "@/lib/pdf/utils";
import {
  advisorshipWeeklyMinutes,
  aralWeeklyMinutes,
  teacherWeeklyTotal,
  TeacherLoad,
  WEEKDAYS,
} from "@/lib/utils/teachingLoad";

export interface TeachingLoadPrintParams {
  schoolId: string | number;
  schoolYear: string;
  /** Display name of the teacher filter, or "All Teachers". */
  teacherLabel: string;
  loads: TeacherLoad[];
  preparedBy: string;
  principalName: string | null;
  principalTitle: string | null;
}

function buildTable(loads: TeacherLoad[]): string {
  const dayHeaders = WEEKDAYS.map(
    (d) => `<th style="width:7%">${d.label}</th>`,
  ).join("");

  const rows = loads
    .map(
      (t, i) => `<tr>
  <td class="ctr">${i + 1}</td>
  <td>${esc(t.teacherName)}</td>
  ${WEEKDAYS.map((d) => `<td class="num">${t.minutes[d.idx] || 0}</td>`).join("")}
  <td class="num">${advisorshipWeeklyMinutes(t)}</td>
  <td class="num">${aralWeeklyMinutes(t)}</td>
  <td class="num"><strong>${teacherWeeklyTotal(t)}</strong></td>
</tr>`,
    )
    .join("\n");

  return `<table class="report">
  <thead>
    <tr>
      <th style="width:4%">#</th>
      <th style="width:27%">Teacher</th>
      ${dayHeaders}
      <th style="width:11%">Advisorship</th>
      <th style="width:8%">ARAL</th>
      <th style="width:11%">Weekly Total</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>
<p style="font-size:8pt; font-style:italic;">
  Advisorship = 60 min/day &times; 5 days per advisory class.
  ARAL = 30 min/day &times; 5 days per assigned group.
  All figures in minutes.
</p>`;
}

export async function generateTeachingLoadPrint(
  params: TeachingLoadPrintParams,
): Promise<void> {
  const {
    schoolId,
    schoolYear,
    teacherLabel,
    loads,
    preparedBy,
    principalName,
    principalTitle,
  } = params;

  const school = await fetchReportSchool(schoolId);

  const body =
    loads.length > 0
      ? buildTable(loads)
      : `<p class="empty">No teaching load found for SY ${esc(schoolYear)}.</p>`;

  printHTMLContent(
    buildReportDocument({
      school,
      title: "Teaching Load (Minutes per Day)",
      subtitle: `School Year ${schoolYear} — ${teacherLabel}`,
      body,
      preparedBy,
      principalName,
      principalTitle,
    }),
  );
}
