/**
 * Phil-IRI — MATRIX OF READING PROFILE OF PUPILS WHO UNDERGO PHIL-IRI.
 *
 * The section-level consolidation the school reading coordinator files: one row
 * per learner carrying the Form 3A/3B detail (miscue tally, word recognition,
 * per-question comprehension marks) and the resulting reading profile, split
 * into a MALE block and a FEMALE block, each repeating the full column header.
 *
 * Column layout mirrors the DepEd workbook exactly (24 columns):
 *   No · Name · 7 miscue types · Self-Correction · Total ·
 *   Word Recognition (Ave. Perf. / Level) · Questions 1-7 ·
 *   Comprehension (Correct Answer / Ave. Perf. / Level) · Reading Profile
 *
 * Each learner's figures come from their FRONTIER read — the highest-grade
 * passage they were tested on — which is the same read deriveFinalProfile()
 * bases the profile on.
 */

import {
  PHILIRI_COMPREHENSION_QUESTIONS,
  PHILIRI_MISCUE_TYPES,
  PHILIRI_SELF_CORRECTION,
  getGradeLevelLabel,
} from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import type { PhilIriComprehensionAnswer, Student } from "@/types";
import {
  buildDepEdHeaderWithLogos,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "./utils";

/** One learner's frontier read, already resolved by the caller. */
export interface PhilIriMatrixLearner {
  student: Student;
  /** Per-miscue-type counts from the frontier read (keys of PHILIRI_MISCUE_TYPES). */
  miscueCounts: Record<string, number | null> | null;
  totalMiscues: number | null;
  wordReadingScore: number | null; // %
  wordReadingLevel: string | null;
  /** q1..qn marks from the frontier read. */
  answers: Record<string, PhilIriComprehensionAnswer> | null;
  comprehensionRaw: number | null;
  comprehensionScore: number | null; // %
  comprehensionLevel: string | null;
  /** Final profile label, or the screening level when no passage was read. */
  readingProfile: string;
}

export interface PhilIriMatrixParams {
  schoolId: number | null;
  schoolName?: string;
  language: string;
  gradeLevel: number;
  sectionName: string;
  teacherName: string;
  phase: string; // BoSY | MoSY | EoSY
  schoolYear: string;
  learners: PhilIriMatrixLearner[];
}

const escapeMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (c) => escapeMap[c]!);
}

// The workbook labels the three administrations Pretest / Midtest / Posttest;
// the app stores them as BoSY / MoSY / EoSY.
const PHASE_COLUMNS: { phase: string; label: string }[] = [
  { phase: "BoSY", label: "Pretest" },
  { phase: "MoSY", label: "Midtest" },
  { phase: "EoSY", label: "Posttest" },
];

const QUESTION_KEYS = Array.from(
  { length: PHILIRI_COMPREHENSION_QUESTIONS },
  (_, i) => `q${i + 1}`,
);

function num(v: number | null | undefined): string {
  return typeof v === "number" ? String(v) : "";
}

function pct(v: number | null | undefined): string {
  return typeof v === "number" ? `${v}%` : "";
}

// Fixed column widths (% of the landscape page), in table order. 24 columns:
// No · Name · 7 miscues · Self-Correction · Total · WR Ave/Level · Q1-7 ·
// Comp Correct/Ave/Level · Reading Profile. Must sum to 100.
const COL_WIDTHS: number[] = [
  2.5, // No.
  12, // Name of Pupils
  ...new Array(PHILIRI_MISCUE_TYPES.length + 1).fill(4.2), // miscues + self-correction
  3, // Total
  4, // Word Recognition — Ave. Perf.
  5.5, // Word Recognition — Level
  ...new Array(PHILIRI_COMPREHENSION_QUESTIONS).fill(2), // Questions 1..n
  3.5, // Comprehension — Correct Answer
  4, // Comprehension — Ave. Perf.
  5.5, // Comprehension — Level
  12.4, // Reading Profile
];

