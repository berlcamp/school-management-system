/**
 * Pre-printed OMR answer sheets — one page per learner.
 *
 * This is the only generator in the module that uses jsPDF rather than the
 * house HTML-to-print path, and the reason is physical: the browser print
 * dialog is free to scale, and every millimetre here has to survive the trip to
 * paper and back through the decoder. A real PDF at exact A4 also lets a school
 * send the file to a copier or a print shop unchanged.
 *
 * Every coordinate comes from `lib/omr/layout.ts`. Nothing is positioned by
 * eye, because the decoder samples those same coordinates.
 *
 * Half and quarter sheets (`format`) print 2 or 4 learners side by side on an
 * A4 page with dashed cut lines between them. Each strip carries its own
 * corner squares, so a cut strip scans on its own.
 *
 * The learner's id is shaded here, at print time — the learner never fills in
 * an ID block, which removes the single largest source of mis-attributed
 * papers. The consequence is that a sheet belongs to one named learner and
 * cannot be handed to another.
 */

import { jsPDF } from "jspdf";
import {
  buildSheetLayout,
  choiceLetter,
  encodeStudentCode,
  SHEET_FORMAT_LABELS,
  SHEETS_PER_PAGE,
  type SheetFormat,
  type SheetLayout,
} from "@/lib/omr/layout";
import { itemSpecsFromKey, type AnswerKeyItem } from "@/lib/omr/score";
import { sortLearnersBySex } from "@/lib/utils/learnerSex";

export interface AnswerSheetLearner {
  /** sms_students.id — what gets bubble-encoded into the ID block. */
  studentId: number;
  name: string;
  lrn?: string | null;
  /** sms_students.gender — pages print males first, then females. */
  gender?: string | null;
}

export interface AnswerSheetParams {
  schoolName: string;
  examTitle: string;
  subjectName: string;
  sectionName: string;
  schoolYear: string;
  versionLabel: string;
  /** The exam's answer key — fixes the item count and bubbles per item. */
  answerKey: AnswerKeyItem[];
  learners: AnswerSheetLearner[];
  dateAdministered?: string | null;
  /** Paper size per learner; defaults to the whole A4 page. */
  format?: SheetFormat;
}

const INK: [number, number, number] = [0, 0, 0];
const GUIDE: [number, number, number] = [130, 130, 130];

/** Left margin of the header's text column. */
const TEXT_X = 12;
/** Indent for the exam identity block, clear of the orientation dot. */
const TITLE_X = 24;
/**
 * Right edge of every line of header text. The learner-code block starts at
 * 138mm and prints its digit rail and caption from ~134mm, so header text
 * allowed to run wider than this lands on top of the ID bubbles.
 */
const TEXT_RIGHT_X = 132;
/** The rule that separates the header from the answer grid. */
const HEADER_RULE_Y = 83;
/** mm per printed line, for a given point size. */
const lineHeight = (points: number) => points * 0.3528 * 1.25;

/** Build the sheets and hand the browser a PDF to save. */
export function generateAnswerSheets(params: AnswerSheetParams): void {
  const doc = buildAnswerSheetDoc(params);
  doc.save(answerSheetFilename(params));
}

export function answerSheetFilename(params: AnswerSheetParams): string {
  const safe = (s: string) => s.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
  const size =
    params.format === "half" ? "-half" : params.format === "quarter" ? "-quarter" : "";
  return `answer-sheets-${safe(params.sectionName)}-${safe(params.versionLabel)}${size}.pdf`;
}

/** Exposed separately so tests can inspect the document without downloading. */
export function buildAnswerSheetDoc(params: AnswerSheetParams): jsPDF {
  if (params.learners.length === 0) {
    throw new Error("No learners to print answer sheets for.");
  }
  if (params.answerKey.length === 0) {
    throw new Error(
      "This exam has no answer key yet, so there is nothing to lay out an answer sheet from.",
    );
  }

  const format = params.format ?? "full";
  const layout = buildSheetLayout(itemSpecsFromKey(params.answerKey), format);
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  if (format !== "full") {
    const perPage = SHEETS_PER_PAGE[format];
    sortLearnersBySex(params.learners, (l) => l.gender).forEach((learner, index) => {
      const slot = index % perPage;
      if (index > 0 && slot === 0) doc.addPage();
      if (slot === 0) drawCutLines(doc, layout, perPage);
      drawStrip(doc, layout, params, learner, slot * layout.pageWidthMm);
    });
    return doc;
  }

  // Males first, then females (the DepEd class-list order), so the stack of
  // sheets hands out in the same order as the class record. Stable: the
  // caller's order holds inside each group. Page order only — geometry is
  // untouched.
  sortLearnersBySex(params.learners, (l) => l.gender).forEach((learner, index) => {
    if (index > 0) doc.addPage();
    drawSheet(doc, layout, params, learner);
  });

  return doc;
}

