/**
 * CRLA — CLASS RECORD (workbook sheet "Class Record").
 *
 * The condensed per-learner view filed with the school: Part 1 level and score
 * percentage, the Part 2 fluency / comprehension percentages and words per
 * minute, and the resulting reading profile.
 */

import { getAssessmentPhaseLabel, getGradeLevelLabel } from "@/lib/constants";
import type { CrlaReport } from "@/lib/assessments/crlaReport";
import {
  colgroupFrom,
  crlaPrintStyles,
  crlaReportHeader,
  crlaSignatories,
  esc,
  fmtInt,
  fmtPct,
} from "./crlaReportShell";
import { printHTMLContent } from "./utils";

export interface CrlaClassRecordParams {
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

export async function generateCrlaClassRecord(
  params: CrlaClassRecordParams,
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
  const { section, learners } = report;

  const rows = learners
    .map((l, i) => {
      const name = [l.student.last_name, l.student.first_name]
        .filter(Boolean)
        .join(", ");
      const sex =
        l.student.gender === "male"
          ? "Male"
          : l.student.gender === "female"
            ? "Female"
            : "";
      return `<tr>
        <td class="c">${i + 1}</td>
        <td class="lrn">${esc(l.student.lrn ?? "")}</td>
        <td>${esc(name)}</td>
        <td class="c">${sex}</td>
        <td class="c">${esc(l.part1Label ?? "")}</td>
        <td class="c">${fmtPct(l.part1Pct)}</td>
        <td class="c">${fmtPct(l.accuracyPct)}</td>
        <td class="c">${fmtPct(l.comprehensionPct)}</td>
        <td class="c">${fmtInt(l.wpm)}</td>
        <td>${esc(l.readingProfile ?? "")}</td>
        <td>${esc(l.remarks ?? "")}</td>
      </tr>`;
    })
    .join("");

  const body =
    learners.length > 0
      ? rows
      : `<tr><td class="c empty" colspan="11">No enrolled learners for this section.</td></tr>`;

  const gradeLabel = getGradeLevelLabel(section.gradeLevel);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>CRLA Class Record</title>
<style>${crlaPrintStyles()}</style></head><body>
${crlaReportHeader({
  schoolName,
  title: `${gradeLabel.toUpperCase()} READING ASSESSMENT CLASS RECORD`,
  subtitle: `${getAssessmentPhaseLabel(phase)} · ${language}`,
  facts: [
    ["School ID", schoolIdCode ?? ""],
    ["School Year", schoolYear],
    ["Teacher", teacherName],
    ["Grade", gradeLabel],
    ["Section", section.name],
    ["Language", language],
  ],
})}
<table class="report">
  ${colgroupFrom([
    3, // S/N
    9, // LRN
    20, // Name of Learner
    5, // Sex
    11, // Assessment Part 1 Level
    7, // % of Total Score
    7, // Reading Fluency
    8, // Reading Comprehension
    7, // Average Word Per Minute
    13, // Reading Profile
    10, // Remarks
  ])}
  <thead>
    <tr>
      <th rowspan="2">S/N</th>
      <th rowspan="2">LRN</th>
      <th rowspan="2">Name of Learner</th>
      <th rowspan="2">Sex</th>
      <th colspan="2">Assessment Part 1</th>
      <th colspan="3">Assessment Part 2</th>
      <th rowspan="2">Reading Profile</th>
      <th rowspan="2">Remarks</th>
    </tr>
    <tr>
      <th class="tight">Assessment Part 1 Level</th>
      <th class="tight">% of Total Score</th>
      <th class="tight">Reading Fluency</th>
      <th class="tight">Reading Comprehension</th>
      <th class="tight">Average Word Per Minute</th>
    </tr>
  </thead>
  <tbody>${body}</tbody>
</table>
<div class="legend">
  <strong>Reading Profile:</strong>
  Low Emerging Reader — Part 1 falls in a refresher band below Light &nbsp;·&nbsp;
  High Emerging Reader — reads under 25% of the passage in 1 minute and answers no question &nbsp;·&nbsp;
  Developing Reader — reads 26-50% accurately and answers 1 question &nbsp;·&nbsp;
  Transitioning Reader — reads 51-75% accurately and answers 2-3 questions &nbsp;·&nbsp;
  Reading At Grade Level — reads 76-100% accurately and answers 4-5 questions.
  <br />Where the accuracy and comprehension criteria disagree, the lower of the two is reported.
</div>
${crlaSignatories(teacherName, "Class Adviser", principalName, principalTitle)}
</body></html>`;

  printHTMLContent(html);
}
