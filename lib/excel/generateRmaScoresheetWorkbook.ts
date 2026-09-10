/**
 * RMA scoresheet → the division's own Excel workbook.
 *
 * The division issues `RMA2_G2Scoresheet_v5b.xlsx` and expects that file back.
 * It is not a table: it carries sheet protection, 18 data-validation rules,
 * conditional formatting, three charts and a Class Summary sheet that is
 * entirely formulas over the roster. So the download **fills the issued form**
 * rather than rebuilding it — `public/templates/rma-g2-scoresheet.xlsx` is that
 * workbook with every value a school typed into it removed (see
 * `scripts/build-rma-template.mjs`), and this module writes the header block and
 * the learner rows back in, leaving the rest of the zip untouched.
 *
 * Two things are written from the app rather than left as issued:
 *
 * - **Row 8 / row 9** take their task labels and maximum scores from the
 *   material's own items. Row 9 is what the score validations bound against
 *   (`formula2` is `I$9`) and what the percentage divides by (`T$9`), so a
 *   material whose tasks differ from the issued G2 set still scores correctly.
 * - **Column V** — the levelling — is rebuilt from `sms_rma_bands` so the
 *   workbook and the screen can never disagree. The issued formula hardcodes
 *   the five DepEd bands; a material carrying those five produces byte-identical
 *   results, and one carrying the three KS1 bands produces the levelling the
 *   teacher has been looking at all term.
 *
 * The template is the **Grade 2** form (`RMAKS1v5`), 11 task columns, 100
 * learner rows. Anything outside that shape falls back to a plain sheet with
 * the same columns — see `buildPlainWorkbook`. Drop a blanked Grade N workbook
 * beside it and add a `TEMPLATES` entry to widen this.
 */

import { RmaBand, RmaItem, RmaMaterial, Student } from "@/types";
import {
  blank,
  CellPatch,
  columnLetter,
  excelSerial,
  formula,
  num,
  setCells,
  text,
} from "./xlsxTemplate";

export interface RmaWorkbookMeta {
  date_assessed: string | null;
  remarks: string | null;
}

export interface RmaWorkbookParams {
  material: RmaMaterial;
  items: RmaItem[];
  bands: RmaBand[];
  /** Male group then female group, each already in the table's display order. */
  students: Student[];
  scores: Record<string, Record<string, number | null>>;
  meta: Record<string, RmaWorkbookMeta>;
  sectionName: string;
  gradeLevel: number;
  schoolCode: string | null;
  schoolName: string | null;
  region: string | null;
  teacherName: string;
  /** BoSY | MoSY | EoSY — the issued C4 dropdown's own values. */
  phase: string;
  schoolYear: string;
}

// ─── The issued Grade 2 form ────────────────────────────────────────────────

const TEMPLATE_URL = "/templates/rma-g2-scoresheet.xlsx";
const SHEET_PART = "xl/worksheets/sheet1.xml"; // "G2 RMA Scoresheet"
const SUMMARY_PART = "xl/worksheets/sheet3.xml"; // "Class Summary"

const TEMPLATE_GRADE = 2;
const FIRST_TASK_COLUMN = 9; // I
const TASK_COLUMNS = 11; // I..S
const FIRST_DATA_ROW = 10;
const DATA_ROWS = 100; // 10..109
/** Class Summary's five proficiency columns: G..K on row 9, C..G on row 19. */
const SUMMARY_BAND_SLOTS = 5;

const taskColumn = (index: number) => columnLetter(FIRST_TASK_COLUMN + index);

/** The task's own name, as the division wrote it on the material. */
function taskName(item: RmaItem, index: number): string {
  const domain = item.domain?.trim();
  if (domain) return domain;
  return `Item ${item.item_no ?? index + 1}`;
}

/** Row 8's long header: the task name and what it is worth. */
function taskHeader(item: RmaItem, index: number): string {
  const question = item.question_text?.trim();
  const name = taskName(item, index);
  const label = question && question !== name ? `${name}: ${question}` : name;
  return `${label} (${Number(item.max_score)})`;
}

function learnerName(s: Student): string {
  const last = [s.last_name, s.suffix].filter(Boolean).join(" ");
  const rest = [s.first_name, s.middle_name].filter(Boolean).join(" ");
  return `${last}, ${rest}`.trim();
}