const COLGROUP = `<colgroup>${COL_WIDTHS.map(
  (w) => `<col style="width:${w}%">`,
).join("")}</colgroup>`;

/** Two header rows (grouped + leaf), repeated above each sex block. */
function headerRows(): string {
  const miscueHeads = [
    ...PHILIRI_MISCUE_TYPES.map((m) => m.en),
    PHILIRI_SELF_CORRECTION.en,
  ]
    .map((h) => `<th rowspan="2" class="tight">${esc(h)}</th>`)
    .join("");

  return `<tr>
    <th rowspan="2">No.</th>
    <th rowspan="2">Name of Pupils</th>
    ${miscueHeads}
    <th rowspan="2">Total</th>
    <th colspan="2">Word Recognition</th>
    <th colspan="${PHILIRI_COMPREHENSION_QUESTIONS}">Questions</th>
    <th colspan="3">Comprehension</th>
    <th rowspan="2">Reading Profile</th>
  </tr>
  <tr>
    <th class="tight">Ave. Perf.</th>
    <th class="tight">Level</th>
    ${QUESTION_KEYS.map((_, i) => `<th>${i + 1}</th>`).join("")}
    <th class="tight">Correct Answer</th>
    <th class="tight">Ave. Perf.</th>
    <th class="tight">Level</th>
  </tr>`;
}

function learnerRow(row: PhilIriMatrixLearner, index: number): string {
  const { student, miscueCounts, answers } = row;
  const counts = miscueCounts ?? {};

  const miscueCells = [
    ...PHILIRI_MISCUE_TYPES.map((m) => m.key),
    PHILIRI_SELF_CORRECTION.key,
  ]
    .map((k) => `<td class="c">${num(counts[k])}</td>`)
    .join("");

  const questionCells = QUESTION_KEYS.map((q) => {
    const a = answers?.[q];
    const mark = a?.correct === true ? "✓" : a?.correct === false ? "✗" : "";
    return `<td class="c">${mark}</td>`;
  }).join("");

  const name = [student.last_name, student.first_name].filter(Boolean).join(", ");

  return `<tr>
    <td class="c">${index + 1}</td>
    <td>${esc(name)}</td>
    ${miscueCells}
    <td class="c">${num(row.totalMiscues)}</td>
    <td class="c">${pct(row.wordReadingScore)}</td>
    <td class="c">${esc(row.wordReadingLevel)}</td>
    ${questionCells}
    <td class="c">${num(row.comprehensionRaw)}</td>
    <td class="c">${pct(row.comprehensionScore)}</td>
    <td class="c">${esc(row.comprehensionLevel)}</td>
    <td>${esc(row.readingProfile)}</td>
  </tr>`;
}

/** One MALE / FEMALE block: repeated header, band row, then the learner rows. */
function sexBlock(label: string, rows: PhilIriMatrixLearner[]): string {
  const COLSPAN =
    2 + PHILIRI_MISCUE_TYPES.length + 1 + 1 + 2 + PHILIRI_COMPREHENSION_QUESTIONS + 3 + 1;
  const body =
    rows.length > 0
      ? rows.map(learnerRow).join("")
      : `<tr><td class="c empty" colspan="${COLSPAN}">No learners</td></tr>`;

  return `<table class="matrix">
    ${COLGROUP}
    <thead>${headerRows()}</thead>
    <tbody>
      <tr class="band"><td></td><td colspan="${COLSPAN - 1}">${esc(label)}</td></tr>
      ${body}
    </tbody>
  </table>`;
}

