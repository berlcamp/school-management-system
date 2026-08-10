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
import { jsPDF } from "jspdf";

/** PostScript points per millimetre — jsPDF's internal unit. */
const PT_PER_MM = 72 / 25.4;

/**
 * Left edge of the learner-code block, allowing for its digit rail. Header text
 * that reaches this column prints on top of the ID bubbles.
 */
const ID_BLOCK_LEFT_MM = 134;
/** The rule under the header; everything below it belongs to the answer grid. */
const HEADER_RULE_MM = 83;

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

interface TextRun {
  /** Left edge of the run, in sheet millimetres. */
  x: number;
  /** Baseline, in millimetres from the top of the page. */
  y: number;
  sizePt: number;
  /** PDF base font name, e.g. `Helvetica-Bold` — needed to measure the run. */
  font: string;
  text: string;
}

/** `F1` → `Helvetica`, read off the document's own font objects. */
function fontMap(pdf: string): Map<string, string> {
  const baseFonts = new Map<string, string>();
  for (const object of pdf.matchAll(/(\d+) 0 obj\s*<<([\s\S]*?)>>/g)) {
    const base = /\/BaseFont \/([\w-]+)/.exec(object[2]);
    if (base) baseFonts.set(object[1], base[1]);
  }

  const map = new Map<string, string>();
  for (const ref of pdf.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
    const base = baseFonts.get(ref[2]);
    if (base) map.set(ref[1], base);
  }
  return map;
}

/**
 * Every string drawn by the document, with where it was drawn, converted back
 * into layout millimetres. jsPDF emits one `Td` per text block and a `T*` per
 * wrapped line after it, so the leading has to be tracked to know where a
 * wrapped line actually landed.
 */
function textRuns(pdf: string): TextRun[] {
  const token =
    /\/(F\d+) ([\d.]+) Tf|([\d.]+) TL|(-?[\d.]+) (-?[\d.]+) Td|(T\*)|\(((?:\\.|[^\\()])*)\) Tj/g;
  const fonts = fontMap(pdf);
  const runs: TextRun[] = [];
  let sizePt = 10;
  let font = "Helvetica";
  let leadingPt = 0;
  let x = 0;
  let yFromBottom = 0;

  for (const match of pdf.matchAll(token)) {
    const [, fontId, size, leading, tdX, tdY, star, text] = match;
    if (size) {
      sizePt = Number(size);
      font = fonts.get(fontId) ?? "Helvetica";
    } else if (leading) leadingPt = Number(leading);
    else if (tdX) {
      x = Number(tdX);
      yFromBottom = Number(tdY);
    } else if (star) yFromBottom -= leadingPt;
    else if (text !== undefined) {
      runs.push({
        x: x / PT_PER_MM,
        y: PAGE_HEIGHT_MM - yFromBottom / PT_PER_MM,
        sizePt,
        font,
        text: unescapePdfString(text),
      });
    }
  }
  return runs;
}

function unescapePdfString(raw: string): string {
  return raw.replace(/\\(\d{3}|.)/g, (_, escaped: string) =>
    /^\d{3}$/.test(escaped)
      ? String.fromCharCode(parseInt(escaped, 8))
      : escaped,
  );
}

/** Width of a run in millimetres, measured in the face it was drawn with. */
function runWidthMm(run: TextRun): number {
  const [family, style] = run.font.split("-");
  const ruler = new jsPDF({ unit: "mm", format: "a4" });
  ruler.setFont(family.toLowerCase(), (style ?? "normal").toLowerCase());
  ruler.setFontSize(run.sizePt);
  return ruler.getTextWidth(run.text);
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

  /**
   * The header is made of free text a teacher types — an exam title is
   * routinely a whole sentence. Both of these have gone wrong on real data: a
   * title long enough to wrap printed straight through the subject line, and
   * the directions ran the full width of the page across the ID bubbles.
   */
  describe("header text", () => {
    const wordy = params({
      schoolName:
        "Bayugan City National Comprehensive High School — Annex Campus",
      examTitle:
        "Table of Specification for the First Term Examination in Mathematics 1 1",
      subjectName: "Mathematics 1",
      sectionName: "Lettuce",
      dateAdministered: "2026-08-10",
      learners: [
        {
          studentId: 40447,
          name: "Dela Cruz-Villanueva, Maria Kristina Bernadette",
          lrn: "222222222223",
        },
      ],
    });

    const headerRuns = (p: AnswerSheetParams) =>
      textRuns(
        Buffer.from(buildAnswerSheetDoc(p).output("arraybuffer")).toString(
          "latin1",
        ),
      ).filter((run) => run.y < HEADER_RULE_MM && run.x < ID_BLOCK_LEFT_MM);

    it("keeps every line clear of the learner-code block", () => {
      for (const run of headerRuns(wordy)) {
        expect(
          run.x + runWidthMm(run),
          `"${run.text}" reaches the ID block`,
        ).toBeLessThan(ID_BLOCK_LEFT_MM);
      }
    });

    it("never prints one line on top of another", () => {
      const baselines = headerRuns(wordy)
        .map((run) => run.y)
        .sort((a, b) => a - b);
      for (let i = 1; i < baselines.length; i += 1) {
        expect(
          baselines[i] - baselines[i - 1],
          `two header lines share a baseline near ${baselines[i]}mm`,
        ).toBeGreaterThan(2.5);
      }
    });

    it("keeps the header out of the answer grid", () => {
      const lowest = Math.max(...headerRuns(wordy).map((run) => run.y));
      expect(lowest).toBeLessThan(HEADER_RULE_MM - 2);
    });
  });

  it("names the file after the section and version", () => {
    expect(answerSheetFilename(params())).toBe("answer-sheets-Rizal-Set-A.pdf");
  });
});
