/**
 * Shared print scaffolding for the Reports module printables (landscape,
 * DepEd header + signatory block). Keeps the individual report generators to
 * just their table markup.
 */

import {
  buildDepEdHeaderWithLogos,
  DEPED_HEADER_LOGOS_STYLES,
} from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";

export interface ReportSchool {
  name: string;
  address: string | null;
  district: string | null;
  region: string | null;
}

export async function fetchReportSchool(
  schoolId: string | number,
): Promise<ReportSchool> {
  const { data, error } = await supabase
    .from("sms_schools")
    .select("name, address, district, region")
    .eq("id", schoolId)
    .single();

  if (error || !data) throw new Error("School not found");
  return data as ReportSchool;
}

const escapeMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes user-supplied values before they enter the print document. */
export function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (c) => escapeMap[c]!);
}

const REPORT_STYLES = `
@page { size: 13in 8.5in; margin: 0.5in 0.5in; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: "Times New Roman", serif;
  font-size: 10pt;
  line-height: 1.35;
  color: #000;
  background: #fff;
}
${DEPED_HEADER_LOGOS_STYLES}
.school-name { font-size: 13pt; font-weight: bold; text-transform: uppercase; }
.school-address { font-size: 9pt; }
.form-title { font-size: 12pt; font-weight: bold; margin-top: 8px; text-transform: uppercase; letter-spacing: 1px; }
.form-subtitle { font-size: 10pt; margin-top: 2px; }
table.report { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
table.report th, table.report td { border: 1px solid #000; padding: 3px 5px; font-size: 9pt; }
table.report th { background: #e8e8e8; font-weight: bold; text-align: center; }
.num { text-align: right; }
.ctr { text-align: center; }
.group-title { font-weight: bold; font-size: 10pt; margin: 12px 0 4px; text-transform: uppercase; }
tr.subtotal td { font-weight: bold; background: #f4f4f4; }
.empty { text-align: center; padding: 30px; font-style: italic; }
.signatories { margin-top: 30px; display: flex; justify-content: space-between; gap: 40px; }
.sig-block { width: 45%; font-size: 9pt; }
.sig-label { margin-bottom: 28px; }
.sig-name { border-top: 1px solid #000; padding-top: 3px; font-weight: bold; text-transform: uppercase; text-align: center; }
.sig-title { text-align: center; font-size: 8pt; }
@media print {
  body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  tr, .group { break-inside: avoid; }
  thead { display: table-header-group; }
}
`;

export interface ReportDocumentParams {
  school: ReportSchool;
  title: string;
  subtitle: string;
  /** Table/body markup for the report. */
  body: string;
  preparedBy: string;
  principalName: string | null;
  principalTitle: string | null;
}

/** Assembles a complete, printable HTML document for a Reports-module report. */
export function buildReportDocument(params: ReportDocumentParams): string {
  const {
    school,
    title,
    subtitle,
    body,
    preparedBy,
    principalName,
    principalTitle,
  } = params;

  const header = buildDepEdHeaderWithLogos(`
    <div style="font-size:9pt;">Republic of the Philippines</div>
    <div style="font-size:9pt;">Department of Education</div>
    <div style="font-size:9pt;">${esc(school.region || "")}</div>
    <div style="font-size:9pt;">${esc(school.district || "")}</div>
    <div class="school-name">${esc(school.name)}</div>
    <div class="school-address">${esc(school.address || "")}</div>
    <div class="form-title">${esc(title)}</div>
    <div class="form-subtitle">${esc(subtitle)}</div>
  `);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${esc(title)}</title><style>${REPORT_STYLES}</style></head>
<body>
${header}
${body}
<div class="signatories">
  <div class="sig-block">
    <div class="sig-label">Prepared by:</div>
    <div class="sig-name">${esc(preparedBy)}</div>
    <div class="sig-title">&nbsp;</div>
  </div>
  <div class="sig-block">
    <div class="sig-label">Noted by:</div>
    <div class="sig-name">${esc(principalName || "")}</div>
    <div class="sig-title">${esc(principalTitle || "Principal")}</div>
  </div>
</div>
</body>
</html>`;
}