function drawSheet(
  doc: jsPDF,
  layout: SheetLayout,
  params: AnswerSheetParams,
  learner: AnswerSheetLearner,
): void {
  drawRegistrationMarks(doc, layout);
  drawHeader(doc, layout, params, learner);
  drawIdBlock(doc, layout, learner);
  drawAnswerGrid(doc, layout);
  drawFooter(doc, layout, params);
}

/**
 * The four corner squares and the orientation dot. These are what the decoder
 * finds first; if a photocopier clips them the sheet is unreadable, which is
 * why they sit 10mm inside the page edge rather than at the margin.
 */
function drawRegistrationMarks(doc: jsPDF, layout: SheetLayout, ox = 0): void {
  doc.setFillColor(...INK);
  const size = layout.markerSizeMm;
  for (const marker of layout.markers) {
    doc.rect(ox + marker.x - size / 2, marker.y - size / 2, size, size, "F");
  }
  doc.circle(
    ox + layout.orientationDot.x,
    layout.orientationDot.y,
    layout.orientationDot.d / 2,
    "F",
  );
}

/**
 * Everything above the answer grid.
 *
 * The exam title, the subject line and the school name are free text a teacher
 * types, so none of them can be positioned at a fixed y: the header flows from
 * a cursor and each block is wrapped to the text column. Two things this
 * protects, both of which used to break on real data — a title long enough to
 * wrap printed straight through the subject line beneath it, and the directions
 * ran the full width of the page across the learner-code bubbles.
 */
