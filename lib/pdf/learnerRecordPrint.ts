/**
 * Shared print scaffold for the class-adviser learner records
 * (Anecdotal Record + Learner Cardex sheets). Builds a DepEd-style printable
 * document — logo header, learner identity block, an entries table, and
 * Adviser / Principal signatory lines — using the shared pdf utils.
 */
import { supabase } from "@/lib/supabase/client";
import {
  buildDepEdHeaderWithLogos,
  DEPED_BASE_STYLES,
  DEPED_HEADER_LOGOS_STYLES,
} from "@/lib/pdf/utils";
import { fetchSchoolSettings } from "@/lib/utils/schoolSettings";
import { getGradeLevelLabel } from "@/lib/constants";
import type { Student } from "@/types";

export interface LearnerPrintLearner {
  student: Student;
  sectionName?: string | null;
  gradeLevel?: number | null;
}

export interface LearnerPrintContext {
  schoolName: string;
  schoolAddress: string;
  principalName: string;
  principalTitle: string;
}

/** Escapes HTML-significant characters in user-entered text. */
export function esc(value: string | null | undefined): string {
  if (value == null || value === "") return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Formats a YYYY-MM-DD date string as e.g. "Jun 15, 2026". */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Loads the school name/address + principal signatory config for the header/footer. */
export async function fetchLearnerPrintContext(
  schoolId: string | number | null | undefined,
): Promise<LearnerPrintContext> {
  let schoolName = "";
  let schoolAddress = "";
  if (schoolId != null) {
    const { data: school } = await supabase
      .from("sms_schools")
      .select("name, address")
      .eq("id", Number(schoolId))
      .maybeSingle();
    if (school) {
      schoolName = (school.name as string) ?? "";
      schoolAddress = (school.address as string) ?? "";
    }
  }
  const settings = await fetchSchoolSettings(
    schoolId != null ? String(schoolId) : null,
  );
  return {
    schoolName,
    schoolAddress,
    principalName: settings.principal_name ?? "",
    principalTitle: settings.principal_title ?? "Principal",
  };
}

function fullName(student: Student): string {
  const mid = student.middle_name ? ` ${student.middle_name}` : "";
  const suffix = student.suffix ? ` ${student.suffix}` : "";
  return `${student.last_name}, ${student.first_name}${mid}${suffix}`.trim();
}

/** Builds the complete printable HTML document. */
export function buildLearnerRecordDocument(opts: {
  formTitle: string;
  learner: LearnerPrintLearner;
  schoolYear: string;
  context: LearnerPrintContext;
  bodyHtml: string;
  adviserName?: string | null;
}): string {
  const { formTitle, learner, schoolYear, context, bodyHtml, adviserName } =
    opts;
  const { student, sectionName, gradeLevel } = learner;
  const gradeSection = [
    gradeLevel != null ? getGradeLevelLabel(gradeLevel) : null,
    sectionName || null,
  ]
    .filter(Boolean)
    .join(" – ");

  const header = buildDepEdHeaderWithLogos(`
    <div class="school-name">${esc(context.schoolName) || "Department of Education"}</div>
    ${context.schoolAddress ? `<div class="school-address">${esc(context.schoolAddress)}</div>` : ""}
    <div class="form-title">${esc(formTitle)}</div>
  `);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(formTitle)} - ${esc(fullName(student))}</title>
<style>
${DEPED_BASE_STYLES}
${DEPED_HEADER_LOGOS_STYLES}
.identity-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
.identity-table td { padding: 5px 8px; border: 1px solid #000; font-size: 10pt; }
.identity-label { font-weight: bold; background-color: #f0f0f0; white-space: nowrap; }
.entries-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
.entries-table th, .entries-table td { border: 1px solid #000; padding: 5px 6px; vertical-align: top; text-align: left; }
.entries-table th { background-color: #f0f0f0; font-weight: bold; }
.entries-table td.date-col { white-space: nowrap; }
.empty-note { text-align: center; padding: 18px; font-style: italic; color: #444; border: 1px solid #000; }
.signatories { display: flex; justify-content: space-between; margin-top: 45px; }
.sign-block { text-align: center; width: 45%; }
.sign-line { border-top: 1px solid #000; margin-top: 24px; padding-top: 3px; font-weight: bold; text-transform: uppercase; }
.sign-role { font-size: 9pt; }
</style>
</head>
<body>
${header}
<table class="identity-table">
  <tr>
    <td class="identity-label">Name of Learner</td>
    <td>${esc(fullName(student))}</td>
    <td class="identity-label">LRN</td>
    <td>${esc(student.lrn)}</td>
  </tr>
  <tr>
    <td class="identity-label">Grade &amp; Section</td>
    <td>${esc(gradeSection) || "—"}</td>
    <td class="identity-label">School Year</td>
    <td>${esc(schoolYear)}</td>
  </tr>
</table>
${bodyHtml}
<div class="signatories">
  <div class="sign-block">
    <div class="sign-line">${esc(adviserName) || "&nbsp;"}</div>
    <div class="sign-role">Class Adviser</div>
  </div>
  <div class="sign-block">
    <div class="sign-line">${esc(context.principalName) || "&nbsp;"}</div>
    <div class="sign-role">${esc(context.principalTitle) || "Principal"}</div>
  </div>
</div>
</body>
</html>`;
}
