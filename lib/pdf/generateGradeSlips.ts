/**
 * Grade Slip — a quarter-page progress slip per learner, four to a page.
 *
 * A lighter alternative to SF9 for the periods in between: the adviser picks
 * which terms to show, prints the section, and cuts along the dashed lines.
 * The figures are the card's own rows (`learnerCardRows` → buildCardSubjectRows),
 * so MAPEH and EPP/TLE fold into one parent with their components beneath, a
 * Madrasah/ALS subject prints but stays out of the average, and the final grade
 * stays blank until every period is encoded — exactly as SF9 prints them.
 *
 * Learners arrive already in the order they should print (male first, then
 * female); the generator does not re-sort.
 */

import type { CardSubjectRow } from "@/lib/utils/mapeh";
import {
  computeGeneralAverage,
  periodGeneralAverage,
} from "@/lib/utils/mapeh";
import { escapeHtml, printHTMLContent } from "@/lib/pdf/utils";

export interface GradeSlipPeriod {
  value: number;
  /** Column heading, e.g. "T1" / "Q1". */
  short: string;
}

export interface GradeSlipLearner {
  name: string;
  lrn: string | null;
  rows: CardSubjectRow[];
}

export interface GradeSlipOptions {
  schoolName: string;
  schoolYear: string;
  /** e.g. "Grade 5 - Rizal" */
  sectionLabel: string;
  adviserName: string | null;
  /** The periods to print, in order. */
  periods: GradeSlipPeriod[];
  /** Adds the Final Grade and Remarks columns and the final General Average. */
  includeFinal: boolean;
  learners: GradeSlipLearner[];
}

const SLIPS_PER_PAGE = 4;

const esc = (value: string | null | undefined) => escapeHtml(value ?? "");

const cell = (value: number | null) =>
  value == null ? "" : String(Math.round(value));

function periodValue(row: CardSubjectRow, period: number): number | null {
  const key = `q${period}` as "q1" | "q2" | "q3" | "q4";
  return row[key];
}

function renderSlip(learner: GradeSlipLearner, opts: GradeSlipOptions): string {
  const { periods, includeFinal } = opts;
  const colCount = 1 + periods.length + (includeFinal ? 2 : 0);

  const head = `<tr>
      <th class="area">Learning Areas</th>
      ${periods.map((p) => `<th>${esc(p.short)}</th>`).join("")}
      ${includeFinal ? "<th>Final</th><th>Remarks</th>" : ""}
    </tr>`;

  const body = learner.rows
    .map((row) => {
      if (row.kind === "group") {
        return `<tr><td class="group" colspan="${colCount}">${esc(row.name)}</td></tr>`;
      }
      const nameClass =
        row.kind === "header" ? "area parent" : row.kind === "sub" ? "area sub" : "area";
      return `<tr>
        <td class="${nameClass}">${esc(row.name)}</td>
        ${periods.map((p) => `<td>${cell(periodValue(row, p.value))}</td>`).join("")}
        ${
          includeFinal
            ? `<td>${cell(row.final)}</td><td class="remarks">${
                row.final == null || row.kind === "sub" ? "" : esc(row.remarks)
              }</td>`
            : ""
        }
      </tr>`;
    })
    .join("");

  const finalAverage = includeFinal ? computeGeneralAverage(learner.rows) : null;
  const averageRow = `<tr class="average">
      <td class="area">General Average</td>
      ${periods
        .map((p) => `<td>${cell(periodGeneralAverage(learner.rows, p.value))}</td>`)
        .join("")}
      ${
        finalAverage
          ? `<td>${cell(finalAverage.average)}</td><td class="remarks">${
              finalAverage.average == null ? "" : esc(finalAverage.remarks)
            }</td>`
          : ""
      }
    </tr>`;

  const empty =
    learner.rows.length === 0
      ? `<tr><td colspan="${colCount}" class="empty">No grades encoded yet.</td></tr>`
      : "";

  return `<div class="slip">
    <div class="slip-head">
      <div class="school">${esc(opts.schoolName)}</div>
      <div class="title">GRADE SLIP</div>
      <div class="sy">School Year ${esc(opts.schoolYear)}</div>
    </div>
    <table class="info">
      <tr><td class="k">Name:</td><td class="v name">${esc(learner.name)}</td></tr>
      <tr><td class="k">LRN:</td><td class="v">${esc(learner.lrn)}</td></tr>
      <tr><td class="k">Grade &amp; Section:</td><td class="v">${esc(opts.sectionLabel)}</td></tr>
    </table>
    <table class="grades">
      <thead>${head}</thead>
      <tbody>${body}${empty}${learner.rows.length ? averageRow : ""}</tbody>
    </table>
    <div class="signs">
      <div class="sign">
        <div class="line">${esc(opts.adviserName)}</div>
        <div class="cap">Class Adviser</div>
      </div>
      <div class="sign">
        <div class="line">&nbsp;</div>
        <div class="cap">Parent / Guardian</div>
      </div>
    </div>
  </div>`;
}

