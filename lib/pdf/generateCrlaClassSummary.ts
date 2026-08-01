/**
 * CRLA — CLASS SUMMARY (workbook sheet "Class Summary").
 *
 * Two aggregate tables over one section, each broken down Male / Female / Total:
 *   1. Counts — enrolled, assessed, Part 1 level counts, Part 2 averages
 *      (fluency %, comprehension %, average WPM), reading-profile counts.
 *   2. Percent of learners — assessed %, Part 1 level %, reading-profile %.
 *
 * Averages are over the learners who actually have that figure, so a section
 * part-way through Part 2 does not read as though the rest scored zero.
 */

import {
  CRLA_READING_PROFILES,
  getAssessmentPhaseLabel,
  getGradeLevelLabel,
} from "@/lib/constants";
import type { CrlaReport, CrlaReportLearner } from "@/lib/assessments/crlaReport";
import { isAssessed } from "@/lib/assessments/crlaReport";
import {
  colgroupFrom,
  crlaPrintStyles,
  crlaReportHeader,
  crlaSignatories,
  esc,
  fmtNum2,
  fmtPct,
  fmtPct2,
} from "./crlaReportShell";
import { printHTMLContent } from "./utils";

export interface CrlaClassSummaryParams {
  report: CrlaReport;
  schoolName: string;
  schoolIdCode: string | null;
  teacherName: string;
  language: string;
  phase: string;
  schoolYear: string;
  principalName: string | null;
  principalTitle: string | null;
}

type SexBucket = { key: string; label: string };

const BUCKETS: SexBucket[] = [
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
  { key: "total", label: "Total" },
];