/** An Excel string literal — a quote inside one is doubled. */
function quoted(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * The levelling formula for one row, built from the material's bands.
 *
 * Mirrors `masteryForScore()`: the percentage is rounded to two decimals before
 * it is banded, so a score landing on a band edge resolves the same way in the
 * workbook as it does on screen. Column U holds the fraction, hence the ×100.
 */
export function levellingFormula(bands: RmaBand[], row: number): string {
  const pct = `ROUND($U${row}*100,2)`;
  let chain = '""';
  for (let i = bands.length - 1; i >= 0; i--) {
    const b = bands[i];
    chain = `IF(AND(${pct}>=${Number(b.min_score)},${pct}<=${Number(b.max_score)}),${quoted(b.label)},${chain})`;
  }
  return `IF(U${row}<>"",${chain},"")`;
}

export function templateFits(gradeLevel: number, items: RmaItem[], roster: number): boolean {
  return (
    gradeLevel === TEMPLATE_GRADE &&
    items.length > 0 &&
    items.length <= TASK_COLUMNS &&
    roster <= DATA_ROWS
  );
}

/** Every cell this fills on the scoresheet sheet. Exported for the tests. */
export function scoresheetPatches(params: RmaWorkbookParams): Record<string, CellPatch> {
  const { items, bands, students, scores, meta } = params;
  const patches: Record<string, CellPatch> = {};

  // Header block.
  patches.C4 = text(params.phase);
  patches.C5 = params.region ? text(params.region) : blank;
  patches.C6 =
    params.schoolCode && /^\d+$/.test(params.schoolCode)
      ? num(Number(params.schoolCode))
      : params.schoolCode
        ? text(params.schoolCode)
        : blank;
  patches.C7 = text(`Grade ${params.gradeLevel}`);
  patches.F6 = params.schoolName ? text(params.schoolName) : blank;
  patches.F7 = text(params.teacherName || "");
  patches.K7 = text(params.sectionName || "");
  patches.O6 = num(students.filter((s) => s.gender !== "female").length);
  patches.O7 = num(students.filter((s) => s.gender === "female").length);

  // Task columns: the header the division authored, and the maximum the score
  // validations and the percentage both read off row 9.
  for (let i = 0; i < TASK_COLUMNS; i++) {
    const col = taskColumn(i);
    const item = items[i];
    patches[`${col}8`] = item ? text(taskHeader(item, i)) : blank;
    patches[`${col}9`] = item ? num(Number(item.max_score)) : blank;
  }

  // Learner rows.
  students.forEach((s, index) => {
    const row = FIRST_DATA_ROW + index;
    const studentScores = scores[s.id] || {};
    const assessed = meta[s.id]?.date_assessed ?? null;
    const remarks = meta[s.id]?.remarks ?? null;
    const birth = excelSerial(s.date_of_birth);
    const dateAssessed = excelSerial(assessed);

    patches[`B${row}`] =
      s.lrn && /^\d+$/.test(s.lrn) ? num(Number(s.lrn)) : s.lrn ? text(s.lrn) : blank;
    patches[`C${row}`] = text(learnerName(s));
    patches[`D${row}`] = text(s.gender === "female" ? "Female" : "Male");
    patches[`E${row}`] = birth === null ? blank : num(birth);
    patches[`F${row}`] = dateAssessed === null ? blank : num(dateAssessed);
    patches[`H${row}`] = s.mother_tongue ? text(s.mother_tongue) : blank;
    patches[`W${row}`] = remarks ? text(remarks) : blank;

    for (let i = 0; i < TASK_COLUMNS; i++) {
      const item = items[i];
      const raw = item ? studentScores[item.id] : undefined;
      patches[`${taskColumn(i)}${row}`] =
        raw === undefined || raw === null ? blank : num(Number(raw));
    }
  });

  // The levelling column, every row of it. The issued file writes column V as
  // three shared-formula groups; replacing part of one orphans the rest, so the
  // whole range is rewritten as plain formulas or none of it is.
  for (let i = 0; i < DATA_ROWS; i++) {
    const row = FIRST_DATA_ROW + i;
    patches[`V${row}`] = formula(levellingFormula(bands, row));
  }

  return patches;
}

/** Every cell this fills on the Class Summary sheet. Exported for the tests. */
export function summaryPatches(params: RmaWorkbookParams): Record<string, CellPatch> {
  const { items, bands } = params;
  const patches: Record<string, CellPatch> = {};

  patches.A11 = text(`Grade ${params.gradeLevel}`);

  // The proficiency counts are COUNTIFS against these header cells, so the
  // labels here are what makes the summary agree with column V. A slot with no
  // band gets a space: it prints blank but still matches nothing, where an
  // empty cell would match every unassessed learner's empty levelling.
  for (let i = 0; i < SUMMARY_BAND_SLOTS; i++) {
    const label = bands[i] ? bands[i].label : " ";
    patches[`${columnLetter(7 + i)}9`] = text(label); // G..K
    patches[`${columnLetter(3 + i)}19`] = text(label); // C..G
  }

  // Per-task columns, on the table and on the dashboard beneath it.
  for (let i = 0; i < TASK_COLUMNS; i++) {
    const col = columnLetter(12 + i); // L..V
    const label = items[i] ? text(taskName(items[i], i)) : blank;
    patches[`${col}9`] = label;
    patches[`${col}19`] = label;
  }

  // The issued Percentage Mean Score divides by a hardcoded 25 — this material's
  // total lives in T9 on the scoresheet, so read it from there.
  for (const [cell, source] of [
    ["W20", "W11"],
    ["W21", "W12"],
    ["W22", "W14"],
  ] as const) {
    patches[cell] = formula(`IFERROR(${source}/'G2 RMA Scoresheet'!$T$9,"")`);
  }

  return patches;
}

export function workbookFilename(params: RmaWorkbookParams): string {
  return `RMA_Grade-${params.gradeLevel}_${params.sectionName}_${params.phase}_${params.schoolYear}`
    .replace(/\s+/g, "-")
    .replace(/[\\/:*?"<>|]/g, "");
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Fills the issued workbook and hands it to the browser. Falls back to a plain
 * sheet of the same columns when the material does not fit the Grade 2 form.
 */
export async function generateRmaScoresheetWorkbook(
  params: RmaWorkbookParams,
): Promise<void> {
  const filename = `${workbookFilename(params)}.xlsx`;

  if (!templateFits(params.gradeLevel, params.items, params.students.length)) {
    download(await buildPlainWorkbook(params), filename);
    return;
  }

  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) throw new Error(`Template unavailable (${response.status})`);
  const [{ unzipSync, zipSync, strToU8, strFromU8 }, buffer] = await Promise.all([
    import("fflate"),
    response.arrayBuffer(),
  ]);

  const zip = unzipSync(new Uint8Array(buffer));
  zip[SHEET_PART] = strToU8(
    setCells(strFromU8(zip[SHEET_PART]), scoresheetPatches(params)),
  );
  zip[SUMMARY_PART] = strToU8(
    setCells(strFromU8(zip[SUMMARY_PART]), summaryPatches(params)),
  );

  download(
    new Blob([zipSync(zip, { level: 6 }) as unknown as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename,
  );
}

/**
 * The same columns as the issued form, as an ordinary sheet — for a grade the
 * division has not issued a workbook for, or a roster past the form's 100 rows.
 * Everything is a computed value: without the form's formulas there is nothing
 * for Excel to recalculate.
 */
async function buildPlainWorkbook(params: RmaWorkbookParams): Promise<Blob> {
  const XLSX = await import("xlsx");
  const { items, bands, students, scores, meta } = params;
  const total = items.reduce((sum, it) => sum + Number(it.max_score), 0);

  const level = (pct: number): string => {
    const rounded = Math.round((pct + Number.EPSILON) * 100) / 100;
    const band = bands.find(
      (b) => rounded >= Number(b.min_score) && rounded <= Number(b.max_score),
    );
    return band ? band.label : "";
  };

  const rows: (string | number)[][] = [
    ["Assessment Type", params.phase],
    ["Region", params.region ?? ""],
    ["School ID:", params.schoolCode ?? "", "School Name:", params.schoolName ?? ""],
    ["Grade:", `Grade ${params.gradeLevel}`, "Teacher :", params.teacherName],
    ["Section:", params.sectionName, "School Year:", params.schoolYear],
    [],
    [
      "S/N",
      "LRN",
      "Name of Learner",
      "Sex",
      "Birthdate",
      "Date of Asessment",
      "Mother Tongue",
      ...items.map((it, i) => taskHeader(it, i)),
      `TOTAL SCORE (${total})`,
      "% of Correct Answer",
      "Levelling of Learners",
      "Remarks",
    ],
    [
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ...items.map((it) => Number(it.max_score)),
      total,
      "",
      "",
      "",
    ],
  ];

  students.forEach((s, index) => {
    const studentScores = scores[s.id] || {};
    const entered = items.some((it) => {
      const v = studentScores[it.id];
      return v !== undefined && v !== null;
    });
    const raw = items.reduce(
      (sum, it) => sum + (Number(studentScores[it.id] ?? 0) || 0),
      0,
    );
    const pct = total > 0 ? (raw / total) * 100 : 0;
    rows.push([
      index + 1,
      s.lrn ?? "",
      learnerName(s),
      s.gender === "female" ? "Female" : "Male",
      s.date_of_birth ?? "",
      meta[s.id]?.date_assessed ?? "",
      s.mother_tongue ?? "",
      ...items.map((it) => {
        const v = studentScores[it.id];
        return v === undefined || v === null ? "" : Number(v);
      }),
      entered ? raw : "",
      entered ? `${(Math.round(pct * 100) / 100).toFixed(2)}%` : "",
      entered ? level(pct) : "",
      meta[s.id]?.remarks ?? "",
    ]);
  });

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 5 },
    { wch: 15 },
    { wch: 32 },
    { wch: 8 },
    { wch: 12 },
    { wch: 16 },
    { wch: 20 },
    ...items.map(() => ({ wch: 10 })),
    { wch: 12 },
    { wch: 12 },
    { wch: 28 },
    { wch: 24 },
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "RMA Scoresheet");
  const out = XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