function drawHeader(
  doc: jsPDF,
  layout: SheetLayout,
  params: AnswerSheetParams,
  learner: AnswerSheetLearner,
): void {
  const titleWidth = TEXT_RIGHT_X - TITLE_X;
  const bodyWidth = TEXT_RIGHT_X - TEXT_X;

  doc.setTextColor(...INK);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(
    fitLine(doc, params.schoolName || "Department of Education", titleWidth),
    TITLE_X,
    15,
  );

  doc.setFontSize(13);
  doc.text("ANSWER SHEET", TITLE_X, 21.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let y = 27;
  const identity = [
    ...wrapLines(doc, `${params.examTitle} — ${params.versionLabel}`, titleWidth, 2),
    ...wrapLines(
      doc,
      `${params.subjectName} · ${params.sectionName} · S.Y. ${params.schoolYear}`,
      titleWidth,
      2,
    ),
    ...(params.dateAdministered ? [`Date: ${params.dateAdministered}`] : []),
  ];
  for (const line of identity) {
    doc.text(line, TITLE_X, y);
    y += lineHeight(9);
  }

  // Learner identity, printed — not written by the learner.
  y = Math.max(y + 4, 48);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(fitLine(doc, learner.name.toUpperCase(), bodyWidth), TEXT_X, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  if (learner.lrn) {
    doc.text(`LRN: ${learner.lrn}`, TEXT_X, y);
    y += 3.5;
  }

  doc.setDrawColor(...GUIDE);
  doc.setLineWidth(0.2);
  doc.line(TEXT_X, y, TEXT_RIGHT_X, y);
  y += 3.5;
  doc.setFontSize(7);
  doc.setTextColor(...GUIDE);
  doc.text("This sheet belongs to the learner named above.", TEXT_X, y);
  y += 6;

  // Directions. Wrapped to the text column so they clear the ID block, and
  // never allowed to run into the rule above the answer grid.
  doc.setTextColor(...INK);
  doc.setFontSize(7.5);
  const directions = wrapLines(
    doc,
    "DIRECTIONS: Shade the circle of your answer completely using a pencil or a " +
      "black/blue ballpen. Shade only one circle per item. Erase changed answers " +
      "cleanly — a half-erased mark reads as two answers. Do not write on, fold or " +
      "staple over the black squares at the corners.",
    bodyWidth,
    5,
  );
  const directionsHeight = (directions.length - 1) * lineHeight(7.5);
  doc.text(
    directions,
    TEXT_X,
    Math.min(y, HEADER_RULE_Y - 3 - directionsHeight),
    { lineHeightFactor: 1.25 },
  );

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.line(TEXT_X, HEADER_RULE_Y, 198, HEADER_RULE_Y);
}

/**
 * Wrap `text` to at most `maxLines`, ellipsising the last one if it overflows.
 * Truncating is deliberate: a header that grows without bound would eventually
 * reach the answer grid, and the grid's coordinates are not negotiable.
 */
function wrapLines(
  doc: jsPDF,
  text: string,
  width: number,
  maxLines: number,
): string[] {
  const lines = doc.splitTextToSize(text, width) as string[];
  if (lines.length <= maxLines) return lines;

  let last = lines[maxLines - 1];
  while (last.length > 1 && doc.getTextWidth(`${last}...`) > width) {
    last = last.slice(0, -1);
  }
  return [...lines.slice(0, maxLines - 1), `${last.trimEnd()}...`];
}

/** `wrapLines` for something that must stay on one line. */
function fitLine(doc: jsPDF, text: string, width: number): string {
  return wrapLines(doc, text, width, 1)[0];
}

/**
 * The bubble-encoded learner id: one column per digit, shaded here, plus a
 * mod-10 check digit. The digits are also printed in plain text above the block
 * so a human can verify a sheet at a glance.
 */
function drawIdBlock(
  doc: jsPDF,
  layout: SheetLayout,
  learner: AnswerSheetLearner,
): void {
  const code = encodeStudentCode(learner.studentId);
  const first = layout.idColumns[0][0];
  const last = layout.idColumns[layout.idColumns.length - 1][0];

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("LEARNER CODE — DO NOT ALTER", first.x - 2.5, first.y - 8.5);

  doc.setFont("courier", "bold");
  doc.setFontSize(9);
  doc.text(code.join(" "), first.x - 2.5, first.y - 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(...GUIDE);
  doc.text("chk", last.x - 1.6, last.y - 2.2);

  layout.idColumns.forEach((column, columnIndex) => {
    column.forEach((bubble, digit) => {
      if (code[columnIndex] === digit) {
        doc.setFillColor(...INK);
        doc.circle(bubble.x, bubble.y, bubble.d / 2, "F");
      } else {
        doc.setDrawColor(...GUIDE);
        doc.setLineWidth(0.15);
        doc.circle(bubble.x, bubble.y, bubble.d / 2, "S");
      }
    });
  });

  // Digit rail down the left of the block, so the encoding is legible on paper.
  doc.setFontSize(5);
  doc.setTextColor(...GUIDE);
  layout.idColumns[0].forEach((bubble, digit) => {
    doc.text(String(digit), bubble.x - 4, bubble.y + 0.8);
  });
}

/**
 * Item numbers and their bubbles.
 *
 * Choice letters are printed as a header above each column rather than inside
 * the bubbles. A glyph inside a bubble is ink the decoder has to see past on
 * every unmarked item, and different letters carry different amounts of it;
 * keeping the circles empty makes an unmarked bubble unambiguously empty.
 */
function drawAnswerGrid(doc: jsPDF, layout: SheetLayout, ox = 0): void {
  // Widest row in each answer column decides how many letters its header shows.
  const columnWidth = new Map<number, number>();
  for (const row of layout.rows) {
    const x = row.bubbles[0].x;
    columnWidth.set(x, Math.max(columnWidth.get(x) ?? 0, row.choiceCount));
  }

  const headerY = layout.rows[0].bubbles[0].y - 5;
  const pitch = choicePitch(layout);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...INK);
  for (const [startX, choices] of columnWidth) {
    for (let c = 0; c < choices; c += 1) {
      doc.text(choiceLetter(c), ox + startX + c * pitch, headerY, {
        align: "center",
      });
    }
  }

  doc.setFont("helvetica", "normal");
  for (const row of layout.rows) {
    doc.setFontSize(7.5);
    doc.setTextColor(...INK);
    doc.text(String(row.itemNumber), ox + row.label.x, row.label.y + 1, {
      align: "right",
    });

    doc.setDrawColor(...INK);
    doc.setLineWidth(0.2);
    for (const bubble of row.bubbles) {
      doc.circle(ox + bubble.x, bubble.y, bubble.d / 2, "S");
    }
  }
}

/** Horizontal gap between choice bubbles, read back off the layout. */
function choicePitch(layout: SheetLayout): number {
  const row = layout.rows.find((r) => r.bubbles.length > 1);
  return row ? row.bubbles[1].x - row.bubbles[0].x : 6.5;
}

function drawFooter(
  doc: jsPDF,
  layout: SheetLayout,
  params: AnswerSheetParams,
): void {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...GUIDE);
  doc.text(
    `${params.examTitle} · ${params.versionLabel} · ${layout.rows.length} items · machine-scored answer sheet`,
    12,
    layout.pageHeightMm - 6,
    { maxWidth: 186 },
  );
}

// ---------------------------------------------------------------------------
// Half and quarter strips
// ---------------------------------------------------------------------------

/**
 * Dashed lines where the page is cut into strips, drawn once per page. Light
 * grey and outside every strip's marks, so a cut that wanders a few
 * millimetres off the line costs nothing.
 */
function drawCutLines(doc: jsPDF, layout: SheetLayout, perPage: number): void {
  doc.setDrawColor(...GUIDE);
  doc.setLineWidth(0.15);
  doc.setLineDashPattern([2, 1.5], 0);
  for (let i = 1; i < perPage; i += 1) {
    const x = i * layout.pageWidthMm;
    doc.line(x, 0, x, layout.pageHeightMm);
  }
  doc.setLineDashPattern([], 0);
}

/** One learner's strip, `ox` mm from the page's left edge. */
function drawStrip(
  doc: jsPDF,
  layout: SheetLayout,
  params: AnswerSheetParams,
  learner: AnswerSheetLearner,
  ox: number,
): void {
  drawRegistrationMarks(doc, layout, ox);
  if (layout.format === "quarter") {
    drawQuarterHeader(doc, layout, params, learner, ox);
  } else {
    drawHalfHeader(doc, layout, params, learner, ox);
  }
  drawStripIdBlock(doc, layout, learner, ox);
  drawAnswerGrid(doc, layout, ox);

  // Footer between the bottom markers.
  const left = layout.markers[3].x + layout.markerSizeMm / 2 + 2;
  const right = layout.markers[2].x - layout.markerSizeMm / 2 - 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(layout.format === "quarter" ? 4.5 : 5.5);
  doc.setTextColor(...GUIDE);
  doc.text(
    fitLine(
      doc,
      layout.format === "quarter"
        ? `${params.versionLabel} · ${layout.rows.length} items`
        : `${params.versionLabel} · ${layout.rows.length} items · ${SHEET_FORMAT_LABELS[layout.format]}`,
      right - left,
    ),
    ox + left,
    layout.markers[3].y + 1,
  );
}

function drawHalfHeader(
  doc: jsPDF,
  layout: SheetLayout,
  params: AnswerSheetParams,
  learner: AnswerSheetLearner,
  ox: number,
): void {
  // Between the two top markers, then below them; clear of the dot at x < 12.
  const x = ox + 16;
  const width = layout.markers[1].x - layout.markerSizeMm / 2 - 2 - 16;
  const fullWidth = layout.pageWidthMm - 16 - 8;

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(fitLine(doc, params.schoolName || "Department of Education", width), x, 9.5);
  doc.setFontSize(10);
  doc.text("ANSWER SHEET", x, 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  let y = 20.5;
  const identity = [
    ...wrapLines(doc, `${params.examTitle} — ${params.versionLabel}`, fullWidth, 2),
    fitLine(
      doc,
      `${params.subjectName} · ${params.sectionName} · S.Y. ${params.schoolYear}`,
      fullWidth,
    ),
    ...(params.dateAdministered ? [`Date: ${params.dateAdministered}`] : []),
  ];
  for (const line of identity) {
    doc.text(line, x, y);
    y += lineHeight(7.5);
  }

  y = Math.max(y + 2.5, 35);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(fitLine(doc, learner.name.toUpperCase(), fullWidth), x, y);
  if (learner.lrn) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`LRN: ${learner.lrn}`, x, y + 3.8);
  }

  // Directions under the learner code, above the answer grid.
  const firstRowY = layout.rows[0].bubbles[0].y;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...INK);
  doc.text(
    wrapLines(
      doc,
      "Shade one circle per item completely. Erase changes cleanly. Keep the black corner squares clean.",
      layout.pageWidthMm - 24,
      2,
    ),
    ox + 12,
    firstRowY - 16,
    { lineHeightFactor: 1.25 },
  );
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.line(ox + 12, firstRowY - 10, ox + layout.pageWidthMm - 12, firstRowY - 10);
}