const STYLES = `
@page { size: 8.5in 13in; margin: 0.3in; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
.page {
  width: 7.9in; height: 12.4in;
  display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr;
  page-break-after: always; break-after: page;
}
.page:last-child { page-break-after: auto; break-after: auto; }
.slip {
  border: 1px dashed #777; padding: 0.14in 0.16in;
  overflow: hidden; display: flex; flex-direction: column;
}
.slip-head { text-align: center; margin-bottom: 5px; }
.school { font-size: 10pt; font-weight: bold; text-transform: uppercase; }
.title { font-size: 13pt; font-weight: bold; letter-spacing: 1px; margin-top: 2px; }
.sy { font-size: 9pt; }
table { width: 100%; border-collapse: collapse; }
.info td { font-size: 9pt; padding: 2px 0; vertical-align: bottom; }
.info .k { width: 1.05in; white-space: nowrap; }
.info .v { border-bottom: 1px solid #000; }
.info .name { font-weight: bold; text-transform: uppercase; }
.grades { margin-top: 8px; }
.grades th, .grades td { border: 1px solid #000; font-size: 9pt; padding: 3px 4px; text-align: center; }
.grades th { background: #eee; font-weight: bold; }
.grades th:not(.area) { width: 0.4in; }
.grades th:last-child:not(.area) { width: auto; }
.grades .area { text-align: left; }
.grades .parent { font-weight: bold; }
.grades .sub { padding-left: 12px; font-style: italic; }
.grades .group { text-align: left; font-weight: bold; background: #f5f5f5; }
.grades .remarks { font-size: 8pt; }
.grades .average td { font-weight: bold; }
.grades .empty { color: #555; font-style: italic; padding: 8px; }
.signs { display: flex; gap: 0.2in; margin-top: auto; padding-top: 10px; }
.sign { flex: 1; text-align: center; }
.sign .line { border-bottom: 1px solid #000; font-size: 8.5pt; font-weight: bold; min-height: 12px; text-transform: uppercase; }
.sign .cap { font-size: 8pt; margin-top: 1px; }
@media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
`;

export function buildGradeSlipsHtml(opts: GradeSlipOptions): string {
  const pages: string[] = [];
  for (let i = 0; i < opts.learners.length; i += SLIPS_PER_PAGE) {
    const slips = opts.learners
      .slice(i, i + SLIPS_PER_PAGE)
      .map((learner) => renderSlip(learner, opts))
      .join("");
    pages.push(`<div class="page">${slips}</div>`);
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<title>Grade Slips - ${esc(opts.sectionLabel)} - ${esc(opts.schoolYear)}</title>
<style>${STYLES}</style>
</head><body>${pages.join("")}</body></html>`;
}

export function printGradeSlips(opts: GradeSlipOptions): void {
  printHTMLContent(buildGradeSlipsHtml(opts));
}
