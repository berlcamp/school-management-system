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

function drawHeader(
  doc: jsPDF,
  layout: SheetLayout,
  params: AnswerSheetParams,
  learner: AnswerSheetLearner,
): void {
  doc.setTextColor(...INK);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(params.schoolName || "Department of Education", 24, 15);

  doc.setFontSize(13);
  doc.text("ANSWER SHEET", 24, 21.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `${params.examTitle} — ${params.versionLabel}`,
    24,
    27,
    { maxWidth: 108 },
  );
  doc.text(
    `${params.subjectName} · ${params.sectionName} · S.Y. ${params.schoolYear}`,
    24,
    32,
    { maxWidth: 108 },
  );
  if (params.dateAdministered) {
    doc.text(`Date: ${params.dateAdministered}`, 24, 37);
  }

  // Learner identity, printed — not written by the learner.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(learner.name.toUpperCase(), 12, 48, { maxWidth: 120 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  if (learner.lrn) doc.text(`LRN: ${learner.lrn}`, 12, 53);

  doc.setDrawColor(...GUIDE);
  doc.setLineWidth(0.2);
  doc.line(12, 56, 132, 56);
  doc.setFontSize(7);
  doc.setTextColor(...GUIDE);
  doc.text("This sheet belongs to the learner named above.", 12, 59.5);

  // Directions box.
  doc.setTextColor(...INK);
  doc.setFontSize(7.5);
  doc.text(
    [
      "DIRECTIONS: Shade the circle of your answer completely using a pencil or a black/blue ballpen.",
      "Shade only one circle per item. Erase changed answers cleanly — a half-erased mark reads as two answers.",
      "Do not write on, fold or staple over the black squares at the corners.",
    ],
    12,
    68,
    { maxWidth: 186, lineHeightFactor: 1.35 },
  );

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.line(12, 83, 198, 83);
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
