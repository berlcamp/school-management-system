/**
 * SBFP Form 1 master lists as Excel — Form 1A (baseline), the midline master
 * list and Form 1B (endline). The same rows, columns and header lines as the
 * printouts in `lib/pdf/generateSbfpForms.ts`, so a focal person can file the
 * printout and still hand the division an editable sheet.
 *
 * The column heads are the printout's, verbatim. Weights, heights, BMI and
 * attendance are written as numbers (not text) so the sheet can be summed and
 * sorted; dates stay MM/DD/YYYY text, as the issued form asks for them.
 *
 * `buildSbfpForm1Workbook` is pure and is what the tests read;
 * `downloadSbfpForm1Excel` writes the file in the browser.
 */

import * as XLSX from "xlsx";
import { BMI_LABEL, HFA_LABEL, mdy, type SbfpHeaderInfo } from "@/lib/pdf/generateSbfpForms";
import { ageInMonths, bodyMassIndex } from "@/lib/utils/nutritionalStatus";
import {
  ageAtReading,
  averagePercent,
  gradeSectionLabel,
  readingFor,
  type FeedingAttendance,
  type SbfpBeneficiaryView,
  type SbfpReading,
} from "@/lib/utils/sbfp";

export type SbfpForm1Kind = "1A" | "1M" | "1B";

type Cell = string | number | null;

const FORM_YEAR = "2026";

const yesNo = (v: boolean | null | undefined): string => (v == null ? "" : v ? "Yes" : "No");

const sexLetter = (sex: SbfpBeneficiaryView["sex"]): string =>
  sex === "male" ? "M" : sex === "female" ? "F" : "";

/** "BMI for 6 y.o. and above" — blank for a younger learner, one decimal like the printout. */
function bmiValue(dob: string | null, r: SbfpReading | null): number | null {
  if (!r?.measured_at) return null;
  const months = ageInMonths(dob, r.measured_at);
  if (months === null || months < 72) return null;
  const bmi = bodyMassIndex(r.height_cm, r.weight_kg);
  return bmi === null ? null : Math.round(bmi * 10) / 10;
}

const round2 = (v: number | null): number | null =>
  v === null ? null : Math.round(v * 100) / 100;

const READING_HEADS = [
  "No.",
  "Name",
  "Sex",
  "Grade/ Section",
  "Date of Birth (MM/DD/YYYY)",
  "Date of Weighing / Measuring (MM/DD/YYYY)",
  "Age in Years / Months",
  "Weight (Kg)",
  "Height (cm)",
  "BMI for 6 y.o. and above",
  "Nutritional Status (NS)",
  "",
];

const FORM1A_TAIL = [
  "Classification of Beneficiary (Primary or Secondary)*",
  "Pregnant? (Yes or No)",
  "With 0-1 year-old child/ren (Yes or No)",
  "Dewormed? (yes or no)",
  "Parent's consent for milk? (yes or no)",
  "Participation in 4Ps (yes or no)",
  "Beneficiary of SBFP in Previous Years (yes or no)",
];

const FORM1B_TAIL = ["Attendance", "", ""];
const FORM1B_SUBHEADS = ["Days Present (A)", "Feeding Days (B)", "Percentage (A/B)*100"];

function readingCells(r: SbfpBeneficiaryView, i: number, reading: SbfpReading | null): Cell[] {
  return [
    i + 1,
    r.name,
    sexLetter(r.sex),
    gradeSectionLabel(r.grade_level, r.section_name),
    mdy(r.date_of_birth),
    mdy(reading?.measured_at),
    ageAtReading(r.date_of_birth, reading),
    reading?.weight_kg ?? null,
    reading?.height_cm ?? null,
    bmiValue(r.date_of_birth, reading),
    BMI_LABEL[reading?.nutritional_status ?? ""] ?? "",
    HFA_LABEL[reading?.height_for_age ?? ""] ?? "",
  ];
}

const TITLES: Record<SbfpForm1Kind, { code: string; period: string; sheet: string }> = {
  "1A": { code: "SBFP Form 1A", period: "BASELINE", sheet: "Form 1A Baseline" },
  "1M": { code: "SBFP Master List", period: "MIDLINE", sheet: "Midline Master List" },
  "1B": { code: "SBFP Form 1B", period: "ENDLINE", sheet: "Form 1B Endline" },
};

