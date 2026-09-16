/**
 * Printable: "Nutritional Status Summary".
 *
 * SF8's summary rolled up across every section of the school — the sheet the
 * feeding programme coordinator files with the division. Both of the school
 * year's readings print, baseline above endline, so the change over the year is
 * on one page.
 */

import { getGradeLevelLabel } from "@/lib/constants";
import {
  buildReportDocument,
  esc,
  fetchReportSchool,
} from "@/lib/pdf/reportShell";
import { printHTMLContent } from "@/lib/pdf/utils";
import { MEASUREMENT_PERIOD_OPTIONS } from "@/lib/utils/nutritionalStatus";
import {
  BMI_BANDS,
  HFA_BANDS,
  totalsFor,
  type NutritionalSummary,
  type NutritionalSummaryRow,
  type SexCounts,
} from "@/lib/utils/nutritionalSummary";

export interface NutritionalStatusPrintParams {
  schoolId: string | number;
  schoolYear: string;
  summary: NutritionalSummary;
  preparedBy: string;
  principalName: string | null;
  principalTitle: string | null;
}

/** "3 / 2", or an empty cell where nobody falls in the band. */
function cell(counts: SexCounts | undefined): string {
  if (!counts || (counts.male === 0 && counts.female === 0)) return "";
  return `${counts.male} / ${counts.female}`;
}

function total(counts: SexCounts | undefined): string {
  if (!counts) return "";
  const sum = counts.male + counts.female;
  return sum === 0 ? "" : String(sum);
}

function buildTable(
  rows: NutritionalSummaryRow[],
  measure: "bmi" | "hfa",
  bands: { value: string; label: string }[],
): string {
  const head = bands
    .map((b) => `<th>${esc(b.label)}</th>`)
    .join("");

  const body = rows
    .map(
      (row) => `<tr>
  <td class="ctr">${esc(getGradeLevelLabel(row.gradeLevel))}</td>
  ${bands.map((b) => `<td class="ctr">${cell(row[measure][b.value])}</td>`).join("")}
  <td class="num">${total(row.measured)}</td>
</tr>`,
    )
    .join("\n");

  const totals = totalsFor(rows, measure);

  return `<table class="report">
  <thead>
    <tr>
      <th style="width:16%">Grade Level</th>
      ${head}
      <th style="width:12%">Total Measured</th>
    </tr>
  </thead>
  <tbody>
    ${body}
    <tr class="subtotal">
      <td class="ctr">TOTAL</td>
      ${bands.map((b) => `<td class="ctr">${cell(totals.bands[b.value])}</td>`).join("")}
      <td class="num">${total(totals.measured)}</td>
    </tr>
  </tbody>
</table>`;
}

export async function generateNutritionalStatusPrint(
  params: NutritionalStatusPrintParams,
): Promise<void> {
  const {
    schoolId,
    schoolYear,
    summary,
    preparedBy,
    principalName,
    principalTitle,
  } = params;

  const school = await fetchReportSchool(schoolId);

  // `group-title` and `empty` come from the shared report stylesheet; the
  // sub-heading is the same rule a size down, since the shell has no second
  // heading level and one table's caption should not shout as loudly as the
  // reading it sits under.
  const subTitle = (text: string) =>
    `<div class="group-title" style="font-size:9pt; text-transform:none;">${esc(text)}</div>`;

  const sections = MEASUREMENT_PERIOD_OPTIONS.map((period) => {
    const rows = summary[period.value];
    if (rows.length === 0) {
      return `<div class="group-title">${esc(period.label)}</div>
<p class="empty">No measurements recorded for this reading.</p>`;
    }
    return `<div class="group-title">${esc(period.label)}</div>
${subTitle("Nutritional Status (BMI for Age)")}
${buildTable(rows, "bmi", BMI_BANDS)}
${subTitle("Nutritional Status (Height for Age)")}
${buildTable(rows, "hfa", HFA_BANDS)}`;
  }).join("\n");

  const body = `<div style="font-size:9pt; margin-bottom:6px;">Counts are shown as <strong>Male / Female</strong>.</div>
${sections}`;

  printHTMLContent(
    buildReportDocument({
      school,
      title: "Nutritional Status Summary",
      subtitle: `School Year ${schoolYear}`,
      body,
      preparedBy,
      principalName,
      principalTitle,
    }),
  );
}
