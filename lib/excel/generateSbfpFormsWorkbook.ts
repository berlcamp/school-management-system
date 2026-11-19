/**
 * SBFP Forms 2, 3, 4, 5 (milk), 5 (consolidated), 6 and the Hot Meals report
 * as Excel. Each sheet is converted from the very HTML the print dialog gets
 * (`lib/pdf/generateSbfpForms.ts`), so the spreadsheet carries the printout's
 * header lines, column heads, merged cells, totals and signature lines — one
 * worksheet per printed page (Form 2: Elementary / Junior-Senior High; Form 3:
 * one per section; Form 6: NFP / Milk).
 *
 * Forms 1A / midline / 1B have their own hand-built workbook
 * (`generateSbfpForm1Workbook.ts`), which this leaves alone.
 */

import {
  buildForm2Sheets,
  buildForm3Sheet,
  buildForm4,
  buildForm5ConsolidatedSheet,
  buildForm5Milk,
  buildForm6,
  buildHotMealsReport,
  type Form3Section,
  type SbfpContactLine,
  type SbfpHeaderInfo,
} from "@/lib/pdf/generateSbfpForms";
import type { SbfpWeighingPeriod } from "@/lib/constants/sbfp";
import {
  gradeSectionLabel,
  isElementaryGrade,
  type FeedingAttendance,
  type SbfpBeneficiaryView,
  type SbfpDelivery,
} from "@/lib/utils/sbfp";
import { downloadHtmlSheetsAsExcel, type HtmlSheet } from "./htmlSheetsToWorkbook";

function filename(base: string, info: SbfpHeaderInfo, suffix = ""): string {
  const school = info.depedSchoolId || info.schoolName.replace(/[^A-Za-z0-9]+/g, "_");
  return `${base}${suffix ? `_${suffix}` : ""}_${school}_SY${info.schoolYear}.xlsx`;
}

/** Sheet names for Form 2, in the order `buildForm2Sheets` returns its pages. */
function form2SheetNames(rows: SbfpBeneficiaryView[]): string[] {
  const elementary = rows.some((r) => r.grade_level !== null && isElementaryGrade(r.grade_level));
  const secondary = rows.some((r) => r.grade_level !== null && !isElementaryGrade(r.grade_level));
  const names: string[] = [];
  if (elementary || !secondary) names.push("Form 2 Elementary");
  if (secondary) names.push("Form 2 Junior-Senior High");
  return names;
}

const named = (names: string[], pages: string[]): HtmlSheet[] =>
  pages.map((html, i) => ({ name: names[i] ?? `Sheet ${i + 1}`, html }));

export function downloadSbfpForm2Excel(
  info: SbfpHeaderInfo,
  rows: SbfpBeneficiaryView[],
  period: SbfpWeighingPeriod,
): void {
  downloadHtmlSheetsAsExcel(
    named(form2SheetNames(rows), buildForm2Sheets(info, rows, period)),
    filename("SBFP_Form_2", info, period[0].toUpperCase() + period.slice(1)),
  );
}

export function downloadSbfpForm3Excel(
  info: SbfpHeaderInfo,
  sections: Form3Section[],
  yearMonth: string,
  days: readonly string[],
  codes: ReadonlyMap<string, ReadonlyMap<string, string>>,
): void {
  downloadHtmlSheetsAsExcel(
    sections.map((s) => ({
      name: gradeSectionLabel(s.gradeLevel, s.sectionName) || s.sectionName,
      html: buildForm3Sheet(info, s, yearMonth, days, codes),
    })),
    filename("SBFP_Form_3", info, yearMonth),
  );
}

export function downloadSbfpForm4Excel(info: SbfpHeaderInfo, contacts: SbfpContactLine[]): void {
  downloadHtmlSheetsAsExcel(
    [{ name: "Form 4", html: buildForm4(info, contacts) }],
    filename("SBFP_Form_4", info),
  );
}

export function downloadSbfpForm5MilkExcel(
  info: SbfpHeaderInfo,
  rows: SbfpBeneficiaryView[],
): void {
  downloadHtmlSheetsAsExcel(
    [{ name: "Form 5 Milk", html: buildForm5Milk(info, rows) }],
    filename("SBFP_Form_5_Milk", info),
  );
}

export function downloadSbfpForm5ConsolidatedExcel(
  info: SbfpHeaderInfo,
  rows: SbfpBeneficiaryView[],
  attendance: ReadonlyMap<string, FeedingAttendance>,
): void {
  downloadHtmlSheetsAsExcel(
    [{ name: "Form 5 Consolidated", html: buildForm5ConsolidatedSheet(info, rows, attendance) }],
    filename("SBFP_Form_5_Consolidated", info),
  );
}

export function downloadSbfpForm6Excel(
  info: SbfpHeaderInfo,
  rows: SbfpBeneficiaryView[],
  deliveries: SbfpDelivery[],
): void {
  downloadHtmlSheetsAsExcel(
    named(["Form 6 NFP", "Form 6 Milk"], buildForm6(info, rows, deliveries)),
    filename("SBFP_Form_6", info),
  );
}

export function downloadSbfpHotMealsExcel(
  info: SbfpHeaderInfo,
  beneficiaryCount: number,
  deliveries: SbfpDelivery[],
): void {
  downloadHtmlSheetsAsExcel(
    [{ name: "Hot Meals", html: buildHotMealsReport(info, beneficiaryCount, deliveries) }],
    filename("SBFP_Hot_Meals", info),
  );
}
