/**
 * Phil-IRI — SCHOOL CONSOLIDATED PHIL-IRI RESULT (Enclosure 2 layout).
 *
 * The school-level roll-up filed with the division: one row per section grouped
 * by grade level, with a subtotal per grade and a grand total, counting learners
 * by sex across the four reading levels.
 *
 * Column layout mirrors the DepEd workbook:
 *   District · No. · Grade · Section · No. of Enrolment (M/F/T) ·
 *   Actual No. of Learners Tested (M/F/T) ·
 *   READING LEVEL → INDEPENDENT / INSTRUCTIONAL / FRUSTRATION / NON-READER,
 *   each as M / F / T / %.
 *
 * NOTE: the workbook's Enclosure 1 (School Consolidated FLAT Result, Grades 1-3)
 * is a different instrument (Functional Literacy Assessment Tool) with its own
 * literacy-level ladder — nothing in this system records it, so it is not
 * generated here.
 */

import { philIriPhaseLabel, PHILIRI_SCREENING_LEVELS } from "@/lib/constants";
import {
  buildDepEdHeaderWithLogos,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "./utils";

export type PhilIriTally = { M: number; F: number; T: number };

export interface PhilIriConsolidatedSection {
  gradeLevel: number;
  sectionName: string;
  enrolment: PhilIriTally;
  tested: PhilIriTally;
  /** Keyed by the PHILIRI_SCREENING_LEVELS labels. */
  levels: Record<string, PhilIriTally>;
}

export interface PhilIriConsolidatedParams {
  schoolName: string;
  district: string | null;
  schoolYear: string;
  phase: string; // BoSY | MoSY | EoSY
  language: string;
  sections: PhilIriConsolidatedSection[];
  preparedBy: string;
  principalName: string | null;
  principalTitle: string | null;
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

// Column order runs strongest → weakest on the DepEd form; PHILIRI_SCREENING_LEVELS
// is ordered weakest → strongest, so it is reversed here.
const LEVEL_COLUMNS: string[] = [...PHILIRI_SCREENING_LEVELS].reverse();

const ROMAN = [
  "",
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
];

/** Grade label in the workbook's roman-numeral convention ("K" for kinder). */
function gradeRoman(level: number): string {
  if (level === 0) return "K";
  return ROMAN[level] ?? String(level);
}

const emptyTally = (): PhilIriTally => ({ M: 0, F: 0, T: 0 });

function addTally(a: PhilIriTally, b: PhilIriTally): PhilIriTally {
  return { M: a.M + b.M, F: a.F + b.F, T: a.T + b.T };
}

/** Share of the tested population at this level; blank when nobody was tested. */
function share(count: number, tested: number): string {
  if (tested <= 0) return "";
  return `${((count / tested) * 100).toFixed(2)}%`;
}

function tallyCells(t: PhilIriTally): string {
  return `<td class="c">${t.M}</td><td class="c">${t.F}</td><td class="c">${t.T}</td>`;
}

function levelCells(
  levels: Record<string, PhilIriTally>,
  tested: number,
): string {
  return LEVEL_COLUMNS.map((label) => {
    const t = levels[label] ?? emptyTally();
    return `${tallyCells(t)}<td class="c">${share(t.T, tested)}</td>`;
  }).join("");
}

export async function generatePhilIriConsolidated(
  params: PhilIriConsolidatedParams,
): Promise<void> {
  const {
    schoolName,
    district,
    schoolYear,
    phase,
    language,
    sections,
    preparedBy,
    principalName,
    principalTitle,
  } = params;

  // Group by grade level, preserving the caller's ordering within each grade.
  const grades: number[] = [];
  const byGrade = new Map<number, PhilIriConsolidatedSection[]>();
  sections.forEach((s) => {
    if (!byGrade.has(s.gradeLevel)) {
      byGrade.set(s.gradeLevel, []);
      grades.push(s.gradeLevel);
    }
    byGrade.get(s.gradeLevel)!.push(s);
  });
  grades.sort((a, b) => a - b);

  let runningNo = 0;
  const grand = {
    enrolment: emptyTally(),
    tested: emptyTally(),
    levels: Object.fromEntries(
      LEVEL_COLUMNS.map((l) => [l, emptyTally()]),
    ) as Record<string, PhilIriTally>,
  };

  const bodyRows = grades
    .map((grade) => {
      const rows = byGrade.get(grade)!;
      const sub = {
        enrolment: emptyTally(),
        tested: emptyTally(),
        levels: Object.fromEntries(
          LEVEL_COLUMNS.map((l) => [l, emptyTally()]),
        ) as Record<string, PhilIriTally>,
      };

      const html = rows
        .map((s, i) => {
          runningNo += 1;
          sub.enrolment = addTally(sub.enrolment, s.enrolment);
          sub.tested = addTally(sub.tested, s.tested);
          LEVEL_COLUMNS.forEach((l) => {
            sub.levels[l] = addTally(sub.levels[l], s.levels[l] ?? emptyTally());
          });

          return `<tr>
            <td>${i === 0 && grade === grades[0] ? esc(district ?? "") : ""}</td>
            <td class="c">${runningNo}</td>
            <td class="c">${i === 0 ? gradeRoman(grade) : ""}</td>
            <td>${esc(s.sectionName)}</td>
            ${tallyCells(s.enrolment)}
            ${tallyCells(s.tested)}
            ${levelCells(s.levels, s.tested.T)}
          </tr>`;
        })
        .join("");

      grand.enrolment = addTally(grand.enrolment, sub.enrolment);
      grand.tested = addTally(grand.tested, sub.tested);
      LEVEL_COLUMNS.forEach((l) => {
        grand.levels[l] = addTally(grand.levels[l], sub.levels[l]);
      });

      const subtotal = `<tr class="subtotal">
        <td></td><td></td><td></td>
        <td>${esc(gradeRoman(grade))} Total</td>
        ${tallyCells(sub.enrolment)}
        ${tallyCells(sub.tested)}
        ${levelCells(sub.levels, sub.tested.T)}
      </tr>`;

      return html + subtotal;
    })
    .join("");

  const totalRow = `<tr class="grand">
    <td>TOTAL</td><td></td><td></td><td></td>
    ${tallyCells(grand.enrolment)}
    ${tallyCells(grand.tested)}
    ${levelCells(grand.levels, grand.tested.T)}
  </tr>`;

  const COLSPAN = 4 + 3 + 3 + LEVEL_COLUMNS.length * 4;
  const empty = `<tr><td class="c empty" colspan="${COLSPAN}">No sections with Phil-IRI coverage for this school year.</td></tr>`;

  const title = "SCHOOL CONSOLIDATED PHIL-IRI RESULT";

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
.form-subtitle { font-size: 9.5pt; }
.meta { font-size: 9pt; margin: 6px 0; }
table.report { width: 100%; border-collapse: collapse; }
table.report th, table.report td { border: 1px solid #000; padding: 2px 3px; font-size: 7.5pt; }
table.report th { background: #e8e8e8; text-align: center; font-weight: bold; vertical-align: middle; }
td.c { text-align: center; }
tr.subtotal td { font-weight: bold; background: #f4f4f4; }
tr.grand td { font-weight: bold; background: #dcdcdc; }
.empty { font-style: italic; color: #555; padding: 20px; }
.scale { margin-top: 12px; font-size: 8pt; }
.scale strong { display: block; margin-bottom: 3px; }
.sigs { margin-top: 20px; display: flex; justify-content: space-between; gap: 40px; }
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
  <div class="school-name">${esc(schoolName)}</div>
  <div class="form-title">${esc(title)}</div>
  <div class="form-subtitle">${esc(philIriPhaseLabel(phase))} · ${esc(language)}</div>
`)}
<div class="meta">
  <strong>School Year:</strong> ${esc(schoolYear)} &nbsp;&nbsp;
  <strong>School:</strong> ${esc(schoolName)} &nbsp;&nbsp;
  <strong>District:</strong> ${esc(district ?? "")}
</div>
<table class="report">
  <thead>
    <tr>
      <th rowspan="3">District</th>
      <th rowspan="3">No.</th>
      <th rowspan="3">Grade</th>
      <th rowspan="3">Section</th>
      <th colspan="3" rowspan="2">No. of Enrolment</th>
      <th colspan="3" rowspan="2">Actual No. of Learners Tested</th>
      <th colspan="${LEVEL_COLUMNS.length * 4}">READING LEVEL</th>
    </tr>
    <tr>
      ${LEVEL_COLUMNS.map((l) => `<th colspan="4">${esc(l.toUpperCase())}</th>`).join("")}
    </tr>
    <tr>
      <th>M</th><th>F</th><th>T</th>
      <th>M</th><th>F</th><th>T</th>
      ${LEVEL_COLUMNS.map(() => `<th>M</th><th>F</th><th>T</th><th>%</th>`).join("")}
    </tr>
  </thead>
  <tbody>
    ${sections.length > 0 ? bodyRows + totalRow : empty}
  </tbody>
</table>
<div class="scale">
  <strong>Reading Level:</strong>
  Independent — reads with ease and understanding &nbsp;·&nbsp;
  Instructional — reads with teacher guidance &nbsp;·&nbsp;
  Frustration — reads with difficulty and little understanding &nbsp;·&nbsp;
  Non-Reader — no correct response on the screening test.
  <br />Percentages are of the section's (or grade's) Actual No. of Learners Tested.
</div>
<div class="sigs">
  <div class="sig">
    <div class="sig-label">Prepared by:</div>
    <div class="sig-name">${esc(preparedBy)}</div>
    <div class="sig-title">School Reading Coordinator</div>
  </div>
  <div class="sig">
    <div class="sig-label">Checked by:</div>
    <div class="sig-name">${esc(principalName ?? "")}</div>
    <div class="sig-title">${esc(principalTitle || "Principal")}</div>
  </div>
</div>
</body></html>`;

  printHTMLContent(html);
}
