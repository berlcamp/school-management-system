import {
  KINDER_ATTENDANCE_MONTHS,
  KINDER_PROGRESS_INTRO,
  KINDER_PROGRESS_TERMS,
  KINDER_RATING_INDICATORS,
  KINDER_RATING_LABELS,
  KINDER_TERM_LABELS,
  KINDER_TERM_LABELS_FILIPINO,
} from "@/lib/constants/kinderProgress";
import {
  buildDepEdHeaderWithLogos,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";
import {
  countSchoolDays,
  fetchSchoolCalendar,
  getSchoolDaysInMonth,
  sessionWeight,
  type SchoolCalendarDay,
} from "@/lib/utils/schoolCalendar";
import { fetchSchoolSettings } from "@/lib/utils/schoolSettings";
import type {
  KinderProgressCompetency,
  KinderProgressDomain,
  KinderProgressRating,
  KinderProgressTerm,
} from "@/types";

/**
 * KINDERGARTEN PROGRESS REPORT (migration 172)
 *
 * A facsimile of the SDO Bayugan City issued form, two pages:
 *
 *   Page 1 — DepEd header, learner details, the explanatory paragraph, and the
 *            two-column competency grid with a T1/T2/T3 rating cell per item.
 *   Page 2 — TEACHER'S COMMENTS/REMARKS (three term blocks, each with the
 *            parent's signature line) beside the ATTENDANCE RECORD; the rating
 *            scale legend; and the CERTIFICATE OF TRANSFER.
 *
 * Printed as HTML rather than jsPDF, matching every other card in this folder
 * (the report card, the ECCD card): the form is a flowing table whose rows
 * depend on how many competencies the division has on the list, not a
 * millimetre-exact sheet like 132's OMR answer sheet.
 *
 * NOTHING IS COMPUTED FROM THE RATINGS. The form carries no average, no total
 * and no promotion decision — an unrated competency simply prints an empty
 * cell, which is what a card printed mid-year is supposed to look like.
 */

/**
 * The two division lines of the issued letterhead.
 *
 * `sms_schools` carries a district (e.g. "North District") and the school's own
 * address, neither of which is the division office — printing `district` here
 * would put "NORTH DISTRICT" where the form says the division. Nothing in the
 * schema holds a division name, and the system serves exactly one division, so
 * the form's own wording is reproduced.
 */
const SDO_NAME = "Schools Division Office of Bayugan City";
const SDO_ADDRESS = "Bayugan City, Agusan del Sur";

export interface KinderProgressReportParams {
  schoolId: string;
  studentId: string;
  sectionId: string;
  schoolYear: string;
  /**
   * Terms to print a rating column for. Defaults to all three: the issued form
   * is a single card carried through the year, not one sheet per term.
   */
  terms?: KinderProgressTerm[];
}

export interface MonthAttendance {
  term: KinderProgressTerm;
  label: string;
  classDays: number;
  present: number;
  absent: number;
}

export interface KinderProgressReportData {
  school: { name: string; address: string; district: string; region: string };
  student: Record<string, string | number | null | undefined>;
  section: { name: string };
  adviserName: string;
  principalName: string;
  principalTitle: string;
  domains: KinderProgressDomain[];
  competencies: KinderProgressCompetency[];
  /** competencyId -> term -> rating */
  ratings: Record<string, Partial<Record<KinderProgressTerm, KinderProgressRating>>>;
  remarks: Partial<Record<KinderProgressTerm, string>>;
  attendance: MonthAttendance[];
  schoolYear: string;
}

/** HTML-escapes adviser free text before it reaches the printed page. */
function esc(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const [y, m, d] = String(dateString).slice(0, 10).split("-");
  if (!y || !m || !d) return "";
  return `${m}/${d}/${y}`;
}

/**
 * Age in whole years and the leftover months, which is what the form asks for
 * ("Years____ Months____") — Kindergarten entry is age-gated to the month, so
 * the years alone would not answer the question.
 */
function ageYearsMonths(
  dob: string | null | undefined,
  refDate: string,
): { years: string; months: string } {
  if (!dob) return { years: "", months: "" };
  const [by, bm, bd] = String(dob).slice(0, 10).split("-").map(Number);
  const [ry, rm, rd] = refDate.split("-").map(Number);
  if (!by || !ry) return { years: "", months: "" };

  let years = ry - by;
  let months = rm - bm;
  if (rd < bd) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return { years: "", months: "" };
  return { years: String(years), months: String(months) };
}

/**
 * Attendance per month on exactly the rules the attendance grid, SF2 and the
 * report card already use (migration 125): the school calendar is the class-day
 * denominator, and a date with no saved row counts as present for every session
 * held, because an adviser records absences only.
 */
function aggregateAttendance(
  records: { date: string; am_present: boolean | null; pm_present: boolean | null }[],
  calendar: SchoolCalendarDay[],
  schoolYear: string,
): MonthAttendance[] {
  const [startYear, endYear] = schoolYear.split("-").map(Number);
  const byDate = new Map(records.map((r) => [r.date, r]));

  return KINDER_ATTENDANCE_MONTHS.map(({ term, month, yearOffset, label }) => {
    const year = yearOffset === 0 ? startYear : endYear;
    const yearMonth = `${year}-${String(month).padStart(2, "0")}`;
    const days = getSchoolDaysInMonth(yearMonth, calendar);

    let present = 0;
    let absent = 0;
    days.forEach((day) => {
      const weight = sessionWeight(day); // 1, or 0.5 for a half-day suspension
      const record = byDate.get(day.date);
      const value = record
        ? (day.am && record.am_present ? 0.5 : 0) + (day.pm && record.pm_present ? 0.5 : 0)
        : weight;
      present += value;
      absent += weight - value;
    });

    return { term, label, classDays: countSchoolDays(days), present, absent };
  });
}

/** Whole numbers print bare; a half-day shows its .5. A zero prints blank. */
function fmtDays(value: number): string {
  if (!value) return "";
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

async function fetchReportData(
  params: KinderProgressReportParams,
): Promise<KinderProgressReportData> {
  const { schoolId, studentId, sectionId, schoolYear } = params;

  const [schoolRes, studentRes, sectionRes, domainsRes, compsRes] = await Promise.all([
    supabase.from("sms_schools").select("name, address, district, region").eq("id", schoolId).single(),
    supabase.from("sms_students").select("*").eq("id", studentId).single(),
    supabase.from("sms_sections").select("name, section_adviser_id").eq("id", sectionId).single(),
    supabase
      .from("sms_kinder_progress_domains")
      .select("*")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("sms_kinder_progress_competencies")
      .select("*")
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  if (!schoolRes.data) throw new Error("School not found");
  if (!studentRes.data) throw new Error("Student not found");
  if (!sectionRes.data) throw new Error("Section not found");

  let adviserName = "";
  if (sectionRes.data.section_adviser_id) {
    const { data: adviser } = await supabase
      .from("sms_users")
      .select("name")
      .eq("id", sectionRes.data.section_adviser_id)
      .single();
    adviserName = adviser?.name || "";
  }

  const [settings, ratingsRes, remarksRes, attendanceRes, calendar] = await Promise.all([
    fetchSchoolSettings(schoolId),
    supabase
      .from("sms_kinder_progress_ratings")
      .select("competency_id, term, rating")
      .eq("student_id", studentId)
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear),
    supabase
      .from("sms_kinder_progress_remarks")
      .select("term, remarks")
      .eq("student_id", studentId)
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear),
    supabase
      .from("sms_attendance")
      .select("date, am_present, pm_present")
      .eq("student_id", studentId)
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear),
    fetchSchoolCalendar(schoolId, schoolYear),
  ]);

  const ratings: KinderProgressReportData["ratings"] = {};
  (ratingsRes.data || []).forEach((r) => {
    const cid = String(r.competency_id);
    ratings[cid] ??= {};
    ratings[cid][r.term as KinderProgressTerm] = r.rating as KinderProgressRating;
  });

  const remarks: KinderProgressReportData["remarks"] = {};
  (remarksRes.data || []).forEach((r) => {
    remarks[r.term as KinderProgressTerm] = (r.remarks as string) ?? "";
  });

  return {
    school: schoolRes.data,
    student: studentRes.data,
    section: sectionRes.data,
    adviserName,
    principalName: settings.principal_name || "",
    principalTitle: settings.principal_title || "Principal",
    domains: (domainsRes.data || []) as KinderProgressDomain[],
    competencies: (compsRes.data || []) as KinderProgressCompetency[],
    ratings,
    remarks,
    attendance: aggregateAttendance(attendanceRes.data || [], calendar, schoolYear),
    schoolYear,
  };
}

/**
 * One half of the printed competency grid: the domains assigned to that column,
 * each opening with its own banner row and running its items beneath.
 *
 * Both halves are rendered as one table each so their rows line up on the page
 * without the two columns having to hold the same number of items — the left
 * column runs out well before domain IV does, which is why the form is laid out
 * this way in the first place.
 */
function buildCompetencyColumn(
  domains: KinderProgressDomain[],
  competencies: KinderProgressCompetency[],
  ratings: KinderProgressReportData["ratings"],
  terms: KinderProgressTerm[],
): string {
  const termHeaders = terms.map((t) => `<th class="rating-col">T${t}</th>`).join("");

  const rows = domains
    .map((domain) => {
      const items = competencies.filter((c) => String(c.domain_id) === String(domain.id));
      const banner = `<tr class="domain-row">
          <td colspan="${terms.length + 1}">${domain.numeral}.${esc(domain.name)}</td>
        </tr>`;

      // Only rated items are numbered, and only in the domains the form numbers,
      // so a strand heading never consumes a number.
      let itemNo = 0;
      const body = items
        .map((c) => {
          if (c.is_heading) {
            return `<tr class="strand-row">
              <td class="strand-cell indent-${c.indent_level}">${esc(c.description)}</td>
              ${terms.map(() => '<td class="rating-col"></td>').join("")}
            </tr>`;
          }
          itemNo += 1;
          const prefix = domain.numbered_items ? `${itemNo}.` : "";
          const cells = terms
            .map(
              (t) =>
                `<td class="rating-col rating-val">${ratings[String(c.id)]?.[t] ?? ""}</td>`,
            )
            .join("");
          return `<tr>
            <td class="item-cell">${prefix}${esc(c.description)}</td>
            ${cells}
          </tr>`;
        })
        .join("");

      return banner + body;
    })
    .join("");

  return `<table class="competency-table">
    <thead>
      <tr>
        <th rowspan="2" class="competency-head">Competency</th>
        <th colspan="${terms.length}" class="rating-head">Rating</th>
      </tr>
      <tr>${termHeaders}</tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildAttendanceTable(attendance: MonthAttendance[]): string {
  let lastTerm: KinderProgressTerm | null = null;
  const rows = attendance
    .map((m) => {
      // The term number is printed once, on its first month, exactly as issued.
      const termCell = m.term === lastTerm ? "" : String(m.term);
      lastTerm = m.term;
      return `<tr>
        <td class="tc">${termCell}</td>
        <td>${m.label}</td>
        <td class="tc">${fmtDays(m.classDays)}</td>
        <td class="tc">${fmtDays(m.present)}</td>
        <td class="tc">${fmtDays(m.absent)}</td>
      </tr>`;
    })
    .join("");

  const totals = attendance.reduce(
    (acc, m) => ({
      classDays: acc.classDays + m.classDays,
      present: acc.present + m.present,
      absent: acc.absent + m.absent,
    }),
    { classDays: 0, present: 0, absent: 0 },
  );

  return `<table class="attendance-table">
    <thead>
      <tr>
        <th>Term</th>
        <th>Month</th>
        <th>No. of Class Days</th>
        <th>No. of Days Present</th>
        <th>No. of Times absent</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td colspan="2" class="tc">Total</td>
        <td class="tc">${fmtDays(totals.classDays)}</td>
        <td class="tc">${fmtDays(totals.present)}</td>
        <td class="tc">${fmtDays(totals.absent)}</td>
      </tr>
    </tbody>
  </table>`;
}

function buildRemarksBlocks(remarks: KinderProgressReportData["remarks"]): string {
  return KINDER_PROGRESS_TERMS.map((term) => {
    const body = esc(remarks[term]).replace(/\n/g, "<br>");
    return `<div class="remark-block">
      <div class="remark-term">${KINDER_TERM_LABELS[term].toUpperCase()} (${KINDER_TERM_LABELS_FILIPINO[term]})</div>
      <div class="remark-body">${body}</div>
      <div class="remark-sig">Parent&rsquo;s/ Guardian&rsquo;s Signature: <span class="sig-rule"></span></div>
    </div>`;
  }).join("");
}

function buildRatingLegend(): string {
  const rows = KINDER_RATING_INDICATORS.map(
    ({ rating, indicators }) => `<tr>
      <td class="legend-rating">${KINDER_RATING_LABELS[rating]}<br>(${rating})</td>
      <td>${indicators.map((i) => `*${esc(i)}`).join("<br>")}</td>
    </tr>`,
  ).join("");

  return `<table class="legend-table">
    <thead><tr><th style="width:22%">Rating</th><th>Indicators</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/**
 * The printed card as HTML, given already-fetched data.
 *
 * Kept separate from the fetch so the layout can be rendered and inspected
 * without a browser session — the shape of this form is the deliverable, and a
 * regression in it is not something a type check would catch.
 */
export function buildKinderProgressReportHtml(
  data: KinderProgressReportData,
  terms: KinderProgressTerm[] = KINDER_PROGRESS_TERMS,
): string {
  const {
    school,
    student,
    section,
    adviserName,
    principalName,
    principalTitle,
    domains,
    competencies,
    ratings,
    remarks,
    attendance,
    schoolYear,
  } = data;

  const studentName = `${student.first_name || ""} ${student.middle_name || ""} ${student.last_name || ""} ${student.suffix || ""}`
    .replace(/\s+/g, " ")
    .trim();
  const dob = student.date_of_birth as string | null;
  const [startYear, endYear] = schoolYear.split("-");
  // Same reference dates the ECCD card already uses for its own age columns.
  const ageStart = ageYearsMonths(dob, `${startYear}-06-01`);
  const ageEnd = ageYearsMonths(dob, `${endYear}-03-31`);

  const leftDomains = domains.filter((d) => d.print_column === 1);
  const rightDomains = domains.filter((d) => d.print_column === 2);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Kindergarten Progress Report - ${esc(studentName)}</title>
<style>
@page { size: 8.5in 13in; margin: 0.4in 0.5in; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: "Times New Roman", serif; font-size: 9pt; line-height: 1.25; color: #000; background: #fff; }

${DEPED_HEADER_LOGOS_STYLES}
.deped-header-with-logos { margin-bottom: 6px; padding-bottom: 4px; border-bottom: none; }
.deped-logo-img { width: 62px; height: 62px; }
.deped-logo-left-wrap, .deped-logo-right-wrap { width: 62px; }

.page { page-break-after: always; }
.page:last-child { page-break-after: auto; }

.form-title { text-align: center; font-size: 13pt; font-weight: bold; margin-top: 4px; text-transform: uppercase; }
.sy-line { text-align: center; font-size: 10pt; margin-bottom: 8px; }
.school-line { font-size: 9pt; margin-top: 4px; }

/* Learner details */
.details { font-size: 9.5pt; margin-bottom: 6px; }
.details div { margin-bottom: 3px; }
.fill { display: inline-block; border-bottom: 1px solid #000; min-width: 60px; padding: 0 4px; }
.fill-lg { min-width: 250px; }
.fill-md { min-width: 150px; }
.fill-sm { min-width: 45px; text-align: center; }

.intro { font-size: 8.5pt; text-align: justify; border: 1px solid #000; padding: 5px 7px; margin-bottom: 8px; }

/* Competency grid — two independent halves side by side */
.grid { display: flex; gap: 8px; align-items: flex-start; }
.grid > div { flex: 1; min-width: 0; }
.competency-table { width: 100%; border-collapse: collapse; font-size: 7.5pt; }
.competency-table th, .competency-table td { border: 1px solid #000; padding: 1px 3px; vertical-align: top; }
.competency-head { text-align: center; font-size: 8pt; }
.rating-head { text-align: center; font-size: 8pt; }
.rating-col { width: 22px; text-align: center; }
.rating-val { font-weight: bold; font-size: 8pt; }
.item-cell { text-align: left; }
.domain-row td { font-weight: bold; background: #e8e8e8; font-size: 8pt; }
.strand-row td { font-weight: bold; }
.strand-cell.indent-1 { padding-left: 12px; }
.strand-cell.indent-2 { padding-left: 22px; }

/* Page 2 */
.section-head { font-weight: bold; font-size: 9.5pt; margin-bottom: 3px; text-transform: uppercase; }
.section-note { font-size: 8pt; font-style: italic; margin-bottom: 5px; }
.two-col { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
.col-comments { flex: 1.15; min-width: 0; }
.col-attendance { flex: 1; min-width: 0; }

.remark-block { border: 1px solid #000; padding: 5px 7px; margin-bottom: 6px; min-height: 84px; }
.remark-term { font-weight: bold; font-size: 8.5pt; margin-bottom: 3px; }
.remark-body { font-size: 8.5pt; min-height: 34px; white-space: pre-wrap; }
.remark-sig { font-size: 8.5pt; margin-top: 8px; }
.sig-rule { display: inline-block; border-bottom: 1px solid #000; min-width: 150px; }

.attendance-table { width: 100%; border-collapse: collapse; font-size: 8pt; }
.attendance-table th, .attendance-table td { border: 1px solid #000; padding: 2px 4px; }
.attendance-table th { text-align: center; font-size: 7.5pt; }
.attendance-table .tc { text-align: center; }
.attendance-table .total-row td { font-weight: bold; background: #f0f0f0; }

.legend-table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-bottom: 12px; }
.legend-table th, .legend-table td { border: 1px solid #000; padding: 3px 5px; text-align: left; vertical-align: top; }
.legend-table th { background: #e8e8e8; text-align: center; }
.legend-rating { font-weight: bold; text-align: center; }

.cert { border: 1px solid #000; padding: 10px 14px; }
.cert-title { text-align: center; font-weight: bold; font-size: 10pt; margin-bottom: 6px; text-transform: uppercase; }
.cert-body { font-size: 9.5pt; text-align: center; margin-bottom: 16px; }
/* Stacked and right-aligned, as the issued certificate has them. */
.cert-sigs { display: flex; flex-direction: column; align-items: flex-end; gap: 14px; }
.sig-block { text-align: center; min-width: 230px; }
.sig-name { border-top: 1px solid #000; padding-top: 2px; font-weight: bold; font-size: 9pt; text-transform: uppercase; }
.sig-title { font-size: 8.5pt; }

@media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style>
</head>
<body>

<!-- PAGE 1 -->
<div class="page">
  ${buildDepEdHeaderWithLogos(`
    <div style="font-size:9pt">Republic of the Philippines</div>
    <div style="font-size:9pt">Department of Education</div>
    <div style="font-size:9pt">${esc(school.region) || "CARAGA Region"}</div>
    <div style="font-size:10pt;font-weight:bold;text-transform:uppercase">${SDO_NAME}</div>
    <div style="font-size:9pt">${SDO_ADDRESS}</div>
    <div class="school-line">School: <span class="fill fill-md">${esc(school.name)}</span></div>
  `)}

  <div class="form-title">Kindergarten Progress Report</div>
  <div class="sy-line">School Year ${esc(schoolYear)}</div>

  <div class="details">
    <div>
      Name: <span class="fill fill-lg">${esc(studentName)}</span>
      &nbsp;&nbsp;LRN: <span class="fill fill-md">${esc(String(student.lrn ?? ""))}</span>
    </div>
    <div>
      Section: <span class="fill fill-md">${esc(section.name)}</span>
      &nbsp;&nbsp;Teacher: <span class="fill fill-md">${esc(adviserName)}</span>
      &nbsp;&nbsp;Birthdate: <span class="fill fill-md">${formatDate(dob)}</span>
    </div>
    <div>
      Age of the child (Beginning of SY): Years <span class="fill fill-sm">${ageStart.years}</span>
      Months <span class="fill fill-sm">${ageStart.months}</span>
    </div>
    <div>
      Age of the child (End of SY): Years <span class="fill fill-sm">${ageEnd.years}</span>
      Months <span class="fill fill-sm">${ageEnd.months}</span>
    </div>
  </div>

  <div class="intro">${KINDER_PROGRESS_INTRO}</div>

  <div class="grid">
    <div>${buildCompetencyColumn(leftDomains, competencies, ratings, terms)}</div>
    <div>${buildCompetencyColumn(rightDomains, competencies, ratings, terms)}</div>
  </div>
</div>

<!-- PAGE 2 -->
<div class="page">
  <div class="two-col">
    <div class="col-comments">
      <div class="section-head">Teacher&rsquo;s Comments/Remarks</div>
      <div class="section-note">(Provide specific observations, strengths, and suggested interventions)</div>
      ${buildRemarksBlocks(remarks)}
    </div>
    <div class="col-attendance">
      <div class="section-head">Attendance Record</div>
      ${buildAttendanceTable(attendance)}
    </div>
  </div>

  <div class="section-head">Important Note to Parents/Guardians</div>
  <div class="section-note">This rating scale is used to record the learner&rsquo;s level of attainment for each competency across the developmental domains. It guides teachers in assigning ratings based on observed performance and assessment results for each item.</div>
  ${buildRatingLegend()}

  <div class="cert">
    <div class="cert-title">Certificate of Transfer</div>
    <div class="cert-body">
      This is to certify that <span class="fill fill-lg">${esc(studentName)}</span>
      of <span class="fill fill-md">${esc(school.name)}</span> has developed the general
      competencies based on the Kindergarten Curriculum Guide.
    </div>
    <div class="cert-sigs">
      <div class="sig-block">
        <div class="sig-name">${esc(adviserName) || "&nbsp;"}</div>
        <div class="sig-title">Adviser</div>
      </div>
      <div class="sig-block">
        <div class="sig-name">${esc(principalName) || "&nbsp;"}</div>
        <div class="sig-title">School Head${principalTitle && principalTitle !== "School Head" ? ` &mdash; ${esc(principalTitle)}` : ""}</div>
      </div>
    </div>
  </div>
</div>

</body>
</html>`;
}

export async function generateKinderProgressReportPrint(
  params: KinderProgressReportParams,
): Promise<void> {
  const data = await fetchReportData(params);
  printHTMLContent(
    buildKinderProgressReportHtml(
      data,
      params.terms?.length ? params.terms : KINDER_PROGRESS_TERMS,
    ),
  );
}
