// ============================================================================
// PHILIPPINE EARLY CHILDHOOD DEVELOPMENT CHECKLIST — trifold
// ============================================================================
// A facsimile of the issued Division of Bayugan City form: one folio sheet
// printed both sides, three panels per side.
//
//   Outer sheet   [ last domain | attendance + summary + certificate | cover ]
//   Inner sheet   [ ---- every other domain, flowed across three columns ---- ]
//
// The inner sheet is a genuine column flow, not three fixed lists: on the issued
// form Self-Help starts in panel 1 and finishes in panel 2 with no repeated
// header, so a domain has to be able to break mid-list. That also makes the
// layout independent of how many items a domain holds, which matters because the
// domains, their items and the raw -> scaled mapping are all editable at
// /settings/eccd and are read from the database exactly as configured.
//
// Rows are bordered divs rather than a table because a <table> does not break
// reliably across CSS columns in Chrome, and the print goes through the browser.
// ============================================================================

import {
  ECCD_AGE_BANDS,
  ECCD_ATTENDANCE_ROWS,
  ECCD_CONTENTS_INTRO,
  ECCD_CONTENTS_OUTRO,
  ECCD_DIVISION,
  ECCD_FORM_TITLE,
  ECCD_MONTH_INITIALS,
  ECCD_MONTH_NAMES,
  ECCD_PARENT_INTRO,
  ECCD_SCORE_LEGEND,
  ECCD_SOURCE_LEGEND,
  ECCD_STANDARD_SCORE_BANDS,
  ECCD_STANDARD_SCORE_TABLE,
  eccdStandardScoreInterpretation,
} from "@/lib/constants/eccd";
import { KINDER_ATTENDANCE_MONTHS } from "@/lib/constants/kinderProgress";
import { DEPED_LOGO_LEFT, DEPED_LOGO_RIGHT, printHTMLContent } from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";
import {
  countSchoolDays,
  fetchSchoolCalendar,
  getSchoolDaysInMonth,
  schoolDaysHeldThrough,
  sessionWeight,
  todayIso,
  type SchoolCalendarDay,
} from "@/lib/utils/schoolCalendar";
import { eccdAgeBandFor, eccdScaledScore } from "@/lib/utils/eccdScale";
import { fetchSchoolSettings } from "@/lib/utils/schoolSettings";
import { EccdCompetency, EccdDomain, EccdScaleScore } from "@/types";

export interface EccdCardParams {
  schoolId: string;
  studentId: string;
  sectionId: string;
  schoolYear: string;
}

/** One month's column in the attendance record. */
interface MonthAttendance {
  classDays: number;
  present: number;
  absent: number;
}

export interface EccdCardData {
  school: { name: string; address: string; district: string; region: string; school_id: string };
  student: Record<string, string | number | null | undefined>;
  section: { name: string };
  adviserName: string;
  principalName: string;
  principalTitle: string;
  domains: EccdDomain[];
  competencies: EccdCompetency[];
  scaleScores: EccdScaleScore[];
  /** competencyId -> period -> 0 | 1 */
  assessments: Record<string, Record<string, number>>;
  attendance: MonthAttendance[];
  schoolYear: string;
}

const PERIODS = ["1ST_SEM", "2ND_SEM"] as const;
type Period = (typeof PERIODS)[number];