function drawQuarterHeader(
  doc: jsPDF,
  layout: SheetLayout,
  params: AnswerSheetParams,
  learner: AnswerSheetLearner,
  ox: number,
): void {
  const between = layout.markers[1].x - layout.markerSizeMm / 2 - 1.5 - 14;
  // Below the top markers the text may use the strip's width, clear of the
  // dot (x < 11) down to y ~33.
  const x = ox + 13;
  const width = layout.pageWidthMm - 13 - 5;

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text(fitLine(doc, "ANSWER SHEET", between), ox + 14, 9.8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  let y = 16.5;
  const lines = [
    fitLine(doc, params.schoolName || "Department of Education", width),
    ...wrapLines(doc, `${params.examTitle} — ${params.versionLabel}`, width, 2),
    fitLine(doc, `${params.subjectName} · ${params.sectionName}`, width),
    fitLine(doc, `S.Y. ${params.schoolYear}`, width),
  ];
  for (const line of lines) {
    doc.text(line, x, y);
    y += lineHeight(5.5);
  }

  // The learner's name runs the strip's width, under the dot.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text(fitLine(doc, learner.name.toUpperCase(), layout.pageWidthMm - 10), ox + 5, 35.5);
  if (learner.lrn) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.text(`LRN: ${learner.lrn}`, ox + 5, 38.5);
  }

  const firstRowY = layout.rows[0].bubbles[0].y;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.text(
    wrapLines(doc, "Shade one circle per item. Erase changes cleanly.", layout.pageWidthMm - 10, 2),
    ox + 5,
    firstRowY - 12.5,
    { lineHeightFactor: 1.2 },
  );
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.line(ox + 5, firstRowY - 8.5, ox + layout.pageWidthMm - 5, firstRowY - 8.5);
}

