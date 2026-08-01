/**
 * CRLA — READING SCORESHEET (workbook sheet "G<n> <Language> Reading Scoresheet").
 *
 * The adviser's working sheet: one row per learner carrying both halves of the
 * assessment — Part 1 task scores and the derived reading level, then the
 * Part 2 story figures (miscues, words read, time, WPM, accuracy, comprehension,
 * learner experience, observation level) and the resulting reading profile.
 */

import {
  CRLA_LEARNER_EXPERIENCE_MAX,
  getGradeLevelLabel,
  getAssessmentPhaseLabel,
} from "@/lib/constants";
import type { CrlaReport } from "@/lib/assessments/crlaReport";
import {
  colgroupFrom,
  crlaPrintStyles,
  crlaReportHeader,
  crlaSignatories,
  esc,
  fmtInt,
  fmtPct,
  fmtTime,
} from "./crlaReportShell";
import { printHTMLContent } from "./utils";

export interface CrlaReadingScoresheetParams {
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

export async function generateCrlaReadingScoresheet(
  params: CrlaReadingScoresheetParams,
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
  const { section, tasks, maxTotal, learners } = report;

  const males = learners.filter((l) => l.student.gender === "male").length;
  const females = learners.filter((l) => l.student.gender === "female").length;
  const assessed = learners.filter((l) => l.part1Total !== null).length;

  const taskHeads = tasks
    .map(
      (t) =>
        `<th class="tight">${esc(t.label)}<br/>(${Number(t.max_score)})</th>`,
    )
    .join("");

  const rows = learners
    .map((l, i) => {
      const taskCells = tasks
        .map((t) => `<td class="c">${fmtInt(l.taskScores[t.id])}</td>`)
        .join("");
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
        <td class="c">${esc(l.dateAssessed ?? "")}</td>
        ${taskCells}
        <td class="c">${fmtInt(l.part1Total)}</td>
        <td class="c">${esc(l.part1Label ?? "")}</td>
        <td>${esc(l.storyTitle ?? "")}</td>
        <td class="c">${fmtInt(l.miscues)}</td>
        <td class="c">${fmtInt(l.wordsRead)}</td>
        <td class="c">${fmtTime(l.readingTimeSeconds)}</td>
        <td class="c">${fmtInt(l.wpm)}</td>
        <td class="c">${fmtPct(l.accuracyPct)}</td>
        <td class="c">${fmtInt(l.comprehensionCorrect)}</td>
        <td class="c">${fmtInt(l.learnerExperience)}</td>
        <td class="c">${l.observationLevel ? `Level ${l.observationLevel}` : ""}</td>
        <td>${esc(l.readingProfile ?? "")}</td>
        <td>${esc(l.remarks ?? "")}</td>
      </tr>`;
    })
    .join("");

  const COLSPAN = 5 + tasks.length + 2 + 11;
  const body =
    learners.length > 0
      ? rows
      : `<tr><td class="c empty" colspan="${COLSPAN}">No enrolled learners for this section.</td></tr>`;

  // Relative column weights, normalised to 100% — holds for the 2-task Grade 3
  // English form as well as the 3-task form.
  const colgroup = colgroupFrom([
    2.6, // S/N
    6, // LRN
    12, // Name of Learner
    4.2, // Sex
    5.5, // Date of Assessment
    ...tasks.map(() => 3), // task scores
    4.2, // Total Score
    6, // Reading Level
    8, // Story
    3.6, // No. of Miscues
    3.6, // Words Read
    4, // Time Used
    3.2, // WPM
    5, // % of Correct Words Read
    4.2, // Total Correct Answer
    4.6, // Learner Experience
    4.6, // Observation Level
    9, // Learner Reading Profile
    5, // Remarks
  ]);

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>CRLA Reading Scoresheet</title>
<style>${crlaPrintStyles()}</style></head><body>
${crlaReportHeader({
  schoolName,
  title: `${getGradeLevelLabel(section.gradeLevel).toUpperCase()} READING SCORESHEET`,
  subtitle: `${getAssessmentPhaseLabel(phase)} · ${language}`,
  facts: [
    ["School ID", schoolIdCode ?? ""],
    ["School Year", schoolYear],
    ["Teacher", teacherName],
    ["Grade", getGradeLevelLabel(section.gradeLevel)],
    ["Section", section.name],
    ["Language", language],
    ["Total Enrolment", String(learners.length)],
    ["Male", String(males)],
    ["Female", String(females)],
    ["Total Assessed", String(assessed)],
  ],
})}
<table class="report">
  ${colgroup}
  <thead>
    <tr>
      <th rowspan="2">S/N</th>
      <th rowspan="2">LRN</th>
      <th rowspan="2">Name of Learner</th>
      <th rowspan="2">Sex</th>
      <th rowspan="2" class="tight">Date of Assessment</th>
      <th colspan="${tasks.length + 2}">Assessment Part 1 — Word Reading</th>
      <th colspan="9">Assessment Part 2 — Reading Fluency and Comprehension</th>
      <th rowspan="2" class="tight">Learner Reading Profile</th>
      <th rowspan="2">Remarks</th>
    </tr>
    <tr>
      ${taskHeads}
      <th class="tight">Total Score (${maxTotal})</th>
      <th class="tight">Reading Level</th>
      <th class="tight">Story</th>
      <th class="tight">No. of Miscues</th>
      <th class="tight">Words Read</th>
      <th class="tight">Time Used (m:ss)</th>
      <th class="tight">WPM</th>
      <th class="tight">% of Correct Words Read</th>
      <th class="tight">Total Correct Answer</th>
      <th class="tight">Learner Experience (1-${CRLA_LEARNER_EXPERIENCE_MAX})</th>
      <th class="tight">Observation Level</th>
    </tr>
  </thead>
  <tbody>${body}</tbody>
</table>
${crlaSignatories(teacherName, "Class Adviser", principalName, principalTitle)}
</body></html>`;

  printHTMLContent(html);
}