/** HTML-escapes school-entered free text before it reaches the printed page. */
function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "December 20, 2019" — string-split, not `new Date()`, so the day cannot shift. */
function formatLongDate(value: string | null | undefined): string {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[m - 1]} ${d}, ${y}`;
}

/**
 * Age in the ECCD's own `years.months` notation, taken at the opening of the
 * school year: the checklist bands a child by the age at which it is first
 * administered. String-split rather than `new Date()`, per the Kindergarten
 * Progress Report, so a timezone cannot move the birthday a day.
 */
function ageYearsMonths(dob: string | null | undefined, refIso: string): string {
  if (!dob) return "";
  const [by, bm, bd] = dob.slice(0, 10).split("-").map(Number);
  const [ry, rm, rd] = refIso.slice(0, 10).split("-").map(Number);
  if (!by || !ry) return "";
  let years = ry - by;
  let months = rm - bm;
  if (rd < bd) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return "";
  return `${years}.${months}`;
}

/**
 * Attendance per month on exactly the rules the attendance grid, SF2, the report
 * card and the Kindergarten Progress Report already use (migration 125): the
 * school calendar is the class-day denominator, a date with no saved row counts
 * as present because an adviser records only absences, and the count stops at
 * today so a card printed in September does not report the whole year.
 */
function aggregateAttendance(
  records: { date: string; am_present: boolean | null; pm_present: boolean | null }[],
  calendar: SchoolCalendarDay[],
  schoolYear: string,
): MonthAttendance[] {
  const [startYear, endYear] = schoolYear.split("-").map(Number);
  const byDate = new Map(records.map((r) => [r.date, r]));
  const through = todayIso();

  return KINDER_ATTENDANCE_MONTHS.map(({ month, yearOffset }) => {
    const year = yearOffset === 0 ? startYear : endYear;
    const yearMonth = `${year}-${String(month).padStart(2, "0")}`;
    const days = schoolDaysHeldThrough(getSchoolDaysInMonth(yearMonth, calendar), through);

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

    return { classDays: countSchoolDays(days), present, absent };
  });
}

/** Whole numbers print bare; a half-day shows its .5. A zero prints blank. */
function fmtDays(value: number): string {
  if (!value) return "";
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

async function fetchEccdCardData(params: EccdCardParams): Promise<EccdCardData> {
  const { schoolId, studentId, sectionId, schoolYear } = params;

  const [schoolRes, studentRes, sectionRes, domainsRes, compRes, scaleRes, calendar] =
    await Promise.all([
      supabase
        .from("sms_schools")
        .select("name, address, district, region, school_id")
        .eq("id", schoolId)
        .single(),
      supabase.from("sms_students").select("*").eq("id", studentId).single(),
      supabase.from("sms_sections").select("name, section_adviser_id").eq("id", sectionId).single(),
      supabase.from("sms_eccd_domains").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("sms_eccd_competencies").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("sms_eccd_scale_scores").select("*"),
      fetchSchoolCalendar(schoolId, schoolYear),
    ]);

  if (!schoolRes.data) throw new Error("School not found");
  if (!studentRes.data) throw new Error("Student not found");
  if (!sectionRes.data) throw new Error("Section not found");

  const [adviserRes, settings, assessmentRes, attendanceRes] = await Promise.all([
    sectionRes.data.section_adviser_id
      ? supabase.from("sms_users").select("name").eq("id", sectionRes.data.section_adviser_id).single()
      : Promise.resolve({ data: null }),
    fetchSchoolSettings(schoolId),
    supabase
      .from("sms_eccd_assessments")
      .select("competency_id, period, rating")
      .eq("student_id", studentId)
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear)
      .in("period", PERIODS as unknown as string[]),
    supabase
      .from("sms_attendance")
      .select("date, am_present, pm_present")
      .eq("student_id", studentId)
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear),
  ]);

  const assessments: Record<string, Record<string, number>> = {};
  (assessmentRes.data || []).forEach(
    (a: { competency_id: string; period: string; rating: number | null }) => {
      const cid = String(a.competency_id);
      if (!assessments[cid]) assessments[cid] = {};
      assessments[cid][a.period] = a.rating ?? 0;
    },
  );

  return {
    school: schoolRes.data,
    student: studentRes.data,
    section: sectionRes.data,
    adviserName: (adviserRes.data as { name?: string } | null)?.name || "",
    principalName: settings.principal_name || "",
    principalTitle: settings.principal_title || "Principal",
    domains: domainsRes.data || [],
    competencies: compRes.data || [],
    scaleScores: scaleRes.data || [],
    assessments,
    attendance: aggregateAttendance(attendanceRes.data || [], calendar, schoolYear),
    schoolYear,
  };
}

// ============================================================================
// Scoring — read from the school's own configuration, never re-derived
// ============================================================================

function itemsOf(domain: EccdDomain, competencies: EccdCompetency[]): EccdCompetency[] {
  return competencies.filter((c) => String(c.domain_id) === String(domain.id));
}

/** A domain's raw score is the count of items ticked; an absent row is a zero. */
function rawScore(
  domain: EccdDomain,
  competencies: EccdCompetency[],
  assessments: EccdCardData["assessments"],
  period: Period,
): number {
  return itemsOf(domain, competencies).reduce(
    (sum, comp) => sum + (assessments[comp.id]?.[period] ?? 0),
    0,
  );
}

/**
 * The two administrations' reference dates. DepEd's conversion table is
 * age-referenced, and the two sittings are half a year apart, so the band is
 * resolved once per administration rather than once per card: a learner can and
 * does cross a band between them.
 */
function periodReferenceDate(schoolYear: string, period: Period): string {
  const [startYear] = schoolYear.split("-").map(Number);
  return period === "1ST_SEM" ? `${startYear}-06-01` : `${startYear + 1}-03-31`;
}

/**
 * The Standard Score for a scaled total. Blank until DepEd's scaled-sum ->
 * standard-score conversion is filled into `ECCD_STANDARD_SCORE_TABLE`: that
 * page is not in the workbook this was built from, and a developmental
 * classification on a child's record is not a figure to interpolate from the two
 * known pairs. A blank cell is what the issued sample card carries, written in
 * by hand from the printed table.
 */
function standardScore(scaledTotal: string): string {
  if (scaledTotal === "") return "";
  const hit = ECCD_STANDARD_SCORE_TABLE[Number(scaledTotal)];
  return hit === undefined ? "" : String(hit);
}

/** The interpretation that goes beside it — blank whenever the score is. */
function standardScoreBand(standard: string): string {
  return standard === "" ? "" : eccdStandardScoreInterpretation(Number(standard));
}

/** The age band each administration is scored against, or null with no birth date. */
function bandsByPeriod(
  dob: string | null | undefined,
  schoolYear: string,
): Record<Period, string | null> {
  return {
    "1ST_SEM": eccdAgeBandFor(dob, periodReferenceDate(schoolYear, "1ST_SEM"))?.id ?? null,
    "2ND_SEM": eccdAgeBandFor(dob, periodReferenceDate(schoolYear, "2ND_SEM"))?.id ?? null,
  };
}

// ============================================================================
// Panel builders
// ============================================================================

const TICK = "&#10003;";

/**
 * One domain: a header row, its items, then TOTAL SCORE and SCALED SCORE. Rows
 * carry their own border so a break mid-domain still closes the box cleanly on
 * both sides of the column boundary.
 */
function buildDomain(
  domain: EccdDomain,
  competencies: EccdCompetency[],
  scaleScores: EccdScaleScore[],
  assessments: EccdCardData["assessments"],
  bands: Record<Period, string | null>,
): string {
  const items = itemsOf(domain, competencies);
  const raw1 = rawScore(domain, competencies, assessments, "1ST_SEM");
  const raw2 = rawScore(domain, competencies, assessments, "2ND_SEM");

  const rows = items
    .map((comp, idx) => {
      const t1 = (assessments[comp.id]?.["1ST_SEM"] ?? 0) === 1 ? TICK : "";
      const t2 = (assessments[comp.id]?.["2ND_SEM"] ?? 0) === 1 ? TICK : "";
      return `<div class="r">
        <span class="c-num">${idx + 1}.</span>
        <span class="c-txt">${esc(comp.description)}</span>
        <span class="c-mark">${t1}</span>
        <span class="c-mark">${t2}</span>
      </div>`;
    })
    .join("");

  const scoreRow = (label: string, a: string | number, b: string | number) =>
    `<div class="r r-score">
      <span class="c-lbl">${label}</span>
      <span class="c-mark">${a}</span>
      <span class="c-mark">${b}</span>
    </div>`;

  return `<div class="dom">
    <div class="r r-head">
      <span class="c-dom">${esc(domain.name).toUpperCase()} DOMAIN</span>
      <span class="c-mark">1<sup>st</sup><br>sem</span>
      <span class="c-mark">2<sup>nd</sup><br>sem</span>
    </div>
    ${rows}
    ${scoreRow("TOTAL SCORE", raw1, raw2)}
    ${scoreRow(
      "SCALED SCORE",
      eccdScaledScore(scaleScores, domain.id, raw1, bands["1ST_SEM"]),
      eccdScaledScore(scaleScores, domain.id, raw2, bands["2ND_SEM"]),
    )}
  </div>`;
}

/** The eleven-month grid, June through April, headed by Cebuano initials. */
function buildAttendance(attendance: MonthAttendance[]): string {
  const head = ECCD_MONTH_INITIALS.map(
    (initial, i) => `<th title="${ECCD_MONTH_NAMES[i]}">${initial}</th>`,
  ).join("");

  const row = (label: string, values: string[], total: string) =>
    `<tr><td class="att-lbl">${label}</td>${values
      .map((v) => `<td>${v}</td>`)
      .join("")}<td class="att-total">${total}</td></tr>`;

  const sum = (pick: (m: MonthAttendance) => number) =>
    fmtDays(attendance.reduce((t, m) => t + pick(m), 0));

  return `<table class="att">
    <thead><tr><th></th>${head}<th class="att-total">TOTAL</th></tr></thead>
    <tbody>
      ${row(ECCD_ATTENDANCE_ROWS.classDays, attendance.map((m) => fmtDays(m.classDays)), sum((m) => m.classDays))}
      ${row(ECCD_ATTENDANCE_ROWS.present, attendance.map((m) => fmtDays(m.present)), sum((m) => m.present))}
      ${row(ECCD_ATTENDANCE_ROWS.absent, attendance.map((m) => fmtDays(m.absent)), sum((m) => m.absent))}
      ${row(ECCD_ATTENDANCE_ROWS.tardy, attendance.map(() => ""), "")}
    </tbody>
  </table>`;
}

/**
 * The two administrations. The scaled total is the sum of the domain scaled
 * scores and is computed; the standard score and its interpretation are left
 * blank for hand-entry, because the scaled-sum -> standard-score conversion is
 * not held anywhere in the system and inventing one would be worse than a blank.
 */
function buildAdministrations(
  domains: EccdDomain[],
  competencies: EccdCompetency[],
  scaleScores: EccdScaleScore[],
  assessments: EccdCardData["assessments"],
  bands: Record<Period, string | null>,
): string {
  const scaledTotal = (period: Period): string => {
    let total = 0;
    let any = false;
    domains.forEach((d) => {
      const scaled = eccdScaledScore(
        scaleScores,
        d.id,
        rawScore(d, competencies, assessments, period),
        bands[period],
      );
      if (scaled !== "") {
        total += Number(scaled);
        any = true;
      }
    });
    return any ? String(total) : "";
  };

  return `<table class="adm">
    <thead>
      <tr><th></th><th>Scaled Score</th><th>Standard Score</th><th>Interpretation</th></tr>
    </thead>
    <tbody>
      ${(["1ST_SEM", "2ND_SEM"] as const)
        .map((period, i) => {
          const band = ECCD_AGE_BANDS.find((b) => b.id === bands[period]);
          return `<tr>
            <td class="adm-lbl">${i + 1}<sup>${i === 0 ? "st" : "nd"}</sup> Administration
              ${band ? `<span class="adm-band">(${band.label})</span>` : ""}</td>
            <td>${scaledTotal(period)}</td>
            <td>${standardScore(scaledTotal(period))}</td>
            <td>${standardScoreBand(standardScore(scaledTotal(period)))}</td>
          </tr>`;
        })
        .join("")}
    </tbody>
  </table>`;
}

/** The cover panel: DepEd header, learner details, and the parent's guide. */
function buildCover(data: EccdCardData): string {
  const { school, student, domains, competencies, schoolYear, adviserName, principalName, principalTitle } = data;

  const name = [student.first_name, student.middle_name, student.last_name, student.suffix]
    .filter(Boolean)
    .join(" ");
  const [startYear] = schoolYear.split("-");
  const age = ageYearsMonths(student.date_of_birth as string, `${startYear}-06-01`);

  const contents = domains
    .map(
      (d) =>
        `<li>${esc(d.name)} Domain nga may ${itemsOf(d, competencies).length} ka aytem</li>`,
    )
    .join("");

  const legend = (title: string, entries: { code: string; text: string }[]) =>
    `<div class="lg-title">${title}</div>
     ${entries.map((e) => `<div class="lg-row"><span class="lg-code">${e.code}</span> ${e.text}</div>`).join("")}`;

  return `
    <div class="cover-head">
      <img src="${DEPED_LOGO_LEFT}" class="cover-logo" onerror="this.style.display='none'">
      <div class="cover-head-text">
        <div>Republic of the Philippines</div>
        <div>Department of Education</div>
        <div>${esc(school.region) || "Caraga Administrative Region"}</div>
        <div>${ECCD_DIVISION}</div>
        <div>${esc(school.district)}</div>
        <div class="cover-school">${esc(school.name)}</div>
        <div>SCHOOL ID: ${esc(school.school_id)}</div>
        <div class="cover-title">${ECCD_FORM_TITLE}</div>
        <div class="cover-sy">S.Y. ${esc(schoolYear)}</div>
      </div>
      <img src="${DEPED_LOGO_RIGHT}" class="cover-logo" onerror="this.style.display='none'">
    </div>

    <div class="fld"><b>Ngalan sa Bata:</b> <span class="fill">${esc(name)}</span>
      <b>LRN:</b> <span class="fill">${esc(student.lrn)}</span></div>
    <div class="fld"><b>Adlaw nga Natawhan:</b> <span class="fill">${formatLongDate(student.date_of_birth as string)}</span>
      <b>Edad:</b> <span class="fill">${age}</span></div>
    <div class="fld"><b>Gamit nga kamot sa bata kung magsulat:</b> <span class="fill"></span>
      <b>Sex:</b> <span class="fill">${esc(student.gender)}</span></div>

    <div class="cv-sec"><b>Para sa mga Ginikanan:</b>
      <p>${ECCD_PARENT_INTRO}</p>
    </div>

    <div class="cv-sec"><b>Mga Sulod:</b>
      <p>${ECCD_CONTENTS_INTRO}</p>
      <ul class="cv-list">${contents}</ul>
      <p>${ECCD_CONTENTS_OUTRO}</p>
    </div>

    <div class="cv-sec">${legend("Mga Han-ay:", ECCD_SOURCE_LEGEND)}</div>
    <div class="cv-sec">${legend("Iskor:", ECCD_SCORE_LEGEND)}</div>

    <div class="cv-sig">
      <div class="sig-name">${esc(adviserName)}</div>
      <div class="sig-role">Kindergarten Teacher</div>
    </div>
    <div class="cv-noted"><b>Noted:</b></div>
    <div class="cv-sig">
      <div class="sig-name">${esc(principalName)}</div>
      <div class="sig-role">${esc(principalTitle)}</div>
    </div>`;
}

// ============================================================================
// Document
// ============================================================================

const STYLES = `
@page { size: 13in 8.5in; margin: 0.28in; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: "Times New Roman", serif; color: #000; background: #fff; }

/* A side of the sheet: three panels, folded in three. */
.sheet { display: flex; gap: 0.2in; height: 7.85in; page-break-after: always; }
.sheet:last-child { page-break-after: auto; }
.panel { flex: 1 1 0; min-width: 0; }

/* The inner side is one continuous flow, so a domain may break mid-list exactly
   as Self-Help does on the issued form. Balanced rather than filled top-to-bottom:
   the school's checklist is whatever /settings/eccd holds, and a short one would
   otherwise leave the third panel of a folded sheet completely blank. */
.flow { column-count: 3; column-gap: 0.2in; column-fill: balance; height: 100%; }

/* ---- domain blocks ---------------------------------------------------- */
.dom { margin-bottom: 7px; break-inside: auto; }
.r {
  display: flex; align-items: stretch;
  border: 1px solid #000; margin-top: -1px;
  break-inside: avoid; page-break-inside: avoid;
}
.r > span { padding: 1px 3px; font-size: 6.6pt; line-height: 1.18; }
.c-num { width: 16px; flex: 0 0 16px; text-align: right; }
.c-txt { flex: 1 1 auto; min-width: 0; border-left: 1px solid #000; }
.c-lbl { flex: 1 1 auto; min-width: 0; font-weight: bold; font-size: 6.8pt; }
.c-dom { flex: 1 1 auto; min-width: 0; font-weight: bold; font-size: 7.2pt; }
.c-mark {
  width: 26px; flex: 0 0 26px; text-align: center;
  border-left: 1px solid #000; font-size: 7.4pt;
}
.r-head > .c-mark { font-size: 5.6pt; line-height: 1.05; }
.r-head, .r-score { background: #f2f2f2; }
.r-score > .c-mark { font-weight: bold; }

/* ---- attendance ------------------------------------------------------- */
.sec-title { text-align: center; font-weight: bold; font-size: 8pt; margin: 0 0 3px; }
.att { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
.att th, .att td { border: 1px solid #000; text-align: center; font-size: 6.2pt; padding: 2px 1px; }
.att .att-lbl { text-align: left; width: 27%; font-size: 6.2pt; padding: 2px 3px; }
.att .att-total { font-weight: bold; }

/* ---- interpretation + administrations --------------------------------- */
.interp, .adm { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
.interp th, .interp td, .adm th, .adm td {
  border: 1px solid #000; font-size: 6.6pt; padding: 2px 4px; text-align: center;
}
.interp td:last-child { text-align: left; }
.adm .adm-lbl { text-align: left; font-weight: normal; }
.adm .adm-band { font-size: 5.6pt; color: #333; white-space: nowrap; }
.adm td { height: 15px; }

/* ---- signature blocks ------------------------------------------------- */
.pirma { margin-bottom: 12px; }
.pirma b { font-size: 7pt; }
.pirma-line { font-size: 7pt; margin-top: 7px; }
.pirma-line span { display: inline-block; border-bottom: 1px solid #000; width: 52%; }
.cert { text-align: center; }
.cert-title { font-weight: bold; font-size: 7.6pt; margin-bottom: 6px; }
.cert p { font-size: 7pt; text-align: left; line-height: 1.5; }
.cert-name {
  border-bottom: 1px solid #000; text-align: center; font-weight: bold;
  font-size: 7.4pt; text-transform: uppercase; margin: 2px auto 3px; width: 88%;
}

.cv-sig { text-align: center; margin-top: 22px; }
.sig-name {
  font-weight: bold; font-size: 7.4pt; text-transform: uppercase;
  border-top: 1px solid #000; display: inline-block; padding: 1px 14px 0; min-width: 60%;
}
.sig-role { font-size: 6.8pt; }
.cv-noted { font-size: 7pt; margin-top: 10px; }

/* ---- cover ------------------------------------------------------------ */
.cover-head { display: flex; align-items: flex-start; gap: 5px; margin-bottom: 7px; }
.cover-logo { width: 42px; height: 42px; object-fit: contain; flex: 0 0 42px; }
.cover-head-text { flex: 1; min-width: 0; text-align: center; font-size: 6.6pt; line-height: 1.28; }
.cover-school { font-weight: bold; font-size: 7.4pt; text-transform: uppercase; }
.cover-title { font-weight: bold; font-size: 7.2pt; margin-top: 2px; }
.cover-sy { font-weight: bold; font-size: 7pt; }

.fld { font-size: 6.8pt; margin-bottom: 4px; }
.fld .fill {
  display: inline-block; border-bottom: 1px solid #000;
  min-width: 82px; text-transform: uppercase; padding: 0 2px; margin-right: 6px;
}
.cv-sec { font-size: 6.8pt; margin-top: 7px; }
.cv-sec p { text-indent: 16px; text-align: justify; line-height: 1.3; margin-top: 1px; }
.cv-list { margin: 2px 0 2px 22px; }
.cv-list li { line-height: 1.3; }
.lg-title { font-weight: bold; }
.lg-row { margin-left: 22px; line-height: 1.35; }
.lg-code { display: inline-block; min-width: 24px; }

@media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
`;

/** Builds the two-sided trifold. Exported separately so it can be unit-tested. */
export function buildEccdCardHtml(data: EccdCardData): string {
  const { domains, competencies, scaleScores, assessments, attendance, adviserName, student, schoolYear } = data;

  // The issued form carries the final domain alone on the outer side and flows
  // the rest across the inner side. With the standard seven that is
  // Socio-Emotional, exactly as printed.
  const bands = bandsByPeriod(student.date_of_birth as string, schoolYear);

  const tailDomain = domains.length > 1 ? domains[domains.length - 1] : undefined;
  const flowDomains = tailDomain ? domains.slice(0, -1) : domains;

  const learnerName = [student.first_name, student.middle_name, student.last_name, student.suffix]
    .filter(Boolean)
    .join(" ");

  const interpRows = ECCD_STANDARD_SCORE_BANDS.map(
    (b) => `<tr><td>${b.range}</td><td>${b.interpretation}</td></tr>`,
  ).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>ECCD Checklist - ${esc(learnerName)}</title>
<style>${STYLES}</style>
</head>
<body>

<!-- OUTER SIDE: tail domain | attendance &amp; certificate | cover -->
<div class="sheet">
  <div class="panel">
    ${tailDomain ? buildDomain(tailDomain, competencies, scaleScores, assessments, bands) : ""}
  </div>

  <div class="panel">
    <div class="sec-title">ATTENDANCE RECORD</div>
    ${buildAttendance(attendance)}

    <div class="sec-title">Interpretation of Standard Score or Development Index</div>
    <table class="interp">
      <thead><tr><th>Standard Score</th><th>Interpretation</th></tr></thead>
      <tbody>${interpRows}</tbody>
    </table>

    ${buildAdministrations(domains, competencies, scaleScores, assessments, bands)}

    <div class="pirma">
      <b>PIRMA SA GINIKANAN:</b>
      <div class="pirma-line">Permirong Semestre <span></span></div>
      <div class="pirma-line">Ika duhang Semestre <span></span></div>
    </div>

    <div class="cert">
      <div class="cert-title">CERTIFICATE OF COMPLETION</div>
      <p>Kini nagapamatuod nga si</p>
      <div class="cert-name">${esc(learnerName).toUpperCase()}</div>
      <p>Nakahuman sa <b>Kindergarten Education</b> pinasikad sa Department of Education,
      tuig ${esc(schoolYear)}.</p>
      <div class="cv-sig">
        <div class="sig-name">${esc(adviserName)}</div>
        <div class="sig-role">Kindergarten Teacher</div>
      </div>
    </div>
  </div>

  <div class="panel">${buildCover(data)}</div>
</div>

<!-- INNER SIDE: every other domain, flowed across three columns -->
<div class="sheet">
  <div class="flow">
    ${flowDomains.map((d) => buildDomain(d, competencies, scaleScores, assessments, bands)).join("")}
  </div>
</div>

</body>
</html>`;
}

export async function generateEccdCardPrint(params: EccdCardParams): Promise<void> {
  const data = await fetchEccdCardData(params);
  printHTMLContent(buildEccdCardHtml(data));
}
