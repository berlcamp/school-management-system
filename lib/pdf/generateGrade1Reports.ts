// Grade 1 — the two documents the issued SDO workbook gives that grade level.
//
//   * LEARNER'S PROGRESS REPORT CARD — the parent's copy. It carries NO grades:
//     three term blocks of narrative, the attendance record, the performance
//     level legend and the transfer certificates. Portrait, one page.
//   * PERFORMANCE AND COMPETENCY EVALUATION (PACE) FORM — five pages, one per
//     learning area, rating every competency A-E per term.
//
// They are one document in practice — the card says in as many words that the
// competency detail "is attached in the succeeding pages" — so the card prints
// the PACE pages behind it by default, while the PACE form can also be printed
// on its own for the adviser's own file.
//
// Nothing numeric appears anywhere in here, deliberately: Grade 1 does not
// report grades, so no general average, no transmutation, no descriptor band.
// The MAPEH / EPP-TLE grouping and `computeGeneralAverage` that the Grades
// 2-10 card runs on have no part to play.

import {
  GRADE1_ATTENDANCE_MONTHS,
  GRADE1_CARD_IMPORTANT_NOTE,
  GRADE1_CARD_INTRO,
  GRADE1_NARRATIVE_BLOCKS,
  PACE_GENERAL_INSTRUCTIONS,
  PACE_RATINGS,
  PACE_RATING_DESCRIPTIONS,
  PACE_RATING_LABELS,
  PACE_RATING_LABELS_FILIPINO,
  PACE_TERMS,
  PACE_TERM_LABELS_FILIPINO,
} from "@/lib/constants/pace";
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
  Grade1ProgressNarrative,
  PaceArea,
  PaceCompetency,
  PaceRating,
  PaceTerm,
} from "@/types";

export interface Grade1ReportParams {
  schoolId: string;
  studentId: string;
  sectionId: string;
  schoolYear: string;
}

interface MonthAttendance {
  term: PaceTerm;
  label: string;
  classDays: number;
  present: number;
  absent: number;
}