/** The rows of the sheet, as an array of arrays, plus the merges the header needs. */
export function buildSbfpForm1Rows(
  kind: SbfpForm1Kind,
  info: SbfpHeaderInfo,
  rows: SbfpBeneficiaryView[],
  attendanceById: ReadonlyMap<string, FeedingAttendance> = new Map(),
): { aoa: Cell[][]; merges: XLSX.Range[]; widths: number[] } {
  const t = TITLES[kind];
  const isBaseline = kind === "1A";
  const heads = [...READING_HEADS, ...(isBaseline ? FORM1A_TAIL : FORM1B_TAIL)];
  const colCount = heads.length;
  const last = colCount - 1;

  const aoa: Cell[][] = [
    [`${t.code} (${FORM_YEAR})`],
    ["Republic of the Philippines"],
    ["Department of Education"],
    [info.region],
    [
      `Master List Beneficiaries for School-Based Feeding Program (SBFP) ( SY ${info.schoolYear} ) - ${t.period}`,
    ],
    [],
    ["Division:", info.division, "", "", "", "", "Name of Principal:", info.principalName],
    [
      "City/ Municipality/Barangay:",
      info.municipalityBarangay,
      "",
      "",
      "",
      "",
      "Name of Feeding Focal Person:",
      info.focalPersonName,
    ],
    [
      "Name of School / School District:",
      [info.schoolName, info.district].filter(Boolean).join(" / "),
    ],
    ["School ID Number:", info.depedSchoolId],
    [],
  ];

  const headRow = aoa.length;
  aoa.push(heads);
  const sub: Cell[] = Array(colCount).fill("");
  sub[10] = "BMI-A";
  sub[11] = "HFA";
  if (!isBaseline) FORM1B_SUBHEADS.forEach((h, k) => (sub[12 + k] = h));
  aoa.push(sub);

  const merges: XLSX.Range[] = [];
  const m = (r1: number, c1: number, r2: number, c2: number) =>
    merges.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
  for (let r = 0; r <= 4; r++) m(r, 0, r, last);
  // Two-row column heads: everything spans both rows except the grouped ones.
  for (let c = 0; c < colCount; c++) {
    const grouped = c === 10 || c === 11 || (!isBaseline && c >= 12);
    if (!grouped) m(headRow, c, headRow + 1, c);
  }
  m(headRow, 10, headRow, 11);
  if (!isBaseline) m(headRow, 12, headRow, 14);

  if (isBaseline) {
    rows.forEach((r, i) => {
      aoa.push([
        ...readingCells(r, i, r.baseline),
        r.classification === "primary" ? "Primary" : "Secondary",
        yesNo(r.is_pregnant),
        yesNo(r.has_infant),
        yesNo(r.is_dewormed),
        yesNo(r.milk_consent),
        yesNo(r.is_4ps),
        yesNo(r.is_previous_beneficiary),
      ]);
    });
  } else {
    const period = kind === "1M" ? "midline" : "endline";
    rows.forEach((r, i) => {
      const a = attendanceById.get(r.id);
      aoa.push([
        ...readingCells(r, i, readingFor(r, period)),
        a ? a.present : null,
        a ? a.feedingDays : null,
        round2(a?.percent ?? null),
      ]);
    });
    const average = averagePercent(rows.map((r) => attendanceById.get(r.id)?.percent ?? null));
    const totRow = aoa.length;
    const tot: Cell[] = Array(colCount).fill("");
    tot[0] = "Average Percent Attendance";
    tot[last] = round2(average);
    aoa.push(tot);
    m(totRow, 0, totRow, last - 1);
  }

  if (rows.length === 0) aoa.push(["No beneficiaries selected."]);

  aoa.push([]);
  if (isBaseline) {
    aoa.push([
      "* Primary: Severely Wasted and Wasted learners. Secondary: Stunted / Severely Stunted, PARDOs, indigent, IP and other identified learners.",
    ]);
    aoa.push([]);
  }
  aoa.push(["Prepared by:", "", "", "", "", "", "", "Approved by:"]);
  aoa.push([]);
  aoa.push(["", info.focalPersonName, "", "", "", "", "", info.principalName]);
  aoa.push(["", "School Feeding Focal Person", "", "", "", "", "", info.principalTitle || "School Head"]);

  const widths = [
    5, 32, 5, 16, 13, 14, 12, 9, 9, 9, 16, 16,
    ...(isBaseline ? [14, 10, 12, 10, 11, 10, 12] : [11, 11, 13]),
  ];

  return { aoa, merges, widths };
}

export function buildSbfpForm1Workbook(
  kind: SbfpForm1Kind,
  info: SbfpHeaderInfo,
  rows: SbfpBeneficiaryView[],
  attendanceById?: ReadonlyMap<string, FeedingAttendance>,
): XLSX.WorkBook {
  const { aoa, merges, widths } = buildSbfpForm1Rows(kind, info, rows, attendanceById);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = merges;
  ws["!cols"] = widths.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, TITLES[kind].sheet);
  return wb;
}

export function sbfpForm1Filename(kind: SbfpForm1Kind, info: SbfpHeaderInfo): string {
  const base = {
    "1A": "SBFP_Form_1A_Baseline",
    "1M": "SBFP_Master_List_Midline",
    "1B": "SBFP_Form_1B_Endline",
  }[kind];
  const school = info.depedSchoolId || info.schoolName.replace(/[^A-Za-z0-9]+/g, "_");
  return `${base}_${school}_SY${info.schoolYear}.xlsx`;
}

export function downloadSbfpForm1Excel(
  kind: SbfpForm1Kind,
  info: SbfpHeaderInfo,
  rows: SbfpBeneficiaryView[],
  attendanceById?: ReadonlyMap<string, FeedingAttendance>,
): void {
  XLSX.writeFile(
    buildSbfpForm1Workbook(kind, info, rows, attendanceById),
    sbfpForm1Filename(kind, info),
  );
}
