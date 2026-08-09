/**
 * Individual exam result slips — the sheet a learner takes home.
 *
 * Two slips to a page, cut along the dashed rule: a class of 45 is 23 sheets of
 * paper rather than 45, which is the difference between a teacher printing
 * these and not.
 *
 * A slip shows the learner their own answer beside the key, item by item. That
 * is the whole point of keeping the raw responses (migration 132) rather than
 * only which items were right: "you scored 32/50" tells a learner nothing they
 * can act on, whereas "you answered C on item 14, the answer was A" does.
 *
 * Uses the house HTML-to-print path (`printHTMLContent`) like every other
 * learner-facing form, so slips match the look of the report card and SF9.
 */

import { printHTMLContent } from "./utils";
import type { ItemOutcome, SheetScore } from "@/lib/omr/score";

export interface ExamResultSlipLearner {
  studentId: number | string;
  name: string;
  lrn?: string | null;
  score: SheetScore;
  /** Rank within the section, when the whole section has been scored. */
  rank?: number | null;
}

export interface ExamResultSlipParams {
  schoolName: string;
  examTitle: string;
  subjectName: string;
  sectionName: string;
  schoolYear: string;
  versionLabel: string;
  teacherName?: string | null;
  dateAdministered?: string | null;
  /** Class Mean Percentage Score, printed for context beside the learner's own. */
  classMps?: number | null;
  learners: ExamResultSlipLearner[];
}

export function generateExamResultSlips(params: ExamResultSlipParams): void {
  if (params.learners.length === 0) {
    throw new Error("No results to print.");
  }
  printHTMLContent(buildSlipsHtml(params));
}

/** Exposed for tests: the full printable document as a string. */
export function buildSlipsHtml(params: ExamResultSlipParams): string {
  const slips = params.learners.map((learner) => slip(params, learner)).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Exam Results</title><style>
@page { size: A4 portrait; margin: 10mm; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: "Times New Roman", serif; font-size: 10pt; color: #000; background: #fff; }
.sheet { display: flex; flex-direction: column; }
.slip { border: 1px solid #000; padding: 8px 10px; height: 137mm; page-break-inside: avoid; overflow: hidden; }
.slip + .slip { margin-top: 3mm; border-top-style: dashed; }
.slip:nth-of-type(2n) { page-break-after: always; }
.slip-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1.5px solid #000; padding-bottom: 4px; }
.school { font-size: 11pt; font-weight: bold; text-transform: uppercase; }
.exam { font-size: 9pt; }
.meta { font-size: 8pt; color: #333; }
.learner { margin-top: 6px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.learner-name { font-size: 12pt; font-weight: bold; text-transform: uppercase; }
.scorebox { border: 1.5px solid #000; padding: 3px 10px; text-align: center; white-space: nowrap; }
.score-big { font-size: 16pt; font-weight: bold; line-height: 1.1; }
.score-sub { font-size: 7.5pt; }
.stats { display: flex; gap: 14px; margin-top: 5px; font-size: 8.5pt; }
.stats b { font-size: 9.5pt; }
table.items { width: 100%; border-collapse: collapse; margin-top: 6px; }
table.items th, table.items td { border: 1px solid #666; padding: 1px 2px; font-size: 7pt; text-align: center; }
table.items th { background: #eee; font-weight: bold; }
.wrong { background: #f4f4f4; font-weight: bold; }
.legend { margin-top: 4px; font-size: 7pt; color: #333; }
.sign { margin-top: 8px; display: flex; justify-content: space-between; font-size: 8pt; }
.sign div { width: 45%; border-top: 1px solid #000; padding-top: 2px; text-align: center; }
@media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style></head><body><div class="sheet">${slips}</div></body></html>`;
}

function slip(
  params: ExamResultSlipParams,
  learner: ExamResultSlipLearner,
): string {
  const { score } = learner;
  const wrongItems = score.outcomes.filter(
    (o) => o.status === "wrong" || o.status === "blank" || o.status === "unresolved",
  );

  return `<div class="slip">
  <div class="slip-head">
    <div>
      <div class="school">${esc(params.schoolName || "Department of Education")}</div>
      <div class="exam">${esc(params.examTitle)} — ${esc(params.versionLabel)}</div>
      <div class="meta">${esc(params.subjectName)} · ${esc(params.sectionName)} · S.Y. ${esc(params.schoolYear)}${
        params.dateAdministered ? ` · ${esc(params.dateAdministered)}` : ""
      }</div>
    </div>
    <div class="meta" style="text-align:right">INDIVIDUAL<br/>RESULT SLIP</div>
  </div>

  <div class="learner">
    <div>
      <div class="learner-name">${esc(learner.name)}</div>
      ${learner.lrn ? `<div class="meta">LRN: ${esc(learner.lrn)}</div>` : ""}
    </div>
    <div class="scorebox">
      <div class="score-big">${score.correctCount} / ${score.scorableCount}</div>
      <div class="score-sub">${score.percentage.toFixed(2)}%</div>
    </div>
  </div>

  <div class="stats">
    <span>Points: <b>${score.points} / ${score.maxPoints}</b></span>
    ${learner.rank ? `<span>Rank in section: <b>${learner.rank}</b></span>` : ""}
    ${
      params.classMps != null
        ? `<span>Class MPS: <b>${params.classMps.toFixed(2)}%</b></span>`
        : ""
    }
    <span>Items to review: <b>${wrongItems.length}</b></span>
  </div>

  ${itemTable(score.outcomes)}

  <div class="legend">
    Your answer is shown beside the correct answer. <b>—</b> means you left the item blank;
    <b>?</b> means more than one circle was shaded and the item could not be counted.
    Shaded rows are the items to go over again.
  </div>

  <div class="sign">
    <div>${esc(params.teacherName ?? "")}<br/>Teacher</div>
    <div>&nbsp;<br/>Parent / Guardian</div>
  </div>
</div>`;
}

/**
 * The item trail, wrapped into fixed-width blocks so 50 items fit on half a
 * page. Each block is three rows: item number, the learner's answer, the key.
 */
function itemTable(outcomes: ItemOutcome[]): string {
  const PER_BLOCK = 25;
  const blocks: ItemOutcome[][] = [];
  for (let i = 0; i < outcomes.length; i += PER_BLOCK) {
    blocks.push(outcomes.slice(i, i + PER_BLOCK));
  }

  return blocks
    .map((block) => {
      const cells = (render: (o: ItemOutcome) => string) =>
        block
          .map(
            (o) =>
              `<td class="${o.status === "correct" || o.status === "unkeyed" ? "" : "wrong"}">${render(o)}</td>`,
          )
          .join("");

      return `<table class="items">
  <tr><th>Item</th>${cells((o) => String(o.itemNumber))}</tr>
  <tr><th>You</th>${cells((o) => displayResponse(o))}</tr>
  <tr><th>Key</th>${cells((o) => o.correctAnswer ?? "–")}</tr>
</table>`;
    })
    .join("");
}

function displayResponse(outcome: ItemOutcome): string {
  if (outcome.status === "blank") return "—";
  if (outcome.status === "unresolved") return "?";
  return outcome.response || "—";
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
