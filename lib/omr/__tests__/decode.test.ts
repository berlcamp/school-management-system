/**
 * Decoder tests. Every case renders a real sheet from the shared layout, abuses
 * it the way a scanner or a phone would, and asserts the answers come back.
 */

import { describe, expect, it } from "vitest";
import { decodeSheet, otsuThreshold, solveHomography, applyHomography } from "../decode";
import { buildSheetLayout, encodeStudentCode } from "../layout";
import {
  marksFromLetters,
  renderSheet,
  rotate180,
  warpImage,
  type SheetContent,
} from "./renderSheet";

const STUDENT_ID = 40217;
const ANSWERS = ["A", "C", "B", "D", "A", "B", "D", "C", "A", "B"];

function sheetFor(
  letters: (string | null)[] = ANSWERS,
  studentId = STUDENT_ID,
): { layout: ReturnType<typeof buildSheetLayout>; content: SheetContent } {
  const layout = buildSheetLayout(
    letters.map((_, i) => ({ itemNumber: i + 1, choiceCount: 4 })),
  );
  return {
    layout,
    content: {
      marks: marksFromLetters(letters),
      idDigits: encodeStudentCode(studentId),
    },
  };
}

function expectOk(result: ReturnType<typeof decodeSheet>) {
  if (!result.ok) throw new Error(`decode failed: ${result.reason}`);
  return result.sheet;
}

describe("decodeSheet — a clean scan", () => {
  it("reads back the learner id and every answer", () => {
    const { layout, content } = sheetFor();
    const sheet = expectOk(decodeSheet(renderSheet(layout, content), layout));

    expect(sheet.studentId).toBe(STUDENT_ID);
    expect(sheet.answers).toEqual(ANSWERS);
    expect(sheet.flags.rotated).toBe(false);
    expect(sheet.flags.idUnreadable).toBe(false);
    expect(sheet.flags.multiMarkItems).toEqual([]);
    expect(sheet.flags.blankItems).toEqual([]);
  });

  it("reads a sheet whose items have differing choice counts", () => {
    const layout = buildSheetLayout([
      { itemNumber: 1, choiceCount: 2 },
      { itemNumber: 2, choiceCount: 5 },
      { itemNumber: 3, choiceCount: 4 },
    ]);
    const content: SheetContent = {
      marks: [1, 4, 2],
      idDigits: encodeStudentCode(9),
    };
    const sheet = expectOk(decodeSheet(renderSheet(layout, content), layout));
    expect(sheet.answers).toEqual(["B", "E", "C"]);
  });

  it("reads a full 100-item sheet across all four columns", () => {
    const letters = Array.from(
      { length: 100 },
      (_, i) => ["A", "B", "C", "D"][i % 4],
    );
    const { layout, content } = sheetFor(letters, 77777);
    const sheet = expectOk(decodeSheet(renderSheet(layout, content), layout));
    expect(sheet.studentId).toBe(77777);
    expect(sheet.answers).toEqual(letters);
  });
});

describe("decodeSheet — sheets that are not ideal", () => {
  it("reads a sheet fed upside-down and says so", () => {
    const { layout, content } = sheetFor();
    const image = rotate180(renderSheet(layout, content));
    const sheet = expectOk(decodeSheet(image, layout));

    expect(sheet.answers).toEqual(ANSWERS);
    expect(sheet.studentId).toBe(STUDENT_ID);
    expect(sheet.flags.rotated).toBe(true);
  });

  it("reads a perspective-skewed photo", () => {
    const { layout, content } = sheetFor();
    const base = renderSheet(layout, content);
    // Corners pulled in unevenly: a page photographed from off to one side.
    const skewed = warpImage(base, base.width, base.height, [
      { x: 24, y: 12 },
      { x: base.width - 8, y: 40 },
      { x: base.width - 30, y: base.height - 14 },
      { x: 10, y: base.height - 46 },
    ]);
    const sheet = expectOk(decodeSheet(skewed, layout));

    expect(sheet.answers).toEqual(ANSWERS);
    expect(sheet.studentId).toBe(STUDENT_ID);
  });

  it("reads a faint pencil on a speckled scan", () => {
    const { layout, content } = sheetFor();
    const image = renderSheet(layout, content, {
      markGray: 130,
      noise: 40,
      seed: 7,
    });
    const sheet = expectOk(decodeSheet(image, layout));
    expect(sheet.answers).toEqual(ANSWERS);
  });

  it("reads a sheet scanned at a lower resolution", () => {
    const { layout, content } = sheetFor();
    const image = renderSheet(layout, content, { scale: 2.4 });
    const sheet = expectOk(decodeSheet(image, layout));
    expect(sheet.answers).toEqual(ANSWERS);
  });

  it("downscales an oversized scan instead of choking on it", () => {
    const { layout, content } = sheetFor();
    const image = renderSheet(layout, content, { scale: 10 });
    expect(image.width).toBeGreaterThan(2000);
    const sheet = expectOk(decodeSheet(image, layout));
    expect(sheet.answers).toEqual(ANSWERS);
  });
});

