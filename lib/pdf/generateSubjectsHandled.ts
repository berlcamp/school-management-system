/**
 * Printable: "Subjects Handled by Teacher".
 * One table per teacher, listing every scheduled subject for the school year.
 */

import {
  buildReportDocument,
  esc,
  fetchReportSchool,
} from "@/lib/pdf/reportShell";
import { printHTMLContent } from "@/lib/pdf/utils";
import { getGradeLevelLabel } from "@/lib/constants";
import {
  formatDays,
  formatTime,
  TeacherSubjects,
} from "@/lib/utils/subjectsHandled";

export interface SubjectsHandledPrintParams {
  schoolId: string | number;
  schoolYear: string;
  /** Display name of the teacher filter, or "All Teachers". */
  teacherLabel: string;
  groups: TeacherSubjects[];
  preparedBy: string;
  principalName: string | null;
  principalTitle: string | null;
}

function buildTeacherTable(group: TeacherSubjects): string {
  const rows = group.rows
    .map(
      (r, i) => `<tr>
  <td class="ctr">${i + 1}</td>
  <td>${esc(r.subjectName)}</td>
  <td class="ctr">${esc(getGradeLevelLabel(r.gradeLevel))}</td>
  <td>${esc(r.sectionName)}</td>
  <td class="ctr">${esc(formatDays(r.days))}</td>
  <td class="ctr">${esc(formatTime(r.startTime))} - ${esc(formatTime(r.endTime))}</td>
  <td>${esc(r.roomName)}</td>
  <td class="num">${r.minutesPerWeek}</td>
  <td class="num">${r.learners}</td>
</tr>`,
    )
    .join("\n");

  return `<div class="group">
  <div class="group-title">Teacher: ${esc(group.teacherName)}</div>
  <table class="report">
    <thead>
      <tr>
        <th style="width:3%">#</th>
        <th style="width:20%">Subject</th>
        <th style="width:10%">Grade</th>
        <th style="width:14%">Section</th>
        <th style="width:10%">Days</th>
        <th style="width:17%">Time</th>
        <th style="width:12%">Room</th>
        <th style="width:7%">Min/Wk</th>
        <th style="width:7%">Learners</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="subtotal">
        <td colspan="7">TOTAL SUBJECTS HANDLED: ${group.rows.length}</td>
        <td class="num">${group.totalMinutesPerWeek}</td>
        <td></td>
      </tr>
    </tbody>
  </table>
</div>`;
}

export async function generateSubjectsHandledPrint(
  params: SubjectsHandledPrintParams,
): Promise<void> {
  const {
    schoolId,
    schoolYear,
    teacherLabel,
    groups,
    preparedBy,
    principalName,
    principalTitle,
  } = params;

  const school = await fetchReportSchool(schoolId);

  const body =
    groups.length > 0
      ? groups.map(buildTeacherTable).join("\n")
      : `<p class="empty">No subject schedules found for SY ${esc(schoolYear)}.</p>`;

  printHTMLContent(
    buildReportDocument({
      school,
      title: "Subjects Handled by Teacher",
      subtitle: `School Year ${schoolYear} — ${teacherLabel}`,
      body,
      preparedBy,
      principalName,
      principalTitle,
    }),
  );
}
