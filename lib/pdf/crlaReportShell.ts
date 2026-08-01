/**
 * Shared print scaffolding for the three CRLA workbook printables (Reading
 * Scoresheet, Class Record, Class Summary): landscape page, DepEd header,
 * fact strip, signatory block, and the value formatters they all use.
 */

import {
  buildDepEdHeaderWithLogos,
  DEPED_HEADER_LOGOS_STYLES,
} from "./utils";

const escapeMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (c) => escapeMap[c]!);
}

/** Whole number, or blank when unscored. */
export function fmtInt(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(Math.round(value));
}

/** Percentage with no decimals (the workbook rounds), or blank. */
export function fmtPct(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : `${Math.round(value)}%`;
}

/** Percentage with two decimals, for the Class Summary averages. */
export function fmtPct2(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : `${value.toFixed(2)}%`;
}

/** Two-decimal number, or blank. */
export function fmtNum2(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : value.toFixed(2);
}

/** Reading time as m:ss, or blank. */
export function fmtTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * A `<colgroup>` from relative column weights, normalised to 100%. Lets each
 * printable state widths in proportion without having to re-balance the whole
 * row when the task count changes (2-task vs 3-task CRLA form).
 */
export function colgroupFrom(weights: number[]): string {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return "";
  const cols = weights
    .map((w) => `<col style="width:${((w / sum) * 100).toFixed(3)}%">`)
    .join("");
  return `<colgroup>${cols}</colgroup>`;
}

export function crlaPrintStyles(): string {
  return `
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
.facts { display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 8.5pt; margin: 6px 0 8px; }
table.report { width: 100%; border-collapse: collapse; table-layout: fixed; }
table.report th, table.report td { border: 1px solid #000; padding: 2px 3px; font-size: 7.5pt; word-break: break-word; }
table.report th { background: #e8e8e8; text-align: center; font-weight: bold; vertical-align: middle; }
th.tight { font-size: 6.5pt; line-height: 1.05; }
td.c { text-align: center; }
td.lrn { font-size: 6.5pt; text-align: center; }
tr.subtotal td { font-weight: bold; background: #f4f4f4; }
tr.grand td { font-weight: bold; background: #dcdcdc; }
.empty { font-style: italic; color: #555; padding: 20px; }
.section-title { font-weight: bold; font-size: 9.5pt; margin: 14px 0 4px; }
.legend { margin-top: 12px; font-size: 8pt; }
.legend strong { display: block; margin-bottom: 3px; }
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
`;
}

export interface CrlaReportHeaderParams {
  schoolName: string;
  title: string;
  subtitle: string;
  /** Label/value pairs rendered as the fact strip under the header. */
  facts: [string, string][];
}

export function crlaReportHeader(params: CrlaReportHeaderParams): string {
  const { schoolName, title, subtitle, facts } = params;
  const header = buildDepEdHeaderWithLogos(`
  <div class="org-line">Republic of the Philippines</div>
  <div class="org-line">Department of Education</div>
  <div class="org-line">SCHOOLS DIVISION OF BAYUGAN CITY</div>
  <div class="school-name">${esc(schoolName || "Department of Education")}</div>
  <div class="form-title">${esc(title)}</div>
  <div class="form-subtitle">${esc(subtitle)}</div>
`);
  const strip = facts
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `<div><strong>${esc(k)}:</strong> ${esc(v)}</div>`)
    .join("");
  return `${header}<div class="facts">${strip}</div>`;
}

export function crlaSignatories(
  preparedBy: string,
  preparedByTitle: string,
  notedByName: string | null,
  notedByTitle: string | null,
): string {
  return `<div class="sigs">
  <div class="sig">
    <div class="sig-label">Prepared by:</div>
    <div class="sig-name">${esc(preparedBy)}</div>
    <div class="sig-title">${esc(preparedByTitle)}</div>
  </div>
  <div class="sig">
    <div class="sig-label">Noted by:</div>
    <div class="sig-name">${esc(notedByName ?? "")}</div>
    <div class="sig-title">${esc(notedByTitle || "Principal")}</div>
  </div>
</div>`;
}
