import {
  buildDepEdHeaderWithLogos,
  DEPED_BASE_STYLES,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "./utils";

interface SchoolRow {
  schoolName: string;
  counts: Record<string, number>;
  total: number;
}

export interface AssessmentSummaryParams {
  typeLabel: string;
  schoolYear: string;
  phase: string;
  gradeLabel: string;
  languageLabel: string;
  labels: string[];
  rows: SchoolRow[];
  totalsByLabel: Record<string, number>;
  grandTotal: number;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function generateAssessmentSummary(
  params: AssessmentSummaryParams,
): Promise<void> {
  const {
    typeLabel,
    schoolYear,
    phase,
    gradeLabel,
    languageLabel,
    labels,
    rows,
    totalsByLabel,
    grandTotal,
  } = params;

  const headerCols = labels.map((l) => `<th>${escapeHtml(l)}</th>`).join("");

  const bodyRows = rows
    .map(
      (r) =>
        `<tr>
          <td>${escapeHtml(r.schoolName)}</td>
          ${labels.map((l) => `<td class="c">${r.counts[l] ?? 0}</td>`).join("")}
          <td class="c"><strong>${r.total}</strong></td>
        </tr>`,
    )
    .join("");

  const totalsRow = `<tr class="totals">
    <td><strong>Division Total</strong></td>
    ${labels.map((l) => `<td class="c"><strong>${totalsByLabel[l] ?? 0}</strong></td>`).join("")}
    <td class="c"><strong>${grandTotal}</strong></td>
  </tr>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${DEPED_BASE_STYLES}
${DEPED_HEADER_LOGOS_STYLES}
.sub-title { text-align:center; font-weight:bold; font-size:12pt; margin: 4px 0 6px; }
.meta-line { text-align:center; font-size:10pt; margin-bottom:12px; }
table.sheet { width:100%; border-collapse:collapse; }
table.sheet th, table.sheet td { border:1px solid #000; padding:5px 8px; font-size:10pt; }
table.sheet th { background:#eee; text-align:center; }
td.c { text-align:center; }
tr.totals td { background:#f0f0f0; }
</style></head><body>
${buildDepEdHeaderWithLogos(
  `<div class="school-name">Schools Division of Bayugan City</div>
   <div class="form-title">${escapeHtml(typeLabel)} — Division Summary</div>`,
)}
<div class="sub-title">${escapeHtml(typeLabel)} · ${escapeHtml(phase)} · SY ${escapeHtml(schoolYear)}</div>
<div class="meta-line">Grade: ${escapeHtml(gradeLabel)}${languageLabel ? ` · Language: ${escapeHtml(languageLabel)}` : ""}</div>
<table class="sheet">
  <thead>
    <tr><th style="text-align:left">School</th>${headerCols}<th>Total</th></tr>
  </thead>
  <tbody>
    ${bodyRows}
    ${totalsRow}
  </tbody>
</table>
</body></html>`;

  printHTMLContent(html);
}