/**
 * The learner code on a strip. On the half sheet it is the page's block
 * (positions run down); on the quarter it is turned — one row per digit
 * position, digits 0–9 across — because nine columns do not fit 52 mm.
 */
function drawStripIdBlock(
  doc: jsPDF,
  layout: SheetLayout,
  learner: AnswerSheetLearner,
  ox: number,
): void {
  const code = encodeStudentCode(learner.studentId);
  const first = layout.idColumns[0][0];
  const across = layout.idColumns[0][1].x !== first.x;

  layout.idColumns.forEach((position, positionIndex) => {
    position.forEach((bubble, digit) => {
      if (code[positionIndex] === digit) {
        doc.setFillColor(...INK);
        doc.circle(ox + bubble.x, bubble.y, bubble.d / 2, "F");
      } else {
        doc.setDrawColor(...GUIDE);
        doc.setLineWidth(0.15);
        doc.circle(ox + bubble.x, bubble.y, bubble.d / 2, "S");
      }
    });
  });

  doc.setTextColor(...INK);
  if (across) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5);
    doc.text("LEARNER CODE — DO NOT ALTER", ox + 5, first.y - 5.2);
    // Digit captions above the first row.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4);
    doc.setTextColor(...GUIDE);
    layout.idColumns[0].forEach((bubble, digit) => {
      doc.text(String(digit), ox + bubble.x, bubble.y - 2.3, { align: "center" });
    });
    const last = layout.idColumns[layout.idColumns.length - 1][0];
    doc.setFont("courier", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...INK);
    doc.text(code.join(" "), ox + 5, last.y + 5);
    return;
  }

  const last = layout.idColumns[layout.idColumns.length - 1][0];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text("LEARNER CODE — DO NOT ALTER", ox + first.x - 2.5, first.y - 7.5);
  doc.setFont("courier", "bold");
  doc.setFontSize(8.5);
  doc.text(code.join(" "), ox + first.x - 2.5, first.y - 3.6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.setTextColor(...GUIDE);
  doc.text("chk", ox + last.x - 1.6, last.y - 2.2);
  layout.idColumns[0].forEach((bubble, digit) => {
    doc.text(String(digit), ox + bubble.x - 4, bubble.y + 0.8);
  });
}