/** Mean of the non-null values, or null when nothing has been scored. */
function mean(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Share as a whole percentage, or null when the denominator is zero. */
function share(count: number, total: number): number | null {
  return total <= 0 ? null : (count / total) * 100;
}

export async function generateCrlaClassSummary(
  params: CrlaClassSummaryParams,
): Promise<void> {
  const {
    report,
    schoolName,
    schoolIdCode,
    teacherName,
    language,
    phase,
    schoolYear,
    principalName,
    principalTitle,
  } = params;
  const { section, bands, learners } = report;

  // Part 1 level columns come from the material's own bands (weakest first), so
  // the 20-point Grade 3 English form and the 30-point form both label correctly.
  const part1Labels =
    bands.length > 0
      ? [...bands]
          .sort((a, b) => Number(a.min_score) - Number(b.min_score))
          .map((b) => b.label)
      : ["Full Refresher", "Moderate Refresher", "Light Refresher", "Grade Ready"];

  const inBucket = (l: CrlaReportLearner, key: string): boolean =>
    key === "total" ? true : l.student.gender === key;

  const gradeLabel = getGradeLevelLabel(section.gradeLevel);

  // ---- Table 1: counts + averages ----------------------------------------
  const countRows = BUCKETS.map((b) => {
    const rows = learners.filter((l) => inBucket(l, b.key));
    const assessed = rows.filter(isAssessed);

    const part1Cells = part1Labels
      .map(
        (label) =>
          `<td class="c">${assessed.filter((l) => l.part1Label === label).length}</td>`,
      )
      .join("");

    const avgFluency = mean(assessed.map((l) => l.accuracyPct));
    const avgComprehension = mean(assessed.map((l) => l.comprehensionPct));
    const avgWpm = mean(assessed.map((l) => l.wpm));

    const profileCells = CRLA_READING_PROFILES.map(
      (p) =>
        `<td class="c">${assessed.filter((l) => l.readingProfile === p).length}</td>`,
    ).join("");

    return `<tr${b.key === "total" ? ' class="grand"' : ""}>
      <td>${esc(gradeLabel)}</td>
      <td>${esc(section.name)}</td>
      <td>${esc(section.teacherName || teacherName)}</td>
      <td>${esc(language)}</td>
      <td class="c">${esc(b.label)}</td>
      <td class="c">${rows.length}</td>
      <td class="c">${assessed.length}</td>
      ${part1Cells}
      <td class="c">${fmtPct2(avgFluency)}</td>
      <td class="c">${fmtPct2(avgComprehension)}</td>
      <td class="c">${fmtNum2(avgWpm)}</td>
      ${profileCells}
    </tr>`;
  }).join("");

  // ---- Table 2: percent of learners --------------------------------------
  const percentRows = BUCKETS.map((b) => {
    const rows = learners.filter((l) => inBucket(l, b.key));
    const assessed = rows.filter(isAssessed);
    const denom = assessed.length;

    const part1Cells = part1Labels
      .map(
        (label) =>
          `<td class="c">${fmtPct(share(assessed.filter((l) => l.part1Label === label).length, denom))}</td>`,
      )
      .join("");

    const profileCells = CRLA_READING_PROFILES.map(
      (p) =>
        `<td class="c">${fmtPct(share(assessed.filter((l) => l.readingProfile === p).length, denom))}</td>`,
    ).join("");

    return `<tr${b.key === "total" ? ' class="grand"' : ""}>
      <td>${esc(language)}</td>
      <td class="c">${esc(b.label)}</td>
      <td class="c">${fmtPct(share(assessed.length, rows.length))}</td>
      ${part1Cells}
      ${profileCells}
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>CRLA Class Summary</title>
<style>${crlaPrintStyles()}</style></head><body>
${crlaReportHeader({
  schoolName,
  title: `${gradeLabel.toUpperCase()} ASSESSMENT SCORESHEET (CLASS SUMMARY)`,
  subtitle: `${getAssessmentPhaseLabel(phase)} · ${language}`,
  facts: [
    ["School ID", schoolIdCode ?? ""],
    ["School Year", schoolYear],
    ["Grade", gradeLabel],
    ["Section", section.name],
    ["Teacher", section.teacherName || teacherName],
  ],
})}
<table class="report">
  ${colgroupFrom([
    5, // Grade
    5.5, // Section
    7.5, // Teacher
    8, // Language
    4, // Sex
    4.5, // Enrolled
    4.5, // Assessed
    ...part1Labels.map(() => 4.4),
    4.5, // Reading Fluency
    5.5, // Reading Comprehension
    4.5, // Average WPM
    ...CRLA_READING_PROFILES.map(() => 5),
  ])}
  <thead>
    <tr>
      <th rowspan="2">Grade</th>
      <th rowspan="2">Section</th>
      <th rowspan="2">Teacher</th>
      <th rowspan="2">Language</th>
      <th rowspan="2">Sex</th>
      <th rowspan="2" class="tight">Number of Learners Enrolled</th>
      <th rowspan="2" class="tight">Number of Learners Assessed</th>
      <th colspan="${part1Labels.length}">Assessment Part 1 Level</th>
      <th colspan="3">Assessment Part 2 Average Score</th>
      <th colspan="${CRLA_READING_PROFILES.length}">Reading Profile</th>
    </tr>
    <tr>
      ${part1Labels.map((l) => `<th class="tight">${esc(l)}</th>`).join("")}
      <th class="tight">Reading Fluency</th>
      <th class="tight">Reading Comprehension</th>
      <th class="tight">Average Word Per Minute</th>
      ${CRLA_READING_PROFILES.map((p) => `<th class="tight">${esc(p)}</th>`).join("")}
    </tr>
  </thead>
  <tbody>${countRows}</tbody>
</table>

<div class="section-title">Percent (%) of Learners</div>
<table class="report">
  ${colgroupFrom([
    12, // Language
    6, // Sex
    9, // Percent of Learners Assessed
    ...part1Labels.map(() => 7.5),
    ...CRLA_READING_PROFILES.map(() => 8.6),
  ])}
  <thead>
    <tr>
      <th rowspan="2">Language</th>
      <th rowspan="2">Sex</th>
      <th rowspan="2" class="tight">Percent of Learners Assessed</th>
      <th colspan="${part1Labels.length}">Assessment Part 1 Level</th>
      <th colspan="${CRLA_READING_PROFILES.length}">Reading Profile</th>
    </tr>
    <tr>
      ${part1Labels.map((l) => `<th class="tight">${esc(l)}</th>`).join("")}
      ${CRLA_READING_PROFILES.map((p) => `<th class="tight">${esc(p)}</th>`).join("")}
    </tr>
  </thead>
  <tbody>${percentRows}</tbody>
</table>
<div class="legend">
  Percentages are of the learners assessed, except "Percent of Learners Assessed"
  which is of those enrolled. Part 2 averages cover only learners who have that
  figure recorded.
</div>
${crlaSignatories(teacherName, "Class Adviser", principalName, principalTitle)}
</body></html>`;

  printHTMLContent(html);
}
