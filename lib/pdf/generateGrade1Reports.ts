// Grade 1 — the two documents the issued SDO workbook gives that grade level.
//
//   * LEARNER'S PROGRESS REPORT CARD — the parent's copy. It carries NO grades:
//     three term blocks of narrative, the attendance record, the performance
//     level legend and the transfer certificates. Portrait, one page.
//   * PERFORMANCE AND COMPETENCY EVALUATION (PACE) FORM — five pages, one per
//     learning area, rating every competency A-E per term.
//
// Since migration 205 the PACE pages follow the UPDATED workbook: Reading and
// Literacy and Language print one coloured square per language macro skill
// (yellow Listening, purple Speaking, orange Reading, green Copying and Guided
// Writing) with the colour key beneath, greyed where the term is not rated;
// Mathematics, GMRC and Makabansa print one full-width list under Term 1/2/3
// headings with a single Rating column, GMRC adding its Performance Standard.
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

import { letterheadRegion } from "@/lib/constants/letterhead";
import {
  GRADE1_CARD_IMPORTANT_NOTE,
  GRADE1_CARD_INTRO,
  GRADE1_NARRATIVE_BLOCKS,
  PACE_GENERAL_INSTRUCTIONS,
  PACE_MACRO_SKILLS,
  PACE_MACRO_SKILL_COLORS,
  PACE_MACRO_SKILL_LABELS,
  PACE_MACRO_SKILL_NOTE,
  PACE_RATINGS,
  PACE_RATING_DESCRIPTIONS,
  PACE_RATING_LABELS,
  PACE_RATING_LABELS_FILIPINO,
  PACE_TERMS,
  PACE_TERM_LABELS,
  PACE_TERM_LABELS_FILIPINO,
  ratingSlots,
} from "@/lib/constants/pace";
import {
  buildDepEdHeaderWithLogos,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";
import {
  ageYearsMonths,
  aggregateGrade1Attendance,
  fmtDays,
  grade1AgeReferenceDates,
  type MonthAttendance,
} from "@/lib/utils/grade1Workbook";
import { fetchSchoolCalendar } from "@/lib/utils/schoolCalendar";
import { fetchSchoolSettings } from "@/lib/utils/schoolSettings";
import { fetchTermDates } from "@/lib/utils/termDates";
import type {
  Grade1ProgressNarrative,
  PaceArea,
  PaceCompetency,
  PaceMacroSkill,
  PaceRating,
  PaceTerm,
} from "@/types";

export interface Grade1ReportParams {
  schoolId: string;
  studentId: string;
  sectionId: string;
  schoolYear: string;
}

export interface Grade1ReportData {
  school: { name: string; address: string; district: string; region: string };
  student: Record<string, string | number | null | undefined>;
  section: { name: string };
  adviserName: string;
  principalName: string;
  areas: PaceArea[];
  competencies: PaceCompetency[];
  /** cellKey(competency, term, square) -> rating */
  ratings: Record<string, PaceRating>;
  /** term -> the two narrative blocks */
  narrative: Partial<Record<PaceTerm, { can_do: string; to_improve: string }>>;
  attendance: MonthAttendance[];
  schoolYear: string;
}

/** One printed square: competency, term and macro skill (null = whole). */
const cellKey = (competencyId: string, term: PaceTerm, skill: PaceMacroSkill | null) =>
  `${competencyId}:${term}:${skill ?? ""}`;

/** The fill of a square the form does not rate that term (the sheet's grey). */
const GREY_SQUARE = "#BFBFBF";

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

  const [settings, ratingsRes, narrativeRes, attendanceRes, calendar, termDates] =
    await Promise.all([
      fetchSchoolSettings(schoolId),
      supabase
        .from("sms_pace_ratings")
        .select("competency_id, term, macro_skill, rating")
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
      fetchTermDates(schoolId, schoolYear),
    ]);

  const ratings: Grade1ReportData["ratings"] = {};
  (ratingsRes.data || []).forEach((r) => {
    ratings[
      cellKey(
        String(r.competency_id),
        r.term as PaceTerm,
        (r.macro_skill as PaceMacroSkill | null) ?? null,
      )
    ] = r.rating as PaceRating;
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
    attendance: aggregateGrade1Attendance(
      attendanceRes.data || [],
      calendar,
      schoolYear,
      undefined,
      termDates,
    ),
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

/** The LRN / Name / Section line under the title of every PACE page. */
function buildLearnerLine(data: Grade1ReportData): string {
  const { student, section } = data;
  const name = `${student.last_name || ""}, ${student.first_name || ""} ${student.middle_name || ""} ${student.suffix || ""}`
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^,\s*/, "");
  return `<div class="learner-line">
    <span>LRN: <span class="fill fill-md">${esc(String(student.lrn ?? ""))}</span></span>
    <span>Name: <span class="fill fill-lg">${esc(name)}</span></span>
    <span>Section: <span class="fill fill-md">${esc(section.name)}</span></span>
  </div>`;
}

/**
 * Reading and Literacy / Language: the continuous list in two halves, each
 * competency one printed line per macro-skill square. A square carries the
 * skill's colour in the terms it is rated and the sheet's grey in the others,
 * with the rating written on it — "write the learner's rating directly on the
 * colored square for each term".
 */
function buildContinuousPage(
  items: PaceCompetency[],
  ratings: Grade1ReportData["ratings"],
): string {
  const rowsFor = (c: PaceCompetency): string => {
    if (c.is_heading) {
      return `<tr class="strand-row"><td colspan="5">${esc(c.description)}</td></tr>`;
    }
    const slots = ratingSlots(c);
    // A group parent ("20. Comprehend stories.") has no squares of its own.
    if (slots.length === 0) {
      return `<tr>
        <td class="num-col">${esc(c.item_number ?? "")}</td>
        <td class="item-cell parent">${esc(c.description)}</td>
        ${PACE_TERMS.map(() => `<td class="rating-col blank"></td>`).join("")}
      </tr>`;
    }
    return slots
      .map((slot, i) => {
        const cells = PACE_TERMS.map((t) => {
          if (!slot.terms.includes(t)) {
            return `<td class="rating-col" style="background:${GREY_SQUARE}"></td>`;
          }
          const fill = slot.skill ? PACE_MACRO_SKILL_COLORS[slot.skill] : "#fff";
          const title = slot.skill ? ` title="${esc(PACE_MACRO_SKILL_LABELS[slot.skill])}"` : "";
          return `<td class="rating-col rating-val" style="background:${fill}"${title}>${esc(
            ratings[cellKey(String(c.id), t, slot.skill)] ?? "",
          )}</td>`;
        }).join("");
        const lead =
          i === 0
            ? `<td class="num-col" rowspan="${slots.length}">${esc(c.item_number ?? "")}</td>
               <td class="item-cell" rowspan="${slots.length}">${esc(c.description)}</td>`
            : "";
        return `<tr class="slot-row">${lead}${cells}</tr>`;
      })
      .join("");
  };

  // Split the list into the two printed columns at its own midpoint, counted
  // in printed lines (a competency on four squares is four lines), so a DepEd
  // revision that adds items never leaves one half running off the page.
  const lineCount = (c: PaceCompetency) => Math.max(1, ratingSlots(c).length);
  const totalLines = items.reduce((n, c) => n + lineCount(c), 0);
  let running = 0;
  let splitAt = items.length;
  for (let i = 0; i < items.length; i++) {
    if (running >= totalLines / 2) {
      splitAt = i;
      break;
    }
    running += lineCount(items[i]);
  }
  const columns = [items.slice(0, splitAt), items.slice(splitAt)];

  const tableHtml = (rows: PaceCompetency[]): string => `
    <table class="competency-table">
      <thead>
        <tr>
          <th class="num-col" rowspan="2">No.</th>
          <th rowspan="2">Learning Competencies</th>
          <th colspan="3">Rating</th>
        </tr>
        <tr>${PACE_TERMS.map((t) => `<th class="rating-col">T${t}</th>`).join("")}</tr>
      </thead>
      <tbody>${rows.map(rowsFor).join("")}</tbody>
    </table>`;

  const usesSkills = items.some((c) => (c.macro_skills ?? []).length > 0);
  const legend = usesSkills
    ? `<div class="skill-note">${esc(PACE_MACRO_SKILL_NOTE)}</div>
       <div class="skill-legend">
         <span class="bold">LEGEND</span>
         ${PACE_MACRO_SKILLS.map(
           (sk) => `<span class="legend-item"><span class="swatch" style="background:${PACE_MACRO_SKILL_COLORS[sk]}"></span>${esc(PACE_MACRO_SKILL_LABELS[sk])}</span>`,
         ).join("")}
       </div>`
    : "";

  return `<div class="grid">
    <div>${tableHtml(columns[0])}</div>
    <div>${tableHtml(columns[1])}</div>
  </div>${legend}`;
}

/**
 * Mathematics, GMRC, Makabansa: one full-width list under Term 1 / 2 / 3
 * headings, numbering restarting per term, with a single Rating column — each
 * competency belongs to one term, so the issued form gives it one cell.
 * GMRC adds the Performance Standard beside each value, and its first row
 * ("Nililinang na Pagpapahalaga") is that column's heading, not a strand.
 */
function buildByTermPage(
  items: PaceCompetency[],
  ratings: Grade1ReportData["ratings"],
): string {
  const hasStandards = items.some((c) => !!c.performance_standard);
  let list = items;
  let itemHeader = "Learning Competencies";
  if (hasStandards && list[0]?.is_heading) {
    itemHeader = list[0].description;
    list = list.slice(1);
  }
  const span = hasStandards ? 4 : 3;

  let currentTerm: PaceTerm | null = null;
  const rows: string[] = [];
  list.forEach((c, idx) => {
    // The term a run of items belongs to: its own group, or — for a strand
    // heading — that of the item it introduces.
    const next = c.is_heading ? list.slice(idx + 1).find((x) => !x.is_heading) : c;
    const term = (next?.term_group ?? next?.terms?.[0] ?? null) as PaceTerm | null;
    if (term && term !== currentTerm) {
      currentTerm = term;
      rows.push(`<tr class="term-row"><td colspan="${span}">${PACE_TERM_LABELS[term]}</td></tr>`);
    }
    if (c.is_heading) {
      rows.push(`<tr class="strand-row"><td colspan="${span}">${esc(c.description)}</td></tr>`);
      return;
    }
    const slot = ratingSlots(c)[0];
    const rateTerm = (slot?.terms[0] ?? null) as PaceTerm | null;
    const value = rateTerm ? (ratings[cellKey(String(c.id), rateTerm, null)] ?? "") : "";
    rows.push(`<tr>
      <td class="num-col">${esc(c.item_number ?? "")}</td>
      <td class="item-cell${slot ? "" : " parent"}">${escMultiline(c.description)}</td>
      ${hasStandards ? `<td class="standard-cell">${esc(c.performance_standard ?? "")}</td>` : ""}
      <td class="rating-one ${slot ? "rating-val" : "blank"}">${esc(value)}</td>
    </tr>`);
  });

  return `<table class="competency-table by-term">
    <thead>
      <tr>
        <th class="num-col">No.</th>
        <th>${esc(itemHeader)}</th>
        ${hasStandards ? "<th>Performance Standard</th>" : ""}
        <th class="rating-one">Rating</th>
      </tr>
    </thead>
    <tbody>${rows.join("")}</tbody>
  </table>`;
}

/** One learning area's PACE page. */
function buildPacePage(area: PaceArea, data: Grade1ReportData, header: string): string {
  const items = data.competencies.filter((c) => String(c.area_id) === String(area.id));
  const body =
    area.mode === "by_term"
      ? buildByTermPage(items, data.ratings)
      : buildContinuousPage(items, data.ratings);

  return `<div class="page pace-page">
  ${header}
  <div class="form-title">Performance and Competency Evaluation (PACE) Form</div>
  ${buildLearnerLine(data)}
  <div class="instructions"><span class="bold">General Instructions:</span> ${esc(PACE_GENERAL_INSTRUCTIONS)}</div>
  <div class="area-title">${esc(area.name.toUpperCase())}</div>
  ${body}
</div>`;
}

function buildAttendanceTable(attendance: MonthAttendance[]): string {
  const rows = attendance
    .map((m, idx) => {
      const first = idx === 0 || attendance[idx - 1].term !== m.term;
      const rowSpan = attendance.filter((x) => x.term === m.term).length;
      return `<tr data-key="${m.key}">
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
  const ages = grade1AgeReferenceDates(schoolYear);
  const ageStart = ageYearsMonths(student.date_of_birth as string | null, ages.bosy);
  const ageEnd = ageYearsMonths(student.date_of_birth as string | null, ages.eosy);

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
    <div>${esc(letterheadRegion(school.region))}</div>
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
.blank { background: #fff; }
.slot-row td.rating-col { height: 11px; }
.item-cell { text-align: left; }
.learner-line { display: flex; justify-content: space-between; gap: 8px; font-size: 8pt; margin: 2px 0 5px; }
.skill-note { font-size: 6.8pt; font-style: italic; margin-top: 5px; }
.skill-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; font-size: 6.8pt; margin-top: 3px; }
.legend-item { display: inline-flex; align-items: center; gap: 4px; }
.swatch { display: inline-block; width: 14px; height: 9px; border: 1px solid #000; }
.by-term .rating-one { width: 46px; text-align: center; vertical-align: middle; }
.by-term .standard-cell { width: 42%; font-size: 6.6pt; }
.term-row td { font-weight: bold; background: #d9d9d9; text-align: left; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

/* A PACE page is one learning area on one sheet, as the workbook prints it:
   the letterhead, instructions and list are set tighter than the card. */
.pace-page .deped-header-with-logos { font-size: 7pt; line-height: 1.15; margin-bottom: 2px; }
.pace-page .deped-logo-img { width: 40px; height: 40px; }
.pace-page .deped-logo-left-wrap, .pace-page .deped-logo-right-wrap { width: 40px; }
.pace-page .form-title { font-size: 10.5pt; margin-top: 1px; }
.pace-page .learner-line { font-size: 7.5pt; margin: 1px 0 3px; }
.pace-page .instructions { font-size: 6.2pt; line-height: 1.2; padding: 2px 5px; margin-bottom: 3px; }
.pace-page .area-title { font-size: 9pt; margin-bottom: 2px; }
.pace-page .competency-table { font-size: 6.2pt; line-height: 1.12; }
.pace-page .competency-table th, .pace-page .competency-table td { padding: 0 2px; }
.pace-page .competency-table th { font-size: 6.4pt; }
.pace-page .rating-val { font-size: 6.6pt; }
.pace-page .slot-row td.rating-col { height: 8.5px; line-height: 8px; }
.pace-page .by-term .standard-cell { font-size: 6pt; }
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

/**
 * The printable HTML for already-fetched data — the card (unless `card` is
 * false) followed by the PACE pages (unless `pace` is false). Pure, so the
 * layout can be rendered and checked without a database.
 */
export function renderGrade1Html(
  data: Grade1ReportData,
  { card = true, pace = true }: { card?: boolean; pace?: boolean } = {},
): string {
  const studentName = `${data.student.last_name || ""}, ${data.student.first_name || ""}`.trim();
  const title = card
    ? `Learner's Progress Report Card - ${esc(studentName)}`
    : `PACE Form - ${esc(studentName)}`;
  return buildDocument(title, renderLearnerPages(data, { card, pace }));
}

/** One learner's pages: the card (unless `card` is false), then the PACE pages. */
function renderLearnerPages(
  data: Grade1ReportData,
  { card, pace }: { card: boolean; pace: boolean },
): string {
  const header = buildHeader(data);
  return [
    ...(card ? [buildCardPage(data, header)] : []),
    ...(pace ? data.areas.map((area) => buildPacePage(area, data, header)) : []),
  ].join("\n");
}

/**
 * Several learners in one print job, each starting on a fresh page — the
 * whole class's cards (with their PACE pages) or PACE forms at once.
 * `onProgress` is called after each learner's records are fetched.
 */
export async function generateGrade1ClassPrint(
  params: Omit<Grade1ReportParams, "studentId">,
  studentIds: string[],
  { card = true, pace = true }: { card?: boolean; pace?: boolean },
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const bodies: string[] = [];
  for (const [i, studentId] of studentIds.entries()) {
    const data = await fetchGrade1Data({ ...params, studentId });
    bodies.push(renderLearnerPages(data, { card, pace }));
    onProgress?.(i + 1, studentIds.length);
  }
  const title = card ? "Learner's Progress Report Cards" : "PACE Forms";
  printHTMLContent(buildDocument(title, bodies.join("\n")));
}

/** The PACE form on its own: five pages, one per learning area. */
export async function generatePaceFormPrint(
  params: Grade1ReportParams,
): Promise<void> {
  const data = await fetchGrade1Data(params);
  printHTMLContent(renderGrade1Html(data, { card: false }));
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
  printHTMLContent(renderGrade1Html(data, { pace: params.includePace !== false }));
}
