/**
 * Printable: the Custom Report Builder's result.
 *
 * Unlike every other generator in this folder, the column set is not known
 * when this file is written — it is whatever the user picked. So the table is
 * built from the field catalogue at print time: the widths are apportioned by
 * data type, the alignment comes from the type, and the type size steps down
 * as the column count rises, because a fourteen-column report on 13in paper is
 * unreadable at the shell's default 9pt.
 *
 * The report is a snapshot of what was on screen. It is not re-queried here —
 * the caller passes the rows it already has, so what prints is what the user
 * saw and exported (the 112/121/154 rule, applied to a document somebody signs).
 */

import {
  buildReportDocument,
  esc,
  fetchDivisionHeader,
  fetchReportSchool,
} from "@/lib/pdf/reportShell";
import { printHTMLContent } from "@/lib/pdf/utils";
import {
  formatReportValue,
  ReportField,
  ReportRow,
} from "@/lib/utils/reportBuilder";

export interface CustomReportPrintParams {
  /** null = the division-wide cut; the header is then the SDO, not a school. */
  schoolId: string | number | null;
  /** The dataset's label — "Learners", "Enrolment", "Personnel". */
  datasetLabel: string;
  schoolYear: string | null;
  /** One line per filter, from `describeFilters`. */
  filterSummary: string[];
  fields: ReportField[];
  rows: ReportRow[];
  preparedBy: string;
  notedByName: string | null;
  notedByTitle: string | null;
}

/**
 * Relative column widths by data type. A name needs room a sex column does
 * not, and equal thirteenths would waste half the page on "Yes".
 */
const WIDTH_WEIGHT: Record<ReportField["data_type"], number> = {
  text: 3,
  enum: 2,
  date: 1.6,
  number: 1.2,
  boolean: 1,
};

/** Right for a number, centre for a flag or a code, left for prose. */
function cellClass(field: ReportField): string {
  if (field.data_type === "number") return "num";
  if (field.data_type === "boolean" || field.data_type === "enum") return "ctr";
  return "";
}

/**
 * The type size that keeps this many columns legible on 13in landscape. The
 * shell's own 9pt holds to about nine columns; past that the table starts
 * wrapping every cell.
 */
function typeScale(columnCount: number): string {
  if (columnCount <= 9) return "";
  if (columnCount <= 13) return "7.5pt";
  if (columnCount <= 18) return "6.5pt";
  return "5.5pt";
}

function buildTable(fields: ReportField[], rows: ReportRow[]): string {
  // The row-number column takes a fixed 3%; the rest share what is left in
  // proportion to their weights, normalised back to 100% (the 152 rule).
  const totalWeight = fields.reduce(
    (sum, f) => sum + (WIDTH_WEIGHT[f.data_type] ?? 2),
    0,
  );
  const widthFor = (field: ReportField) =>
    (((WIDTH_WEIGHT[field.data_type] ?? 2) / totalWeight) * 97).toFixed(2);

  const head = fields
    .map(
      (f) =>
        `<th style="width:${widthFor(f)}%">${esc(f.label)}</th>`,
    )
    .join("\n        ");

  const body = rows
    .map((row, index) => {
      const cells = fields
        .map((f) => {
          const value = formatReportValue(f, row[f.field_key]);
          const cls = cellClass(f);
          return `<td${cls ? ` class="${cls}"` : ""}>${esc(value)}</td>`;
        })
        .join("");
      return `<tr><td class="ctr">${index + 1}</td>${cells}</tr>`;
    })
    .join("\n      ");

  return `<table class="report">
    <thead>
      <tr>
        <th style="width:3%">#</th>
        ${head}
      </tr>
    </thead>
    <tbody>
      ${body}
    </tbody>
  </table>`;
}

export async function generateCustomReportPrint(
  params: CustomReportPrintParams,
): Promise<void> {
  const {
    schoolId,
    datasetLabel,
    schoolYear,
    filterSummary,
    fields,
    rows,
    preparedBy,
    notedByName,
    notedByTitle,
  } = params;

  const isDivisionWide = schoolId === null;
  const school = isDivisionWide
    ? await fetchDivisionHeader()
    : await fetchReportSchool(schoolId);

  const subtitleParts = [
    isDivisionWide ? "All Schools" : school.name,
    ...(schoolYear ? [`School Year ${schoolYear}`] : []),
  ];

  const scale = typeScale(fields.length);
  const scaleStyle = scale
    ? `<style>table.report th, table.report td { font-size:${scale}; padding:2px 3px; }</style>`
    : "";

  const filterLine =
    filterSummary.length > 0
      ? `<p style="font-size:8pt; margin-bottom:6px;"><strong>Filters:</strong> ${esc(
          filterSummary.join("  ·  "),
        )}</p>`
      : "";

  const body =
    rows.length > 0
      ? `${scaleStyle}
${filterLine}
${buildTable(fields, rows)}
<p style="font-size:8pt; font-style:italic;">
  ${rows.length} row${rows.length === 1 ? "" : "s"}.
  Generated from the Custom Report Builder — a live extract, not a submitted
  DepEd form.
</p>`
      : `<p class="empty">No rows match this report.</p>`;

  printHTMLContent(
    buildReportDocument({
      school,
      title: `${datasetLabel} Report`,
      subtitle: subtitleParts.join(" — "),
      body,
      preparedBy,
      principalName: notedByName,
      principalTitle: notedByTitle,
    }),
  );
}
