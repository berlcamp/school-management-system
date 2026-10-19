/**
 * Printables: SBFP Forms 1A, 1B, 2, 3, 4, 5 (milk), 5 (consolidated) and 6,
 * 2026 issue, plus the Feedback Mechanism log (migration 212), which has no
 * issued form and follows the same header and signature conventions.
 *
 * Each is laid out after its sheet in the issued workbook — the column heads,
 * their order and the signature lines are transcribed verbatim (the 137/154/172
 * rule), so a school reading the printout against the template finds the same
 * column in the same place. Printed through the browser like the other report
 * printables; the forms are long landscape tables, not OMR geometry, so the
 * print dialog's scaling costs nothing here.
 *
 * Every builder is a pure function of its inputs and returns a complete HTML
 * document, which is what the tests read.
 */

import {
  SBFP_FEEDBACK_STATUS_OPTIONS,
  SBFP_FEEDING_LEGEND,
  SBFP_MILK_TOLERANCE_OPTIONS,
  SBFP_WEIGHING_PERIODS,
  type SbfpContactKind,
  type SbfpWeighingPeriod,
} from "@/lib/constants/sbfp";
import { esc } from "@/lib/pdf/reportShell";
import {
  buildDepEdHeaderWithLogos,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "@/lib/pdf/utils";
import { ageInMonths, bodyMassIndex, formatBmi } from "@/lib/utils/nutritionalStatus";
import {
  ageAtReading,
  averagePercent,
  buildForm2Summary,
  buildForm5Consolidated as buildForm5ConsolidatedReport,
  buildForm6Table,
  FORM2_BMI_BANDS,
  FORM2_HFA_BANDS,
  FORM3_MIN_DAY_COLUMNS,
  FORM5_BMI_BANDS,
  form2GradeLabel,
  form2GradeLevels,
  form6GradeLabel,
  formatPercent,
  gradeSectionLabel,
  isElementaryGrade,
  readingFor,
  type FeedingAttendance,
  type Form2Line,
  type Form5BandCounts,
  type SbfpBeneficiaryView,
  type SbfpDelivery,
  type SbfpReading,
} from "@/lib/utils/sbfp";

const FORM_YEAR = "2026";

/** Everything the form headers and signature lines print. */
export interface SbfpHeaderInfo {
  schoolName: string;
  depedSchoolId: string;
  region: string;
  division: string;
  district: string;
  municipalityBarangay: string;
  schoolYear: string;
  principalName: string;
  principalTitle: string;
  focalPersonName: string;
  feedingStartDate: string | null;
  feedingEndDate: string | null;
  /** Scheduled midline weighing — the date Form 2 prints for a midline sheet. */
  midlineWeighingDate: string | null;
  isLastMileSchool: boolean | null;
}

export interface SbfpContactLine {
  kind: SbfpContactKind;
  name: string;
  designation: string | null;
  tel_no: string | null;
  mobile_no: string | null;
  email: string | null;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** "2026-08-03" → "08/03/2026", the forms' MM/DD/YYYY. */
export function mdy(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${m}/${d}/${y}` : "";
}

/** "2026-06-15" → "June 15, 2026". */
export function longDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const yesNo = (v: boolean | null | undefined): string =>
  v == null ? "" : v ? "Yes" : "No";

const sexLetter = (sex: SbfpBeneficiaryView["sex"]): string =>
  sex === "male" ? "M" : sex === "female" ? "F" : "";

const BMI_LABEL: Record<string, string> = {
  severely_wasted: "Severely Wasted",
  wasted: "Wasted",
  normal: "Normal",
  overweight: "Overweight",
  obese: "Obese",
};

const HFA_LABEL: Record<string, string> = {
  severely_stunted: "Severely Stunted",
  stunted: "Stunted",
  normal: "Normal",
  tall: "Tall",
};

/** The form's column is "BMI for 6 y.o. and above" — blank for a younger learner. */
function bmiCell(dob: string | null, r: SbfpReading | null): string {
  if (!r?.measured_at) return "";
  const months = ageInMonths(dob, r.measured_at);
  if (months === null || months < 72) return "";
  return formatBmi(bodyMassIndex(r.height_cm, r.weight_kg));
}

const num = (v: number | null | undefined): string => (v == null ? "" : String(v));

// ---------------------------------------------------------------------------
// Document scaffolding
// ---------------------------------------------------------------------------

type PageSize = "landscape" | "portrait";

const PAGE_RULE: Record<PageSize, string> = {
  // 8.5 × 13 (folio) — what DepEd schools print on.
  landscape: "@page { size: 13in 8.5in; margin: 0.4in; }",
  portrait: "@page { size: 8.5in 13in; margin: 0.5in; }",
};

const STYLES = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #000; background: #fff; }
${DEPED_HEADER_LOGOS_STYLES}
.sheet { break-after: page; }
.sheet:last-child { break-after: auto; }
.form-code { font-size: 8pt; font-style: italic; margin-bottom: 2px; }
.agency { font-size: 11pt; font-weight: bold; }
.title { text-align: center; font-weight: bold; font-size: 11pt; margin: 6px 0 8px; text-transform: uppercase; }
.subtitle { text-align: center; font-weight: bold; font-size: 10pt; margin: -4px 0 8px; text-transform: uppercase; }
.fields { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 24px; margin-bottom: 8px; font-size: 9pt; }
.fields.single { grid-template-columns: 1fr; }
.fields .v { font-weight: bold; text-transform: uppercase; }
table.f { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
table.f th, table.f td { border: 1px solid #000; padding: 2px 3px; vertical-align: middle; }
table.f th { font-weight: bold; text-align: center; font-size: 7.5pt; background: #f2f2f2; }
table.f td { font-size: 8pt; }
table.f.small td { font-size: 7pt; }
table.f.small th { font-size: 6.5pt; }
.c { text-align: center; }
.r { text-align: right; }
.nowrap { white-space: nowrap; }
tr.tot td { font-weight: bold; background: #f7f7f7; }
tr.grand td { font-weight: bold; background: #ececec; }
.sigs { display: flex; justify-content: space-between; gap: 40px; margin-top: 18px; break-inside: avoid; }
.sig { width: 40%; }
.sig .lbl { margin-bottom: 22px; }
.sig .name { border-top: 1px solid #000; padding-top: 2px; text-align: center; font-weight: bold; text-transform: uppercase; min-height: 14px; }
.sig .role { text-align: center; font-size: 8pt; }
.note { font-size: 8pt; font-style: italic; margin-top: 8px; }
.legend { display: flex; gap: 40px; font-size: 8pt; margin-top: 10px; break-inside: avoid; }
.legend b { display: block; margin-bottom: 2px; }
.empty { text-align: center; padding: 24px; font-style: italic; }
@media print {
  body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
}
`;

function documentHtml(title: string, size: PageSize, sheets: string[]): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${PAGE_RULE[size]}${STYLES}</style></head>
<body>
${sheets.map((s) => `<div class="sheet">${s}</div>`).join("\n")}
</body>
</html>`;
}

function agencyHeader(formCode: string, info: SbfpHeaderInfo): string {
  return `<div class="form-code">${esc(formCode)} (${FORM_YEAR})</div>
${buildDepEdHeaderWithLogos(`
  <div style="font-size:9pt;">Republic of the Philippines</div>
  <div class="agency">Department of Education</div>
  <div style="font-size:9pt;">${esc(info.region)}</div>
`)}`;
}

function field(label: string, value: string): string {
  return `<div>${esc(label)}: <span class="v">${esc(value)}</span></div>`;
}

function signature(label: string, name: string, role: string): string {
  return `<div class="sig">
  <div class="lbl">${esc(label)}</div>
  <div class="name">${esc(name)}</div>
  <div class="role">${esc(role)}</div>
</div>`;
}

function signatures(...blocks: string[]): string {
  return `<div class="sigs">${blocks.join("")}</div>`;
}

const schoolHead = (info: SbfpHeaderInfo) =>
  signature("Approved by:", info.principalName, info.principalTitle || "School Head");

/** The REGION / SCHOOL / SCHOOL ID block Forms 4, 5 and 6 open with. */
function shortSchoolBlock(info: SbfpHeaderInfo): string {
  const rdd = [info.region, info.division, info.district].filter(Boolean).join(" / ");
  return `<div class="fields single">
  ${field("REGION/DIVISION/DISTRICT", rdd)}
  ${field("NAME OF SCHOOL", info.schoolName)}
  ${field("SCHOOL ID NO.", info.depedSchoolId)}
</div>`;
}

// ---------------------------------------------------------------------------
// Form 1A — master list, baseline
// ---------------------------------------------------------------------------

function masterListFields(info: SbfpHeaderInfo): string {
  return `<div class="fields">
  ${field("Division", info.division)}
  ${field("Name of Principal", info.principalName)}
  ${field("City/ Municipality/Barangay", info.municipalityBarangay)}
  ${field("Name of Feeding Focal Person", info.focalPersonName)}
  ${field("Name of School / School District", [info.schoolName, info.district].filter(Boolean).join(" / "))}
  <div></div>
  ${field("School ID Number", info.depedSchoolId)}
</div>`;
}

export function buildForm1A(info: SbfpHeaderInfo, rows: SbfpBeneficiaryView[]): string {
  const body = rows
    .map((r, i) => {
      const b = r.baseline;
      return `<tr>
  <td class="c">${i + 1}</td>
  <td class="nowrap">${esc(r.name)}</td>
  <td class="c">${sexLetter(r.sex)}</td>
  <td>${esc(gradeSectionLabel(r.grade_level, r.section_name))}</td>
  <td class="c">${mdy(r.date_of_birth)}</td>
  <td class="c">${mdy(b?.measured_at)}</td>
  <td class="c nowrap">${esc(ageAtReading(r.date_of_birth, b))}</td>
  <td class="r">${num(b?.weight_kg)}</td>
  <td class="r">${num(b?.height_cm)}</td>
  <td class="r">${bmiCell(r.date_of_birth, b)}</td>
  <td>${esc(BMI_LABEL[b?.nutritional_status ?? ""] ?? "")}</td>
  <td>${esc(HFA_LABEL[b?.height_for_age ?? ""] ?? "")}</td>
  <td class="c">${r.classification === "primary" ? "Primary" : "Secondary"}</td>
  <td class="c">${yesNo(r.is_pregnant)}</td>
  <td class="c">${yesNo(r.has_infant)}</td>
  <td class="c">${yesNo(r.is_dewormed)}</td>
  <td class="c">${yesNo(r.milk_consent)}</td>
  <td class="c">${yesNo(r.is_4ps)}</td>
  <td class="c">${yesNo(r.is_previous_beneficiary)}</td>
</tr>`;
    })
    .join("\n");

  return `${agencyHeader("SBFP Form 1A", info)}
<div class="title">Master List Beneficiaries for School-Based Feeding Program (SBFP) ( SY ${esc(info.schoolYear)} ) - BASELINE</div>
${masterListFields(info)}
<table class="f small">
  <thead>
    <tr>
      <th rowspan="2">No.</th>
      <th rowspan="2">Name</th>
      <th rowspan="2">Sex</th>
      <th rowspan="2">Grade/ Section</th>
      <th rowspan="2">Date of Birth (MM/DD/YYYY)</th>
      <th rowspan="2">Date of Weighing / Measuring (MM/DD/YYYY)</th>
      <th rowspan="2">Age in Years / Months</th>
      <th rowspan="2">Weight (Kg)</th>
      <th rowspan="2">Height (cm)</th>
      <th rowspan="2">BMI for 6 y.o. and above</th>
      <th colspan="2">Nutritional Status (NS)</th>
      <th rowspan="2">Classification of Beneficiary (Primary or Secondary)*</th>
      <th rowspan="2">Pregnant? (Yes or No)</th>
      <th rowspan="2">With 0-1 year-old child/ren (Yes or No)</th>
      <th rowspan="2">Dewormed? (yes or no)</th>
      <th rowspan="2">Parent's consent for milk? (yes or no)</th>
      <th rowspan="2">Participation in 4Ps (yes or no)</th>
      <th rowspan="2">Beneficiary of SBFP in Previous Years (yes or no)</th>
    </tr>
    <tr><th>BMI-A</th><th>HFA</th></tr>
  </thead>
  <tbody>
    ${body || `<tr><td colspan="19" class="empty">No beneficiaries selected.</td></tr>`}
  </tbody>
</table>
<div class="note">* Primary: Severely Wasted and Wasted learners. Secondary: Stunted / Severely Stunted, PARDOs, indigent, IP and other identified learners.</div>
${signatures(
  signature("Prepared by:", info.focalPersonName, "School Feeding Focal Person"),
  schoolHead(info),
)}`;
}

// ---------------------------------------------------------------------------
// Form 1B — master list, endline
// ---------------------------------------------------------------------------

/**
 * The master list with a weighing beside attendance — Form 1B at endline. The
 * midline list uses the same layout: the 2026 workbook issues no midline sheet,
 * so it is captioned as a master list, not as a numbered form.
 */
function buildWeighingMasterList(
  info: SbfpHeaderInfo,
  rows: SbfpBeneficiaryView[],
  attendanceById: ReadonlyMap<string, FeedingAttendance>,
  period: Exclude<SbfpWeighingPeriod, "baseline">,
): string {
  const body = rows
    .map((r, i) => {
      const e = readingFor(r, period);
      const a = attendanceById.get(r.id);
      return `<tr>
  <td class="c">${i + 1}</td>
  <td class="nowrap">${esc(r.name)}</td>
  <td class="c">${sexLetter(r.sex)}</td>
  <td>${esc(gradeSectionLabel(r.grade_level, r.section_name))}</td>
  <td class="c">${mdy(r.date_of_birth)}</td>
  <td class="c">${mdy(e?.measured_at)}</td>
  <td class="c nowrap">${esc(ageAtReading(r.date_of_birth, e))}</td>
  <td class="r">${num(e?.weight_kg)}</td>
  <td class="r">${num(e?.height_cm)}</td>
  <td class="r">${bmiCell(r.date_of_birth, e)}</td>
  <td>${esc(BMI_LABEL[e?.nutritional_status ?? ""] ?? "")}</td>
  <td>${esc(HFA_LABEL[e?.height_for_age ?? ""] ?? "")}</td>
  <td class="c">${a ? a.present : ""}</td>
  <td class="c">${a ? a.feedingDays : ""}</td>
  <td class="r">${formatPercent(a?.percent ?? null)}</td>
</tr>`;
    })
    .join("\n");

  const average = averagePercent(rows.map((r) => attendanceById.get(r.id)?.percent ?? null));
  const code = period === "endline" ? "SBFP Form 1B" : "SBFP Master List";

  return `${agencyHeader(code, info)}
<div class="title">Master List Beneficiaries for School-Based Feeding Program (SBFP) ( SY ${esc(info.schoolYear)} ) - ${period.toUpperCase()}</div>
${masterListFields(info)}
<table class="f small">
  <thead>
    <tr>
      <th rowspan="2">No.</th>
      <th rowspan="2">Name</th>
      <th rowspan="2">Sex</th>
      <th rowspan="2">Grade/ Section</th>
      <th rowspan="2">Date of Birth (MM/DD/YYYY)</th>
      <th rowspan="2">Date of Weighing / Measuring (MM/DD/YYYY)</th>
      <th rowspan="2">Age in Years / Months</th>
      <th rowspan="2">Weight (Kg)</th>
      <th rowspan="2">Height (cm)</th>
      <th rowspan="2">BMI for 6 y.o. and above</th>
      <th colspan="2">Nutritional Status (NS)</th>
      <th colspan="3">Attendance</th>
    </tr>
    <tr>
      <th>BMI-A</th><th>HFA</th>
      <th>Days Present (A)</th><th>Feeding Days (B)</th><th>Percentage (A/B)*100</th>
    </tr>
  </thead>
  <tbody>
    ${body || `<tr><td colspan="15" class="empty">No beneficiaries selected.</td></tr>`}
    <tr class="tot">
      <td colspan="14" class="r">Average Percent Attendance</td>
      <td class="r">${formatPercent(average)}</td>
    </tr>
  </tbody>
</table>
${signatures(
  signature("Prepared by:", info.focalPersonName, "School Feeding Focal Person"),
  schoolHead(info),
)}`;
}

export function buildForm1B(
  info: SbfpHeaderInfo,
  rows: SbfpBeneficiaryView[],
  attendanceById: ReadonlyMap<string, FeedingAttendance>,
): string {
  return buildWeighingMasterList(info, rows, attendanceById, "endline");
}

/** Attendance is counted on the feeding days up to the midline. */
export function buildMidlineMasterList(
  info: SbfpHeaderInfo,
  rows: SbfpBeneficiaryView[],
  attendanceById: ReadonlyMap<string, FeedingAttendance>,
): string {
  return buildWeighingMasterList(info, rows, attendanceById, "midline");
}

// ---------------------------------------------------------------------------
// Form 2 — summary of beneficiaries & start / end of feeding
// ---------------------------------------------------------------------------

function form2Cells(line: Form2Line, dateCell: string): string {
  return `${FORM2_BMI_BANDS.map((b) => `<td class="c">${line.bmi[b.key]}</td>`).join("")}
  <td class="c"><b>${line.bmiTotal}</b></td>
  ${FORM2_HFA_BANDS.map((b) => `<td class="c">${line.hfa[b.key]}</td>`).join("")}
  <td class="c"><b>${line.hfaTotal}</b></td>
  <td class="c">${line.pregnantOrMother}</td>
  <td class="c">${line.pardo}</td>
  <td class="c">${line.stunted}</td>
  <td class="c">${line.indigent}</td>
  <td class="c">${line.ip}</td>
  <td class="c">${line.dewormed}</td>
  <td class="c">${line.fourPs}</td>
  <td class="c">${line.repeaters}</td>
  <td class="c nowrap">${dateCell}</td>`;
}

/** The date line and the "Date Feeding Started/Ended" cell for each period. */
function form2Date(
  info: SbfpHeaderInfo,
  period: SbfpWeighingPeriod,
): { dateLabel: string; dateValue: string | null } {
  if (period === "baseline") {
    return { dateLabel: "Date of Start of Feeding", dateValue: info.feedingStartDate };
  }
  if (period === "midline") {
    return { dateLabel: "Date of Midline Weighing", dateValue: info.midlineWeighingDate };
  }
  return { dateLabel: "Date of End of Feeding", dateValue: info.feedingEndDate };
}

function buildForm2Sheet(
  info: SbfpHeaderInfo,
  rows: SbfpBeneficiaryView[],
  period: SbfpWeighingPeriod,
  scope: "elementary" | "secondary",
): string {
  const levels = form2GradeLevels(scope, rows);
  const summary = buildForm2Summary(rows, period, levels);
  const caption = SBFP_WEIGHING_PERIODS.find((p) => p.value === period)?.form2Caption ?? "";
  const { dateLabel, dateValue } = form2Date(info, period);
  const date = esc(longDate(dateValue));

  const gradeRows = summary.grades
    .map(
      (g, i) => `<tr>
  <td rowspan="3" class="nowrap">${i + 1}.&nbsp; ${esc(form2GradeLabel(g.gradeLevel))}</td>
  <td class="c">M</td>${form2Cells(g.male, "")}
</tr>
<tr><td class="c">F</td>${form2Cells(g.female, "")}</tr>
<tr class="tot"><td class="c">Total</td>${form2Cells(g.total, date)}</tr>`,
    )
    .join("\n");

  const grand = summary.grandTotal;
  const lastMile =
    info.isLastMileSchool == null
      ? "___Y &nbsp; ___N"
      : info.isLastMileSchool
        ? "<u>&nbsp;✓&nbsp;</u>Y &nbsp; ___N"
        : "___Y &nbsp; <u>&nbsp;✓&nbsp;</u>N";

  return `${agencyHeader("SBFP Form 2", info)}
<div class="title">School-Based Feeding Program (SBFP) Summary of Beneficiaries &amp; ${caption} of Feeding (SY ${esc(info.schoolYear)})</div>
<div class="fields single">
  ${field("Schools Division Office", info.division)}
  ${field("City/ Municipality/Barangay", info.municipalityBarangay)}
  ${field("Name of School / School District", [info.schoolName, info.district].filter(Boolean).join(" / "))}
  ${field("School ID Number", info.depedSchoolId)}
  ${field(dateLabel, longDate(dateValue))}
  <div>Last Mile School: ${lastMile}</div>
</div>
<table class="f small">
  <thead>
    <tr>
      <th rowspan="4">Number of School Children by Grade Level</th>
      <th rowspan="4">Sex</th>
      <th colspan="11">No. of Primary Targets</th>
      <th colspan="4">No. of Secondary Targets</th>
      <th rowspan="4">No. of Learners Dewormed</th>
      <th rowspan="4">No. of 4 Ps Beneficiaries</th>
      <th rowspan="4">No. of Pupils who are beneficiaries in previous years (Repeaters)</th>
      <th rowspan="4">Date Feeding Started/Ended</th>
    </tr>
    <tr>
      <th colspan="10">Nutritional Status at Start/End of Feeding*</th>
      <th rowspan="3">No. of Adolescent Pregnant Learners/Adolescent Mothers with 0-1 year-old child/ren</th>
      <th rowspan="3">No. of Pupils-at-risk-of-dropping-out (PARDOs)</th>
      <th rowspan="3">No. of Stunted/ Severely Stunted</th>
      <th rowspan="3">No. of Indigent Learners</th>
      <th rowspan="3">No. of Indigenous Peoples (IPs)</th>
    </tr>
    <tr><th colspan="5">WEIGHT</th><th colspan="5">HEIGHT</th></tr>
    <tr>
      ${FORM2_BMI_BANDS.map((b) => `<th>${esc(b.label)}</th>`).join("")}<th>TOTAL</th>
      ${FORM2_HFA_BANDS.map((b) => `<th>${esc(b.label)}</th>`).join("")}<th>TOTAL</th>
    </tr>
  </thead>
  <tbody>
    ${gradeRows}
    <tr class="grand"><td rowspan="3">Grand Total</td><td class="c">M</td>${form2Cells(grand.male, "")}</tr>
    <tr class="grand"><td class="c">F</td>${form2Cells(grand.female, "")}</tr>
    <tr class="grand"><td class="c">Total</td>${form2Cells(grand.total, date)}</tr>
  </tbody>
</table>
${signatures(
  signature("Prepared by:", info.focalPersonName, "SBFP DepEd Focal"),
  schoolHead(info),
)}
<div class="note">Note: This form shall be prepared by the school before the start of feeding and after feeding, to be compiled by the SDO, and for final compilation by the RO, for submission to DepEd BLSS-SHD</div>`;
}

/**
 * Form 2 for one period. The workbook keeps an Elementary and a Junior/Senior
 * High sheet; each prints when the school has beneficiaries on it, and the
 * elementary sheet prints alone for a school with none yet.
 */
export function buildForm2Sheets(
  info: SbfpHeaderInfo,
  rows: SbfpBeneficiaryView[],
  period: SbfpWeighingPeriod,
): string[] {
  const elementary = rows.filter((r) => r.grade_level !== null && isElementaryGrade(r.grade_level));
  const secondary = rows.filter((r) => r.grade_level !== null && !isElementaryGrade(r.grade_level));
  const sheets: string[] = [];
  if (elementary.length > 0 || secondary.length === 0) {
    sheets.push(buildForm2Sheet(info, elementary, period, "elementary"));
  }
  if (secondary.length > 0) {
    sheets.push(buildForm2Sheet(info, secondary, period, "secondary"));
  }
  return sheets;
}

// ---------------------------------------------------------------------------
// Form 3 — record of daily feeding
// ---------------------------------------------------------------------------

export interface Form3Section {
  gradeLevel: number | null;
  sectionName: string;
  adviserName: string;
  rows: SbfpBeneficiaryView[];
}

const MONTH_NAMES = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

function gradeCaption(gradeLevel: number | null): string {
  if (gradeLevel === null) return "";
  if (gradeLevel === -1) return "SNED";
  if (gradeLevel === 0) return "Kinder";
  return String(gradeLevel);
}

export function buildForm3Sheet(
  info: SbfpHeaderInfo,
  section: Form3Section,
  yearMonth: string,
  days: readonly string[],
  codes: ReadonlyMap<string, ReadonlyMap<string, string>>,
): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const columns = Math.max(FORM3_MIN_DAY_COLUMNS, days.length);
  const slots = Array.from({ length: columns }, (_, i) => days[i] ?? null);

  const dateHead = slots
    .map((d) => `<th style="width:22px">${d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : ""}</th>`)
    .join("");
  const seqHead = slots.map((_, i) => `<th>${i + 1}</th>`).join("");

  const body = section.rows
    .map((r) => {
      const mine = codes.get(r.id);
      const cells = slots
        .map((d) => `<td class="c">${d ? esc(mine?.get(d) ?? "") : ""}</td>`)
        .join("");
      return `<tr>
  <td class="nowrap">${esc(r.name)}</td>
  <td class="c">${sexLetter(r.sex)}</td>
  ${cells}
  <td class="c">${r.is_dewormed ? "√" : "x"}</td>
</tr>`;
    })
    .join("\n");

  return `<div class="form-code">SBFP Form 3 (${FORM_YEAR})</div>
<div class="title" style="margin-bottom:0">School-Based Feeding Program</div>
<div class="title" style="margin-top:0">Record of Daily Feeding</div>
<div class="subtitle">For the month of ${MONTH_NAMES[m - 1] ?? ""} ${y}, SY ${esc(info.schoolYear)}</div>
<div class="fields">
  ${field("Region", info.region)}
  ${field("School", info.schoolName)}
  ${field("SDO", info.division)}
  ${field("School ID Number", info.depedSchoolId)}
  ${field("District", info.district)}
  ${field("Grade", `${gradeCaption(section.gradeLevel)}   Section: ${section.sectionName}`)}
</div>
<table class="f small">
  <thead>
    <tr>
      <th rowspan="3" style="width:22%">NAME OF PUPILS</th>
      <th rowspan="3" style="width:3%">SEX</th>
      <th colspan="${columns}">ACTUAL FEEDING</th>
      <th rowspan="3" style="width:6%">DEWORMED</th>
    </tr>
    <tr>${dateHead}</tr>
    <tr>${seqHead}</tr>
  </thead>
  <tbody>
    ${body || `<tr><td colspan="${columns + 3}" class="empty">No beneficiaries in this section.</td></tr>`}
  </tbody>
</table>
<div class="legend">
  <div>
    <b>B. Deworming</b>
    <div>( x ) - not dewormed</div>
    <div>( √ ) - dewormed</div>
  </div>
  <div>
    <b>D. Actual Feeding</b>
    ${SBFP_FEEDING_LEGEND.map((l) => `<div>( ${esc(l.code)} ) - ${esc(l.meaning)}</div>`).join("")}
  </div>
</div>
${signatures(
  signature("Prepared by:", section.adviserName, "Class Adviser"),
  schoolHead(info),
)}`;
}

// ---------------------------------------------------------------------------
// Form 4 — authorized consignees & school inspection team
// ---------------------------------------------------------------------------

function contactTable(lines: SbfpContactLine[]): string {
  // The issued sheet leaves three numbered blocks; more print if encoded.
  const padded: (SbfpContactLine | null)[] = [...lines];
  while (padded.length < 3) padded.push(null);
  return `<table class="f">
  <thead>
    <tr>
      <th style="width:4%"></th>
      <th style="width:30%">NAME &amp; DESIGNATION</th>
      <th style="width:12%">TEL. NO.</th>
      <th style="width:14%">MOBILE NO.</th>
      <th style="width:20%">EMAIL ADD</th>
      <th style="width:20%">SPECIMEN SIGNATURE</th>
    </tr>
  </thead>
  <tbody>
    ${padded
      .map(
        (c, i) => `<tr style="height:46px">
  <td class="c">${i + 1}</td>
  <td><b>${esc(c?.name ?? "")}</b>${c?.designation ? `<br>${esc(c.designation)}` : ""}</td>
  <td class="c">${esc(c?.tel_no ?? "")}</td>
  <td class="c">${esc(c?.mobile_no ?? "")}</td>
  <td>${esc(c?.email ?? "")}</td>
  <td></td>
</tr>`,
      )
      .join("\n")}
  </tbody>
</table>`;
}

export function buildForm4(info: SbfpHeaderInfo, contacts: SbfpContactLine[]): string {
  return `${agencyHeader("SBFP Form 4", info)}
${shortSchoolBlock(info)}
<div class="title" style="margin-bottom:0">School-Based Feeding Program</div>
<div class="title" style="margin-top:0">List of Authorized Consignees (SY: ${esc(info.schoolYear)})</div>
${contactTable(contacts.filter((c) => c.kind === "consignee"))}
<div class="title">School Inspection Team (SY: ${esc(info.schoolYear)})</div>
${contactTable(contacts.filter((c) => c.kind === "inspection"))}
<div class="note">Note: Only authorized consignees are allowed to receive the goods.<br>Use long hand signature.</div>`;
}

// ---------------------------------------------------------------------------
// Form 5 — milk component, list of beneficiaries
// ---------------------------------------------------------------------------

export function buildForm5Milk(info: SbfpHeaderInfo, rows: SbfpBeneficiaryView[]): string {
  const body = rows
    .map(
      (r, i) => `<tr>
  <td class="c">${i + 1}</td>
  <td class="nowrap">${esc(r.name)}</td>
  <td class="c">${sexLetter(r.sex)}</td>
  <td>${esc(gradeSectionLabel(r.grade_level, r.section_name))}</td>
  ${SBFP_MILK_TOLERANCE_OPTIONS.map(
    (o) => `<td class="c">${r.milk_tolerance === o.value ? "✓" : ""}</td>`,
  ).join("")}
</tr>`,
    )
    .join("\n");

  return `${agencyHeader("SBFP Form 5", info)}
${shortSchoolBlock(info)}
<div class="title" style="margin-bottom:0">School-Based Feeding Program - Milk Component</div>
<div class="title" style="margin-top:0">List of Beneficiaries (SY: ${esc(info.schoolYear)})</div>
<table class="f">
  <thead>
    <tr>
      <th rowspan="2" style="width:4%"></th>
      <th rowspan="2">Name</th>
      <th rowspan="2" style="width:5%">Sex</th>
      <th rowspan="2" style="width:16%">Grade &amp; Section</th>
      <th colspan="3">Classification of Students in terms of Milk Tolerance (Please check one)</th>
    </tr>
    <tr>
      ${SBFP_MILK_TOLERANCE_OPTIONS.map((o) => `<th style="width:14%">${esc(o.label)}</th>`).join("")}
    </tr>
  </thead>
  <tbody>
    ${body || `<tr><td colspan="7" class="empty">No beneficiaries selected.</td></tr>`}
  </tbody>
</table>
${signatures(
  signature("Prepared by:", info.focalPersonName, "School Feeding Focal Person"),
  schoolHead(info),
)}`;
}

// ---------------------------------------------------------------------------
// Form 5 — consolidated nutritional status and attendance report
// ---------------------------------------------------------------------------

function bandCells(c: Form5BandCounts): string {
  return `${FORM5_BMI_BANDS.map((b) => `<td class="c">${c.bands[b.key]}</td>`).join("")}<td class="c"><b>${c.total}</b></td>`;
}

export function buildForm5ConsolidatedSheet(
  info: SbfpHeaderInfo,
  rows: SbfpBeneficiaryView[],
  attendanceById: ReadonlyMap<string, FeedingAttendance>,
): string {
  const report = buildForm5ConsolidatedReport(rows, attendanceById);
  const body = report.sections
    .map(
      (s, i) => `<tr>
  <td class="c">${i + 1}</td>
  <td>${esc(s.label)}</td>
  <td class="c">${s.dewormed}</td>
  ${bandCells(s.before)}
  ${bandCells(s.after)}
  <td class="r">${formatPercent(s.attendance)}</td>
</tr>`,
    )
    .join("\n");

  return `<div class="form-code">SBFP Form 5</div>
<div class="title" style="margin-bottom:0">School-Based Feeding Program</div>
<div class="title" style="margin-top:0">Consolidated Nutritional Status and Attendance Report</div>
<div class="fields single">
  ${field("Region", info.region)}
  ${field("Division/District", [info.division, info.district].filter(Boolean).join(" / "))}
  ${field("School", info.schoolName)}
  ${field("BEIS ID No.", info.depedSchoolId)}
</div>
<table class="f">
  <thead>
    <tr>
      <th rowspan="3" colspan="2">GRADES AND SECTIONS</th>
      <th rowspan="3">No. of Pupils Dewormed</th>
      <th colspan="12">NUTRITIONAL STATUS</th>
      <th rowspan="3">PERCENTAGE ATTENDANCE</th>
    </tr>
    <tr><th colspan="6">BEFORE</th><th colspan="6">AFTER</th></tr>
    <tr>
      ${FORM5_BMI_BANDS.map((b) => `<th>${esc(b.label)}</th>`).join("")}<th>Total</th>
      ${FORM5_BMI_BANDS.map((b) => `<th>${esc(b.label)}</th>`).join("")}<th>Total</th>
    </tr>
  </thead>
  <tbody>
    ${body || `<tr><td colspan="16" class="empty">No beneficiaries selected.</td></tr>`}
    <tr class="grand">
      <td colspan="2">TOTAL</td>
      <td class="c">${report.total.dewormed}</td>
      ${bandCells(report.total.before)}
      ${bandCells(report.total.after)}
      <td class="r">AVERAGE: ${formatPercent(report.total.attendance)}</td>
    </tr>
  </tbody>
</table>
<div class="legend">
  <div><b>For 6-19 y.o</b>SW - Severely Wasted<br>W - Wasted<br>N - Normal<br>Ow - Overweight<br>O - Obese</div>
  <div><b>For below 6 y.o</b>SU - Severely Underweight<br>U - Underweight<br>N - Normal<br>Ow - Overweight</div>
</div>
${signatures(
  signature("Prepared by:", "", "Classroom Adviser / School Nurse"),
  signature("Noted by:", info.principalName, info.principalTitle || "School Head"),
)}
<div class="note">Note: This form shall be prepared by the school using the data from SBFP Form 4.</div>`;
}

// ---------------------------------------------------------------------------
// Form 6 — NFP and milk deliveries
// ---------------------------------------------------------------------------

function deliveryLines(ds: SbfpDelivery[], pick: (d: SbfpDelivery) => string): string {
  return ds.map((d) => `<div>${pick(d)}</div>`).join("");
}

function form6Table(
  info: SbfpHeaderInfo,
  rows: SbfpBeneficiaryView[],
  deliveries: SbfpDelivery[],
  component: "nfp" | "milk",
): string {
  const table = buildForm6Table(rows, deliveries, component);
  const grades = table.grades
    .map((g) => {
      const ds = g.deliveries;
      const span = `rowspan="3"`;
      return `<tr>
  <td ${span}>${esc(form6GradeLabel(g.gradeLevel))}</td>
  <td class="c">M</td><td class="c">${g.male}</td>
  <td ${span} class="c">${deliveryLines(ds, (d) => esc(mdy(d.delivered_on)))}</td>
  <td ${span} class="c">${deliveryLines(ds, (d) => String(d.packs_new))}</td>
  <td ${span} class="c">${deliveryLines(ds, (d) => String(d.packs_replacement))}</td>
  <td ${span} class="c">${deliveryLines(ds, (d) => String(d.packs_new + d.packs_replacement))}</td>
  <td ${span} class="c">${deliveryLines(ds, (d) => String(d.packs_rejected))}</td>
  <td ${span}>${deliveryLines(ds, (d) => esc(d.remarks ?? ""))}</td>
</tr>
<tr><td class="c">F</td><td class="c">${g.female}</td></tr>
<tr class="tot"><td class="c">Total</td><td class="c">${g.total}</td></tr>`;
    })
    .join("\n");

  const t = table.grand;
  const label = component === "nfp" ? "NFP DELIVERIES" : "MILK DELIVERIES";

  return `<div class="title">${label} (SY ${esc(info.schoolYear)})</div>
<table class="f small">
  <thead>
    <tr>
      <th rowspan="2">Grade Level</th>
      <th rowspan="2">Sex</th>
      <th rowspan="2">Number of Beneficiaries</th>
      <th rowspan="2">Date Delivered</th>
      <th colspan="3">No. of Packs Received</th>
      <th rowspan="2">No. of Packs for Replacement/ Rejected</th>
      <th rowspan="2">Remarks</th>
    </tr>
    <tr><th>New</th><th>Replacement</th><th>Total (New + Replacement)</th></tr>
  </thead>
  <tbody>
    ${grades}
    <tr class="grand">
      <td rowspan="3">GRAND TOTAL:</td>
      <td class="c">M</td><td class="c">${t.male}</td>
      <td rowspan="3"></td>
      <td rowspan="3" class="c">${t.packsNew}</td>
      <td rowspan="3" class="c">${t.packsReplacement}</td>
      <td rowspan="3" class="c">${t.packsNew + t.packsReplacement}</td>
      <td rowspan="3" class="c">${t.packsRejected}</td>
      <td rowspan="3"></td>
    </tr>
    <tr class="grand"><td class="c">F</td><td class="c">${t.female}</td></tr>
    <tr class="grand"><td class="c">Total</td><td class="c">${t.total}</td></tr>
  </tbody>
</table>
${signatures(
  signature("PREPARED BY:", info.focalPersonName, "School Feeding Focal Person"),
  signature("APPROVED BY:", info.principalName, info.principalTitle || "School Head"),
)}`;
}

export function buildForm6(
  info: SbfpHeaderInfo,
  rows: SbfpBeneficiaryView[],
  deliveries: SbfpDelivery[],
): string[] {
  const head = `${agencyHeader("SBFP Form 6", info)}
${shortSchoolBlock(info)}
<div class="title">School-Based Feeding Program</div>`;
  return [
    `${head}${form6Table(info, rows, deliveries, "nfp")}`,
    `${head}${form6Table(info, rows, deliveries, "milk")}`,
  ];
}

// ---------------------------------------------------------------------------
// Feedback Mechanism — issues and concerns log (no issued form)
// ---------------------------------------------------------------------------

export interface SbfpFeedbackLine {
  received_on: string;
  source: string | null;
  raised_by: string | null;
  category: string | null;
  concern: string;
  action_taken: string | null;
  status: string;
  resolved_on: string | null;
}

const multiline = (v: string | null | undefined): string => esc(v ?? "").replace(/\n/g, "<br>");

export function buildFeedbackLog(info: SbfpHeaderInfo, lines: SbfpFeedbackLine[]): string {
  const statusLabel = new Map<string, string>(
    SBFP_FEEDBACK_STATUS_OPTIONS.map((o) => [o.value, o.label]),
  );
  const count = (status: string) => lines.filter((l) => l.status === status).length;
  const body =
    lines.length === 0
      ? `<tr><td colspan="8" class="empty">No issues or concerns recorded.</td></tr>`
      : lines
          .map(
            (l, i) => `<tr>
  <td class="c">${i + 1}</td>
  <td class="c nowrap">${esc(mdy(l.received_on))}</td>
  <td>${esc(l.source ?? "")}${l.raised_by ? `<br><i>${esc(l.raised_by)}</i>` : ""}</td>
  <td>${esc(l.category ?? "")}</td>
  <td>${multiline(l.concern)}</td>
  <td>${multiline(l.action_taken)}</td>
  <td class="c">${esc(statusLabel.get(l.status) ?? l.status)}</td>
  <td class="c nowrap">${esc(mdy(l.resolved_on))}</td>
</tr>`,
          )
          .join("\n");

  return `${agencyHeader("SBFP Feedback Mechanism", info)}
${shortSchoolBlock(info)}
<div class="title" style="margin-bottom:0">School-Based Feeding Program</div>
<div class="title" style="margin-top:0">Feedback Mechanism: Issues and Concerns (SY: ${esc(info.schoolYear)})</div>
<table class="f">
  <thead>
    <tr>
      <th style="width:3%">No.</th>
      <th style="width:8%">Date Received</th>
      <th style="width:12%">Raised By</th>
      <th style="width:11%">Category</th>
      <th style="width:27%">Issue / Concern</th>
      <th style="width:23%">Action Taken</th>
      <th style="width:8%">Status</th>
      <th style="width:8%">Date Resolved</th>
    </tr>
  </thead>
  <tbody>
    ${body}
  </tbody>
</table>
<div class="note" style="font-style:normal">Total: <b>${lines.length}</b> &nbsp; Open: <b>${count("open")}</b> &nbsp; In progress: <b>${count("in_progress")}</b> &nbsp; Resolved: <b>${count("resolved")}</b></div>
${signatures(
  signature("Prepared by:", info.focalPersonName, "SBFP Focal Person"),
  schoolHead(info),
)}`;
}

// ---------------------------------------------------------------------------
// Print entry points
// ---------------------------------------------------------------------------

export const printSbfpForm1A = (info: SbfpHeaderInfo, rows: SbfpBeneficiaryView[]) =>
  printHTMLContent(documentHtml("SBFP Form 1A", "landscape", [buildForm1A(info, rows)]));

export const printSbfpForm1B = (
  info: SbfpHeaderInfo,
  rows: SbfpBeneficiaryView[],
  attendance: ReadonlyMap<string, FeedingAttendance>,
) =>
  printHTMLContent(
    documentHtml("SBFP Form 1B", "landscape", [buildForm1B(info, rows, attendance)]),
  );

export const printSbfpMidlineList = (
  info: SbfpHeaderInfo,
  rows: SbfpBeneficiaryView[],
  attendance: ReadonlyMap<string, FeedingAttendance>,
) =>
  printHTMLContent(
    documentHtml("SBFP Midline Master List", "landscape", [
      buildMidlineMasterList(info, rows, attendance),
    ]),
  );

export const printSbfpForm2 = (
  info: SbfpHeaderInfo,
  rows: SbfpBeneficiaryView[],
  period: SbfpWeighingPeriod,
) =>
  printHTMLContent(
    documentHtml("SBFP Form 2", "landscape", buildForm2Sheets(info, rows, period)),
  );

export const printSbfpForm3 = (
  info: SbfpHeaderInfo,
  sections: Form3Section[],
  yearMonth: string,
  days: readonly string[],
  codes: ReadonlyMap<string, ReadonlyMap<string, string>>,
) =>
  printHTMLContent(
    documentHtml(
      "SBFP Form 3",
      "landscape",
      sections.map((s) => buildForm3Sheet(info, s, yearMonth, days, codes)),
    ),
  );

export const printSbfpForm4 = (info: SbfpHeaderInfo, contacts: SbfpContactLine[]) =>
  printHTMLContent(documentHtml("SBFP Form 4", "portrait", [buildForm4(info, contacts)]));

export const printSbfpForm5Milk = (info: SbfpHeaderInfo, rows: SbfpBeneficiaryView[]) =>
  printHTMLContent(documentHtml("SBFP Form 5", "portrait", [buildForm5Milk(info, rows)]));

export const printSbfpForm5Consolidated = (
  info: SbfpHeaderInfo,
  rows: SbfpBeneficiaryView[],
  attendance: ReadonlyMap<string, FeedingAttendance>,
) =>
  printHTMLContent(
    documentHtml("SBFP Form 5 Consolidated", "landscape", [
      buildForm5ConsolidatedSheet(info, rows, attendance),
    ]),
  );

export const printSbfpForm6 = (
  info: SbfpHeaderInfo,
  rows: SbfpBeneficiaryView[],
  deliveries: SbfpDelivery[],
) =>
  printHTMLContent(documentHtml("SBFP Form 6", "portrait", buildForm6(info, rows, deliveries)));

export const printSbfpFeedbackLog = (info: SbfpHeaderInfo, lines: SbfpFeedbackLine[]) =>
  printHTMLContent(
    documentHtml("SBFP Feedback Mechanism", "landscape", [buildFeedbackLog(info, lines)]),
  );

/** For tests: the whole document a print entry point would send. */
export { documentHtml as buildSbfpDocument };
