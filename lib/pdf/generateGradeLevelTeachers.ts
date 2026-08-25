/**
 * Printable: "Grade Level Teachers" — the roster of teachers assigned to a
 * grade level at one school, as the SDO report renders it on screen.
 *
 * Grouped by grade level so that "All grade levels" prints as the whole
 * school's teaching assignment in one document, each grade under its own
 * heading, and a single grade prints as just that heading.
 */

import {
  buildReportDocument,
  esc,
  fetchReportSchool,
} from "@/lib/pdf/reportShell";
import { printHTMLContent } from "@/lib/pdf/utils";
import {
  GradeLevelTeacherGroup,
  learningAreaLabel,
  listOrDash,
  roleLabel,
  sexLabel,
} from "@/lib/utils/gradeLevelTeachers";

export interface GradeLevelTeachersPrintParams {
  schoolId: string | number;
  schoolYear: string;
  /** "Grade 5" or "All Grade Levels" — printed in the subtitle. */
  gradeLabel: string;
  groups: GradeLevelTeacherGroup[];
  preparedBy: string;
  /** School head of the school being reported on, when one is on record. */
  principalName: string | null;
  principalTitle: string | null;
}

function buildGroup(group: GradeLevelTeacherGroup): string {
  const rows = group.rows
    .map(
      (r, i) => `<tr>
  <td class="ctr">${i + 1}</td>
  <td>${esc(r.teacher_name)}${
    r.teacher_is_active
      ? ""
      : ' <span style="font-style:italic;">(inactive)</span>'
  }</td>
  <td class="ctr">${esc(sexLabel(r.teacher_gender))}</td>
  <td>${esc(r.teacher_position || "—")}</td>
  <td>${esc(roleLabel(r.user_type))}</td>
  <td>${esc(learningAreaLabel(r.learning_area))}</td>
  <td>${esc(listOrDash(r.advisory_sections))}</td>
  <td>${esc(listOrDash(r.subject_names))}</td>
  <td>${esc(listOrDash(r.section_names))}</td>
</tr>`,
    )
    .join("\n");

  return `<div class="group">
  <div class="group-title">${esc(group.label)} — ${group.rows.length} teacher${
    group.rows.length === 1 ? "" : "s"
  }</div>
  <table class="report">
    <thead>
      <tr>
        <th style="width:3%">#</th>
        <th style="width:17%">Teacher</th>
        <th style="width:4%">Sex</th>
        <th style="width:12%">Position</th>
        <th style="width:10%">Role</th>
        <th style="width:11%">Specialization</th>
        <th style="width:13%">Advisory Section</th>
        <th style="width:18%">Subjects Handled</th>
        <th style="width:12%">Sections Taught</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</div>`;
}

export async function generateGradeLevelTeachersPrint(
  params: GradeLevelTeachersPrintParams,
): Promise<void> {
  const {
    schoolId,
    schoolYear,
    gradeLabel,
    groups,
    preparedBy,
    principalName,
    principalTitle,
  } = params;

  const school = await fetchReportSchool(schoolId);

  const total = groups.reduce((sum, g) => sum + g.rows.length, 0);

  const body =
    groups.length > 0
      ? `${groups.map(buildGroup).join("\n")}
<p style="font-size:8pt; font-style:italic;">
  ${total} teaching assignment${total === 1 ? "" : "s"} across
  ${groups.length} grade level${groups.length === 1 ? "" : "s"}.
  A teacher assigned to more than one grade level is listed under each.
  Roster derived from section advisorship and subject schedules for the school
  year shown — not a plantilla personnel count.
</p>`
      : `<p class="empty">No teaching assignments found for ${esc(
          gradeLabel,
        )} in SY ${esc(schoolYear)}.</p>`;

  printHTMLContent(
    buildReportDocument({
      school,
      title: "Grade Level Teachers",
      subtitle: `School Year ${schoolYear} — ${gradeLabel}`,
      body,
      preparedBy,
      principalName,
      principalTitle,
    }),
  );
}
