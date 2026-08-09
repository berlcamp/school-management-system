/**
 * Answer sheet generator.
 *
 * The decoder tests prove that a sheet drawn at the layout's coordinates can be
 * read back. These prove the OTHER half — that the PDF actually puts ink at
 * those coordinates — by reading the generated content stream and checking the
 * registration marks land where `layout.ts` says, converted to PDF points.
 *
 * Without this, the two halves could drift: the decoder would keep sampling the
 * right places on a sheet nobody prints that way any more, and every scan would
 * come back blank with no test failing.
 */

import { describe, expect, it } from "vitest";
import {
  answerSheetFilename,
  buildAnswerSheetDoc,
  type AnswerSheetParams,
} from "../generateAnswerSheets";
import {
  buildSheetLayout,
  encodeStudentCode,
  MARKER_SIZE_MM,
  MAX_ITEMS,
  PAGE_HEIGHT_MM,
} from "@/lib/omr/layout";
import { itemSpecsFromKey, type AnswerKeyItem } from "@/lib/omr/score";

/** PostScript points per millimetre — jsPDF's internal unit. */
const PT_PER_MM = 72 / 25.4;

const key = (count: number, choiceCount = 4): AnswerKeyItem[] =>
  Array.from({ length: count }, (_, i) => ({
    itemNumber: i + 1,
    correctAnswer: "A",
    choiceCount,
    points: 1,
  }));

const params = (overrides: Partial<AnswerSheetParams> = {}): AnswerSheetParams => ({
  schoolName: "Bayugan Central Elementary School",
  examTitle: "Periodical Test in Science 5",
  subjectName: "Science",
  sectionName: "Rizal",
  schoolYear: "2026-2027",
  versionLabel: "Set A",
  answerKey: key(10),
  learners: [{ studentId: 42, name: "Cruz, Ben", lrn: "123456789012" }],
  ...overrides,
});

function pdfText(overrides: Partial<AnswerSheetParams> = {}): string {
  const doc = buildAnswerSheetDoc(params(overrides));
  return Buffer.from(doc.output("arraybuffer")).toString("latin1");
}

interface PdfRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Every `x y w h re` in the content stream, converted back from PDF points to
 * sheet millimetres. PDF measures y from the bottom of the page and jsPDF emits
 * a negative height, so both are undone here to land back in layout space.
 */
function rectsInMm(text: string): PdfRect[] {
  const pattern = /(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re/g;
  return [...text.matchAll(pattern)].map((match) => {
    const [x, yFromBottom, w, negativeH] = match
      .slice(1)
      .map((v) => Number(v) / PT_PER_MM);
    return { x, y: PAGE_HEIGHT_MM - yFromBottom, w, h: -negativeH };
  });
}

describe("buildAnswerSheetDoc", () => {
  it("prints the corner markers exactly where the layout puts them", () => {
    const rects = rectsInMm(pdfText());
    const layout = buildSheetLayout(itemSpecsFromKey(key(10)));

    for (const marker of layout.markers) {
      const match = rects.find(
        (rect) =>
          Math.abs(rect.x + rect.w / 2 - marker.x) < 0.01 &&
          Math.abs(rect.y + rect.h / 2 - marker.y) < 0.01,
      );
      expect(
        match,
        `no marker drawn centred on ${marker.x},${marker.y}mm`,
      ).toBeDefined();
      expect(match?.w).toBeCloseTo(MARKER_SIZE_MM, 3);
      expect(match?.h).toBeCloseTo(MARKER_SIZE_MM, 3);
    }
  });

  it("gives every learner their own page", () => {
    const text = pdfText({
      learners: [
        { studentId: 1, name: "Alpha, Ana" },
        { studentId: 2, name: "Beta, Ben" },
        { studentId: 3, name: "Gamma, Cely" },
      ],
    });
    const pages = text.match(/\/Type \/Page[^s]/g) ?? [];
    expect(pages).toHaveLength(3);
  });

  it("prints the learner's name and the encoded code on their sheet", () => {
    const text = pdfText();
    expect(text).toContain("CRUZ, BEN");
    // The ID block is machine-read, but the code is also printed for a human
    // to verify a sheet against — 42 padded to eight digits plus a check digit.
    expect(encodeStudentCode(42).join(" ")).toBe("0 0 0 0 0 0 4 2 6");
    expect(text).toContain("0 0 0 0 0 0 4 2 6");
  });

  it("prints an item number for every item in the key", () => {
    const text = pdfText({ answerKey: key(30) });
    for (const item of [1, 15, 25, 30]) {
      expect(text).toContain(`(${item}) Tj`);
    }
  });

  it("refuses to print a sheet it cannot lay out", () => {
    expect(() => buildAnswerSheetDoc(params({ learners: [] }))).toThrow(
      /No learners/i,
    );
    expect(() => buildAnswerSheetDoc(params({ answerKey: [] }))).toThrow(
      /no answer key/i,
    );
    expect(() =>
      buildAnswerSheetDoc(params({ answerKey: key(MAX_ITEMS + 1) })),
    ).toThrow(/at most/i);
  });

  it("refuses an id too long for the ID block rather than printing a wrong one", () => {
    expect(() =>
      buildAnswerSheetDoc(
        params({ learners: [{ studentId: 123456789, name: "Too, Long" }] }),
      ),
    ).toThrow(/cannot be printed/i);
  });

  it("names the file after the section and version", () => {
    expect(answerSheetFilename(params())).toBe("answer-sheets-Rizal-Set-A.pdf");
  });
});
