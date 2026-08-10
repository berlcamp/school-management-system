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
  type SheetLayout,
} from "@/lib/omr/layout";
import { itemSpecsFromKey, type AnswerKeyItem } from "@/lib/omr/score";

export interface AnswerSheetLearner {
  /** sms_students.id — what gets bubble-encoded into the ID block. */
  studentId: number;
  name: string;
  lrn?: string | null;
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
  return `answer-sheets-${safe(params.sectionName)}-${safe(params.versionLabel)}.pdf`;
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

  const layout = buildSheetLayout(itemSpecsFromKey(params.answerKey));
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  params.learners.forEach((learner, index) => {
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
function drawRegistrationMarks(doc: jsPDF, layout: SheetLayout): void {
  doc.setFillColor(...INK);
  const size = layout.markerSizeMm;
  for (const marker of layout.markers) {
    doc.rect(marker.x - size / 2, marker.y - size / 2, size, size, "F");
  }
  doc.circle(
    layout.orientationDot.x,
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
function drawAnswerGrid(doc: jsPDF, layout: SheetLayout): void {
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
      doc.text(choiceLetter(c), startX + c * pitch, headerY, {
        align: "center",
      });
    }
  }

  doc.setFont("helvetica", "normal");
  for (const row of layout.rows) {
    doc.setFontSize(7.5);
    doc.setTextColor(...INK);
    doc.text(String(row.itemNumber), row.label.x, row.label.y + 1, {
      align: "right",
    });

    doc.setDrawColor(...INK);
    doc.setLineWidth(0.2);
    for (const bubble of row.bubbles) {
      doc.circle(bubble.x, bubble.y, bubble.d / 2, "S");
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