interface Grade1ReportData {
  school: { name: string; address: string; district: string; region: string };
  student: Record<string, string | number | null | undefined>;
  section: { name: string };
  adviserName: string;
  principalName: string;
  areas: PaceArea[];
  competencies: PaceCompetency[];
  /** competencyId -> term -> rating */
  ratings: Record<string, Partial<Record<PaceTerm, PaceRating>>>;
  /** term -> the two narrative blocks */
  narrative: Partial<Record<PaceTerm, { can_do: string; to_improve: string }>>;
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

/** Free text keeps the adviser's own line breaks on the printed card. */
function escMultiline(value: string | null | undefined): string {
  return esc(value).replace(/\n/g, "<br>");
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const [y, m, d] = String(dateString).slice(0, 10).split("-");
  if (!y || !m || !d) return "";
  return `${m}/${d}/${y}`;
}

/** Age in whole years and leftover months, as the card asks for it. */
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
 * Attendance per month on exactly the rules the attendance grid, SF2, the
 * report card and the Kindergarten card already use (migration 125): the
 * school calendar supplies the class-day denominator, and a date with no saved
 * row counts as present for every session held, because an adviser records
 * absences only.
 */
function aggregateAttendance(
  records: { date: string; am_present: boolean | null; pm_present: boolean | null }[],
  calendar: SchoolCalendarDay[],
  schoolYear: string,
): MonthAttendance[] {
  const [startYear, endYear] = schoolYear.split("-").map(Number);
  const byDate = new Map(records.map((r) => [r.date, r]));

  return GRADE1_ATTENDANCE_MONTHS.map(({ term, month, yearOffset, label }) => {
    const year = yearOffset === 0 ? startYear : endYear;
    const yearMonth = `${year}-${String(month).padStart(2, "0")}`;
    const days = getSchoolDaysInMonth(yearMonth, calendar);

    let present = 0;
    let absent = 0;
    days.forEach((day) => {
      const weight = sessionWeight(day);
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

async function fetchGrade1Data(
  params: Grade1ReportParams,
): Promise<Grade1ReportData> {
  const { schoolId, studentId, sectionId, schoolYear } = params;

  const [schoolRes, studentRes, sectionRes, areasRes, compsRes] = await Promise.all([
    supabase
      .from("sms_schools")
      .select("name, address, district, region")
      .eq("id", schoolId)
      .single(),
    supabase.from("sms_students").select("*").eq("id", studentId).single(),
    supabase
      .from("sms_sections")
      .select("name, section_adviser_id")
      .eq("id", sectionId)
      .single(),
    supabase
      .from("sms_pace_areas")
      .select("*")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("sms_pace_competencies")
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

  const [settings, ratingsRes, narrativeRes, attendanceRes, calendar] =
    await Promise.all([
      fetchSchoolSettings(schoolId),
      supabase
        .from("sms_pace_ratings")
        .select("competency_id, term, rating")
        .eq("student_id", studentId)
        .eq("section_id", sectionId)
        .eq("school_year", schoolYear),
      supabase
        .from("sms_grade1_progress_narratives")
        .select("term, can_do, to_improve")
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

  const ratings: Grade1ReportData["ratings"] = {};
  (ratingsRes.data || []).forEach((r) => {
    const cid = String(r.competency_id);
    ratings[cid] ??= {};
    ratings[cid][r.term as PaceTerm] = r.rating as PaceRating;
  });

  const narrative: Grade1ReportData["narrative"] = {};
  ((narrativeRes.data || []) as Partial<Grade1ProgressNarrative>[]).forEach((n) => {
    narrative[n.term as PaceTerm] = {
      can_do: n.can_do ?? "",
      to_improve: n.to_improve ?? "",
    };
  });

  return {
    school: schoolRes.data,
    student: studentRes.data,
    section: sectionRes.data,
    adviserName,
    principalName: settings.principal_name || "",
    areas: (areasRes.data || []) as PaceArea[],
    competencies: (compsRes.data || []) as PaceCompetency[],
    ratings,
    narrative,
    attendance: aggregateAttendance(attendanceRes.data || [], calendar, schoolYear),
    schoolYear,
  };
}

const SHARED_STYLES = `
@page { size: A4 portrait; margin: 0.35in; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: "Bookman Old Style", "Times New Roman", serif; font-size: 8.5pt; line-height: 1.25; color: #000; background: #fff; }
${DEPED_HEADER_LOGOS_STYLES}
.deped-header-with-logos { margin-bottom: 4px; padding-bottom: 3px; border-bottom: none; }
.deped-logo-img { width: 54px; height: 54px; }
.deped-logo-left-wrap, .deped-logo-right-wrap { width: 54px; }
.page { page-break-after: always; }
.page:last-child { page-break-after: auto; }
.form-title { text-align: center; font-size: 12pt; font-weight: bold; margin-top: 3px; text-transform: uppercase; }
.sy-line { text-align: center; font-size: 9pt; margin-bottom: 6px; }
.fill { display: inline-block; border-bottom: 1px solid #000; min-width: 60px; padding: 0 4px; }
.fill-lg { min-width: 230px; }
.fill-md { min-width: 130px; }
.fill-sm { min-width: 40px; text-align: center; }
.details div { margin-bottom: 3px; }
table { border-collapse: collapse; width: 100%; }
.tc { text-align: center; }
`;

/** One learning area's PACE page: the competency list with its T1/T2/T3 cells. */
function buildPacePage(
  area: PaceArea,
  competencies: PaceCompetency[],
  ratings: Grade1ReportData["ratings"],
  header: string,
): string {
  const items = competencies.filter((c) => String(c.area_id) === String(area.id));

  const rowHtml = (c: PaceCompetency): string => {
    if (c.is_heading) {
      return `<tr class="strand-row"><td colspan="5">${esc(c.description)}</td></tr>`;
    }
    const isParent = c.terms.length === 0;
    const cells = PACE_TERMS.map((t) => {
      // A term the issued form gives no cell for is blacked out rather than
      // left as an empty box somebody could write in.
      if (!c.terms.includes(t)) return `<td class="rating-col na"></td>`;
      return `<td class="rating-col rating-val">${esc(ratings[String(c.id)]?.[t] ?? "")}</td>`;
    }).join("");
    return `<tr>
      <td class="num-col">${esc(c.item_number ?? "")}</td>
      <td class="item-cell${isParent ? " parent" : ""}">${esc(c.description)}</td>
      ${cells}
    </tr>`;
  };

  // Split the list into the two printed columns at its own midpoint, on the
  // rendered row count rather than the seeded `print_column`: a DepEd revision
  // that adds items would otherwise leave one column short and the other
  // running off the page.
  const half = Math.ceil(items.length / 2);
  const columns = [items.slice(0, half), items.slice(half)];

  const tableHtml = (rows: PaceCompetency[]): string => `
    <table class="competency-table">
      <thead>
        <tr>
          <th class="num-col">No.</th>
          <th>Learning Competencies</th>
          <th class="rating-col" colspan="3">Rating</th>
        </tr>
        <tr>
          <th class="num-col"></th>
          <th></th>
          ${PACE_TERMS.map((t) => `<th class="rating-col">T${t}</th>`).join("")}
        </tr>
      </thead>
      <tbody>${rows.map(rowHtml).join("")}</tbody>
    </table>`;

  return `<div class="page">
  ${header}
  <div class="form-title">Performance and Competency Evaluation (PACE) Form</div>
  <div class="area-title">${esc(area.name)}</div>
  <div class="instructions"><span class="bold">General Instructions:</span> ${esc(PACE_GENERAL_INSTRUCTIONS)}</div>
  <div class="grid">
    <div>${tableHtml(columns[0])}</div>
    <div>${tableHtml(columns[1])}</div>
  </div>
</div>`;
}

function buildAttendanceTable(attendance: MonthAttendance[]): string {
  const rows = attendance
    .map((m, idx) => {
      const first = idx === 0 || attendance[idx - 1].term !== m.term;
      const rowSpan = attendance.filter((x) => x.term === m.term).length;
      return `<tr>
        ${first ? `<td class="tc term-col" rowspan="${rowSpan}">${m.term}</td>` : ""}
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
        <th>Term</th><th>Month</th><th>No. of Class Days</th>
        <th>No. Days Present</th><th>No. of Times Absent</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td colspan="2" class="tc">TOTAL</td>
        <td class="tc">${fmtDays(totals.classDays)}</td>
        <td class="tc">${fmtDays(totals.present)}</td>
        <td class="tc">${fmtDays(totals.absent)}</td>
      </tr>
    </tbody>
  </table>`;
}

/** The parent's card: narrative down the left, the reference blocks right. */
function buildCardPage(data: Grade1ReportData, header: string): string {
  const { student, section, adviserName, principalName, narrative, attendance, schoolYear } =
    data;

  const studentName = `${student.first_name || ""} ${student.middle_name || ""} ${student.last_name || ""} ${student.suffix || ""}`
    .replace(/\s+/g, " ")
    .trim();
  const [startYear, endYear] = schoolYear.split("-");
  const ageStart = ageYearsMonths(student.date_of_birth as string | null, `${startYear}-06-01`);
  const ageEnd = ageYearsMonths(student.date_of_birth as string | null, `${endYear}-03-31`);

  const termBlocks = PACE_TERMS.map(
    (t) => `<div class="term-block">
      <div class="term-head">Term ${t} (${PACE_TERM_LABELS_FILIPINO[t].toUpperCase()})</div>
      ${GRADE1_NARRATIVE_BLOCKS.map(
        (block) => `<div class="narrative-row">
          <div class="narrative-label">${block.title}<br><span class="fil">(${block.filipino})</span></div>
          <div class="narrative-body">${escMultiline(narrative[t]?.[block.key] ?? "")}</div>
        </div>`,
      ).join("")}
      <div class="parent-sig">Parent&rsquo;s/Guardian&rsquo;s Signature: <span class="fill fill-md"></span></div>
    </div>`,
  ).join("");

  const legendRows = PACE_RATINGS.map(
    (r) => `<tr>
      <td class="tc bold">${r}</td>
      <td>${PACE_RATING_LABELS[r]}<br><span class="fil">(${PACE_RATING_LABELS_FILIPINO[r]})</span></td>
      <td class="desc">${PACE_RATING_DESCRIPTIONS[r]}</td>
    </tr>`,
  ).join("");

  return `<div class="page">
  ${header}
  <div class="form-title">Learner&rsquo;s Progress Report Card</div>
  <div class="sy-line">School Year ${esc(schoolYear)}</div>

  <div class="details">
    <div>Name: <span class="fill fill-lg">${esc(studentName)}</span>
      LRN: <span class="fill fill-md">${esc(String(student.lrn ?? ""))}</span></div>
    <div>Section: <span class="fill fill-md">${esc(section.name)}</span>
      Teacher: <span class="fill fill-md">${esc(adviserName)}</span>
      Birthdate: <span class="fill fill-md">${formatDate(student.date_of_birth as string)}</span></div>
    <div>Age of the Child (Beginning of SY): Years: <span class="fill fill-sm">${ageStart.years}</span>
      Months: <span class="fill fill-sm">${ageStart.months}</span>
      &nbsp;&nbsp;(End of SY): Years: <span class="fill fill-sm">${ageEnd.years}</span>
      Months: <span class="fill fill-sm">${ageEnd.months}</span></div>
  </div>

  ${GRADE1_CARD_INTRO.map((p) => `<p class="intro">${p}</p>`).join("")}

  <div class="card-grid">
    <div class="card-left">${termBlocks}</div>
    <div class="card-right">
      <div class="block-title">Attendance Record</div>
      ${buildAttendanceTable(attendance)}

      <div class="block-title">Important Note to Parents/Guardians</div>
      <p class="note">${GRADE1_CARD_IMPORTANT_NOTE}</p>

      <div class="block-title">Performance levels used in monitoring:</div>
      <table class="legend-table">
        <thead><tr><th>Letter Grade</th><th>Descriptor</th><th>Description</th></tr></thead>
        <tbody>${legendRows}</tbody>
      </table>

      <div class="block-title">Certificate of Transfer</div>
      <p class="note">This is to certify that the above-named learner has satisfactorily
        completed the requirements for the grade level indicated.</p>
      <div class="cert-line">Admitted to Grade: <span class="fill fill-md"></span></div>
      <div class="cert-line">Eligible for Admission to Grade: <span class="fill fill-md"></span></div>
      <div class="cert-line">Approved:</div>
      <div class="sig-row">
        <div class="sig-block">
          <div class="sig-name">${esc(adviserName) || "&nbsp;"}</div>
          <div class="sig-title">Adviser</div>
        </div>
        <div class="sig-block">
          <div class="sig-name">${esc(principalName) || "&nbsp;"}</div>
          <div class="sig-title">School Head</div>
        </div>
      </div>

      <div class="block-title">Cancellation of Eligibility to Transfer</div>
      <div class="cert-line">Admitted in: <span class="fill fill-md"></span>
        Date: <span class="fill fill-sm"></span></div>
      <div class="sig-row one">
        <div class="sig-block">
          <div class="sig-name">&nbsp;</div>
          <div class="sig-title">School Head</div>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

function buildHeader(data: Grade1ReportData): string {
  const { school } = data;
  return buildDepEdHeaderWithLogos(`
    <div>Republic of the Philippines</div>
    <div class="bold">Department of Education</div>
    <div>${esc(school.region || "Region ______")}</div>
    <div class="bold">Schools Division Office of ${esc(school.district || "______")}</div>
    <div>${esc(school.address || "")}</div>
    <div class="bold" style="margin-top:3px">${esc(school.name)}</div>
  `);
}

function buildDocument(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
${SHARED_STYLES}
.bold { font-weight: bold; }
.fil { font-style: italic; font-size: 7.5pt; }
.area-title { text-align: center; font-size: 10pt; font-weight: bold; margin-bottom: 4px; }
.instructions { font-size: 7pt; text-align: justify; border: 1px solid #000; padding: 4px 6px; margin-bottom: 6px; }

/* PACE page — two independent halves side by side, as the form prints them */
.grid { display: flex; gap: 8px; align-items: flex-start; }
.grid > div { flex: 1; min-width: 0; }
.competency-table { font-size: 6.8pt; }
.competency-table th, .competency-table td { border: 1px solid #000; padding: 1px 3px; vertical-align: top; }
.competency-table th { text-align: center; font-size: 7pt; }
.num-col { width: 16px; text-align: center; }
.rating-col { width: 17px; text-align: center; }
.rating-val { font-weight: bold; font-size: 7.5pt; }
.na { background: repeating-linear-gradient(45deg,#fff,#fff 2px,#d9d9d9 2px,#d9d9d9 4px); }
.item-cell { text-align: left; }
.item-cell.parent { font-weight: bold; }
.strand-row td { font-weight: bold; background: #e8e8e8; }

/* Card page */
.intro { font-size: 7.5pt; text-align: justify; margin-bottom: 4px; }
.card-grid { display: flex; gap: 10px; align-items: flex-start; margin-top: 4px; }
.card-left { flex: 1.1; min-width: 0; }
.card-right { flex: 1; min-width: 0; }
.term-block { border: 1px solid #000; margin-bottom: 6px; }
.term-head { font-weight: bold; font-size: 8pt; text-align: center; border-bottom: 1px solid #000; padding: 2px; background: #f0f0f0; }
.narrative-row { display: flex; border-bottom: 1px solid #000; }
.narrative-label { width: 34%; border-right: 1px solid #000; padding: 3px 4px; font-size: 7.2pt; font-weight: bold; }
.narrative-body { flex: 1; padding: 3px 4px; min-height: 52px; font-size: 7.5pt; }
.parent-sig { padding: 3px 4px; font-size: 7.5pt; }
.block-title { font-weight: bold; font-size: 8pt; text-transform: uppercase; margin: 6px 0 3px; }
.attendance-table, .legend-table { font-size: 7pt; }
.attendance-table th, .attendance-table td, .legend-table th, .legend-table td { border: 1px solid #000; padding: 1px 3px; }
.attendance-table th, .legend-table th { text-align: center; font-size: 7pt; background: #f0f0f0; }
.attendance-table .total-row td { font-weight: bold; background: #f0f0f0; }
.term-col { font-weight: bold; vertical-align: middle; }
.legend-table .desc { font-size: 6.6pt; text-align: justify; }
.note { font-size: 7.2pt; text-align: justify; }
.cert-line { font-size: 7.5pt; margin-top: 3px; }
.sig-row { display: flex; gap: 10px; margin-top: 12px; }
.sig-row.one { justify-content: flex-start; }
.sig-block { flex: 1; text-align: center; }
.sig-name { border-bottom: 1px solid #000; font-weight: bold; font-size: 7.5pt; }
.sig-title { font-size: 7pt; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/** The PACE form on its own: five pages, one per learning area. */
export async function generatePaceFormPrint(
  params: Grade1ReportParams,
): Promise<void> {
  const data = await fetchGrade1Data(params);
  const header = buildHeader(data);
  const studentName = `${data.student.last_name || ""}, ${data.student.first_name || ""}`.trim();
  const pages = data.areas
    .map((area) => buildPacePage(area, data.competencies, data.ratings, header))
    .join("\n");
  printHTMLContent(buildDocument(`PACE Form - ${esc(studentName)}`, pages));
}

/**
 * The Grade 1 card, with the PACE pages attached behind it — which is what the
 * card's own "Important Note to Parents/Guardians" promises. Pass
 * `includePace: false` for the card alone.
 */
export async function generateGrade1ProgressCardPrint(
  params: Grade1ReportParams & { includePace?: boolean },
): Promise<void> {
  const data = await fetchGrade1Data(params);
  const header = buildHeader(data);
  const studentName = `${data.student.last_name || ""}, ${data.student.first_name || ""}`.trim();

  const pages = [
    buildCardPage(data, header),
    ...(params.includePace === false
      ? []
      : data.areas.map((area) =>
          buildPacePage(area, data.competencies, data.ratings, header),
        )),
  ].join("\n");

  printHTMLContent(
    buildDocument(`Learner's Progress Report Card - ${esc(studentName)}`, pages),
  );
}
