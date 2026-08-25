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
  ReportSchool,
} from "@/lib/pdf/reportShell";
import { printHTMLContent } from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";
import {
  GradeLevelTeacherGroup,
  learningAreaLabel,
  listOrDash,
  roleLabel,
  sexLabel,
} from "@/lib/utils/gradeLevelTeachers";

export interface GradeLevelTeachersPrintParams {
  /** null = the division-wide roster; the sheet then carries a School column. */
  schoolId: string | number | null;
  schoolYear: string;
  /** "Grade 5" or "All Grade Levels" — printed in the subtitle. */
  gradeLabel: string;
  groups: GradeLevelTeacherGroup[];
  preparedBy: string;
  /** School head of the school being reported on, when one is on record. */
  principalName: string | null;
  principalTitle: string | null;
}

/**
 * The header block for the division-wide cut. There is no divisions table in
 * the schema (`sms_schools.division_id` is free text), so the region is read
 * off a school — real data — and the office line is a plain label rather than
 * a claim about any particular school.
 */
async function fetchDivisionHeader(): Promise<ReportSchool> {
  const { data } = await supabase
    .from("sms_schools")
    .select("region, district")
    .eq("is_active", true)
    .limit(1);

  const first = data?.[0];
  return {
    name: "Schools Division Office",
    address: null,
    district: null,
    region: (first?.region as string) ?? null,
  };
}

function buildGroup(
  group: GradeLevelTeacherGroup,
  showSchool: boolean,
): string {
  const rows = group.rows
    .map(
      (r, i) => `<tr>
  <td class="ctr">${i + 1}</td>
  ${showSchool ? `<td>${esc(r.school_name)}</td>` : ""}
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

  // Deliberately NOT `class="group"`: reportShell prints that with
  // `break-inside: avoid`, which is right for a short block but pushes a whole
  // grade level onto the next page the moment it outgrows what is left of this
  // one — a Kindergarten roster of 74 teachers left page 1 empty below the
  // header. A grade block is expected to span pages; only the heading is held
  // to the table it introduces, and reportShell already repeats the thead.
  return `<div class="grade-block">
  <div class="group-title" style="break-after:avoid; page-break-after:avoid;">${esc(
    group.label,
  )} — ${group.rows.length} teacher${group.rows.length === 1 ? "" : "s"}</div>
  <table class="report">
    <thead>
      <tr>
        <th style="width:3%">#</th>
        ${showSchool ? '<th style="width:16%">School</th>' : ""}
        <th style="width:${showSchool ? 14 : 17}%">Teacher</th>
        <th style="width:4%">Sex</th>
        <th style="width:${showSchool ? 10 : 12}%">Position</th>
        <th style="width:${showSchool ? 8 : 10}%">Role</th>
        <th style="width:${showSchool ? 9 : 11}%">Specialization</th>
        <th style="width:${showSchool ? 11 : 13}%">Advisory Section</th>
        <th style="width:${showSchool ? 15 : 18}%">Subjects Handled</th>
        <th style="width:${showSchool ? 10 : 12}%">Sections Taught</th>
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

  const showSchool = schoolId === null;
  const school = showSchool
    ? await fetchDivisionHeader()
    : await fetchReportSchool(schoolId);

  const total = groups.reduce((sum, g) => sum + g.rows.length, 0);
  const schoolCount = new Set(
    groups.flatMap((g) => g.rows.map((r) => r.school_id)),
  ).size;

  const body =
    groups.length > 0
      ? `${groups.map((g) => buildGroup(g, showSchool)).join("\n")}
<p style="font-size:8pt; font-style:italic;">
  ${total} teaching assignment${total === 1 ? "" : "s"} across
  ${groups.length} grade level${groups.length === 1 ? "" : "s"}${
    showSchool
      ? ` in ${schoolCount} school${schoolCount === 1 ? "" : "s"}`
      : ""
  }.
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
      subtitle: `School Year ${schoolYear} — ${gradeLabel}${
        showSchool ? " — All Schools" : ""
      }`,
      body,
      preparedBy,
      principalName,
      principalTitle,
    }),
  );
}