describe("decodeSheet — marks it will not guess at", () => {
  it("reports a blank item rather than picking one", () => {
    const letters: (string | null)[] = [...ANSWERS];
    letters[4] = null;
    const { layout, content } = sheetFor(letters);
    const sheet = expectOk(decodeSheet(renderSheet(layout, content), layout));

    expect(sheet.answers[4]).toBe("");
    expect(sheet.flags.blankItems).toEqual([5]);
  });

  it("reports a double-marked item as unresolved", () => {
    const { layout, content } = sheetFor();
    content.marks[2] = [0, 2];
    const sheet = expectOk(decodeSheet(renderSheet(layout, content), layout));

    expect(sheet.answers[2]).toBe("?");
    expect(sheet.flags.multiMarkItems).toEqual([3]);
  });

  it("flags an unreadable ID block but still returns the answers", () => {
    const { layout, content } = sheetFor();
    content.idDigits = [...content.idDigits];
    content.idDigits[1] = (content.idDigits[1] + 1) % 10; // breaks the check digit
    const sheet = expectOk(decodeSheet(renderSheet(layout, content), layout));

    expect(sheet.studentId).toBeNull();
    expect(sheet.flags.idUnreadable).toBe(true);
    expect(sheet.answers).toEqual(ANSWERS);
  });

  it("fails cleanly when the corner markers are cropped off", () => {
    const { layout, content } = sheetFor();
    const base = renderSheet(layout, content);
    // Blank the top strip, taking both upper markers with it.
    base.data.fill(255, 0, base.width * Math.round(base.height * 0.08));

    const result = decodeSheet(base, layout);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/corner markers/i);
  });

  it("fails cleanly on a page that is not an answer sheet", () => {
    const layout = buildSheetLayout([{ itemNumber: 1, choiceCount: 4 }]);
    const blank = {
      width: 400,
      height: 560,
      data: new Uint8Array(400 * 560).fill(255),
    };
    expect(decodeSheet(blank, layout).ok).toBe(false);
  });
});

describe("image maths", () => {
  it("splits a bimodal image between its two peaks", () => {
    const data = new Uint8Array(1000);
    data.fill(20, 0, 400);
    data.fill(230, 400);
    // The threshold is inclusive on the ink side, so landing on the dark peak
    // itself is correct: everything at or below it binarises as ink.
    const threshold = otsuThreshold({ width: 100, height: 10, data });
    expect(threshold).toBeGreaterThanOrEqual(20);
    expect(threshold).toBeLessThan(230);
  });

  it("maps the source corners exactly onto the destination corners", () => {
    const src = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ];
    const dst = [
      { x: 5, y: 4 },
      { x: 95, y: 12 },
      { x: 90, y: 190 },
      { x: 2, y: 176 },
    ];
    const h = solveHomography(src, dst);
    expect(h).not.toBeNull();
    src.forEach((p, i) => {
      const mapped = applyHomography(h as number[], p);
      expect(mapped.x).toBeCloseTo(dst[i].x, 6);
      expect(mapped.y).toBeCloseTo(dst[i].y, 6);
    });
  });

  it("returns null for degenerate correspondences", () => {
    const collapsed = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    expect(solveHomography(collapsed, collapsed)).toBeNull();
  });
});