export async function generatePhilIriMatrix(
  params: PhilIriMatrixParams,
): Promise<void> {
  const {
    schoolId,
    language,
    gradeLevel,
    sectionName,
    teacherName,
    phase,
    schoolYear,
    learners,
  } = params;

  let schoolName = params.schoolName ?? "";
  if (!schoolName && schoolId) {
    const { data } = await supabase
      .from("sms_schools")
      .select("name")
      .eq("id", schoolId)
      .single();
    schoolName = data?.name ?? "";
  }

  const males = learners.filter((l) => l.student.gender === "male");
  const females = learners.filter((l) => l.student.gender === "female");

  const phaseMarks = PHASE_COLUMNS.map(
    (p) => `${esc(p.label)} <span class="mark">${p.phase === phase ? "✓" : "&nbsp;&nbsp;"}</span>`,
  ).join("&nbsp;&nbsp;&nbsp;");

  const title = `MATRIX OF READING PROFILE OF PUPILS WHO UNDERGO PHIL-IRI (${language.toUpperCase()})`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { size: 13in 8.5in; margin: 0.4in; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: "Times New Roman", serif; font-size: 9pt; line-height: 1.3; color: #000; background: #fff; }
${DEPED_HEADER_LOGOS_STYLES}
.deped-header-with-logos { margin-bottom: 8px; padding-bottom: 4px; border-bottom: none; }
.deped-logo-left-wrap, .deped-logo-right-wrap, .deped-logo-img { width: 70px; }
.deped-logo-img { height: 70px; }
.org-line { font-size: 9pt; }
.school-name { font-size: 12pt; font-weight: bold; text-transform: uppercase; }
.form-title { font-size: 11pt; font-weight: bold; margin-top: 8px; }
.meta { display: flex; justify-content: space-between; gap: 16px; font-size: 9pt; margin: 8px 0 6px; flex-wrap: wrap; }
.mark { display: inline-block; min-width: 22px; border-bottom: 1px solid #000; text-align: center; font-weight: bold; }
table.matrix { width: 100%; border-collapse: collapse; margin-bottom: 14px; table-layout: fixed; }
table.matrix th, table.matrix td { border: 1px solid #000; padding: 2px 3px; font-size: 7.5pt; word-break: break-word; }
table.matrix th { background: #e8e8e8; text-align: center; font-weight: bold; vertical-align: middle; }
/* Narrow columns whose labels ("Mispronunciation", "Instructional") must wrap
   rather than overflow the fixed width. */
th.tight { font-size: 6.5pt; line-height: 1.05; }
table.matrix td { line-height: 1.1; }
td.c { text-align: center; }
tr.band td { font-weight: bold; text-transform: uppercase; background: #f4f4f4; }
.empty { font-style: italic; color: #555; }
.sigs { margin-top: 18px; display: flex; justify-content: space-between; gap: 40px; }
.sig { width: 45%; font-size: 9pt; }
.sig-label { margin-bottom: 26px; }
.sig-name { border-top: 1px solid #000; padding-top: 2px; text-align: center; font-weight: bold; text-transform: uppercase; }
.sig-title { text-align: center; font-size: 8pt; }
@media print {
  body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
}
</style></head><body>
${buildDepEdHeaderWithLogos(`
  <div class="org-line">Republic of the Philippines</div>
  <div class="org-line">Department of Education</div>
  <div class="org-line">SCHOOLS DIVISION OF BAYUGAN CITY</div>
  <div class="school-name">${esc(schoolName || "Department of Education")}</div>
  <div class="form-title">${esc(title)}</div>
`)}
<div class="meta">
  <div><strong>SY:</strong> ${esc(schoolYear)}</div>
  <div><strong>Grade and Section:</strong> ${esc(getGradeLevelLabel(gradeLevel))} — ${esc(sectionName)}</div>
  <div><strong>Teacher:</strong> ${esc(teacherName)}</div>
  <div>${phaseMarks}</div>
</div>
${sexBlock("Male", males)}
${sexBlock("Female", females)}
<div class="sigs">
  <div class="sig">
    <div class="sig-label">Prepared by:</div>
    <div class="sig-name">${esc(teacherName)}</div>
    <div class="sig-title">Class Adviser</div>
  </div>
  <div class="sig">
    <div class="sig-label">Checked by:</div>
    <div class="sig-name">&nbsp;</div>
    <div class="sig-title">School Reading Coordinator</div>
  </div>
</div>
</body></html>`;

  printHTMLContent(html);
}
