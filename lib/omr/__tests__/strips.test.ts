/**
 * Half and quarter strips: layout invariants, and every way a teacher can hand
 * a strip to the scanner — cut and photographed, cut and laid on a flatbed in a
 * corner of an A4 scan, several strips on the glass, or the page left uncut.
 */

import { describe, expect, it } from "vitest";
import {
  applyHomography,
  decodeSheet,
  decodeSheets,
  solveHomography,
  type GrayImage,
} from "../decode";
import {
  buildSheetLayout,
  encodeStudentCode,
  formatsForItemCount,
  MAX_ITEMS_BY_FORMAT,
  SHEETS_PER_PAGE,
  type BubbleSpec,
  type SheetFormat,
  type SheetLayout,
} from "../layout";
import { marksFromLetters, renderSheet, rotate180, warpImage } from "./renderSheet";

const STRIPS: ("half" | "quarter")[] = ["half", "quarter"];
const SCALE = 4; // px per mm

const items = (count: number, choiceCount = 4) =>
  Array.from({ length: count }, (_, i) => ({ itemNumber: i + 1, choiceCount }));

const lettersFor = (count: number, seed: number) =>
  Array.from({ length: count }, (_, i) => ["A", "B", "C", "D"][(i * 7 + seed) % 4]);

function render(layout: SheetLayout, studentId: number, letters: string[]) {
  return renderSheet(
    layout,
    { marks: marksFromLetters(letters), idDigits: encodeStudentCode(studentId) },
    { scale: SCALE },
  );
}

/** Copy `src` into a white canvas of `width` × `height` at (x, y). */
function blit(
  canvas: GrayImage | null,
  width: number,
  height: number,
  src: GrayImage,
  x: number,
  y: number,
): GrayImage {
  const out = canvas ?? { width, height, data: new Uint8Array(width * height).fill(255) };
  for (let row = 0; row < src.height; row += 1) {
    for (let col = 0; col < src.width; col += 1) {
      const tx = x + col;
      const ty = y + row;
      if (tx < 0 || ty < 0 || tx >= out.width || ty >= out.height) continue;
      out.data[ty * out.width + tx] = src.data[row * src.width + col];
    }
  }
  return out;
}

const A4 = { w: Math.round(210 * SCALE), h: Math.round(297 * SCALE) };

function allBubbles(layout: SheetLayout): BubbleSpec[] {
  return [...layout.rows.flatMap((r) => r.bubbles), ...layout.idColumns.flat()];
}

describe("strip layouts", () => {
  it.each(STRIPS)("%s: every mark sits inside the strip with room for a crooked cut", (format) => {
    const layout = buildSheetLayout(items(MAX_ITEMS_BY_FORMAT[format], 5), format);
    const edge = 4; // mm a scissor cut may wander
    for (const b of [...allBubbles(layout), layout.orientationDot]) {
      expect(b.x - b.d / 2).toBeGreaterThan(edge);
      expect(b.x + b.d / 2).toBeLessThan(layout.pageWidthMm - edge);
      expect(b.y - b.d / 2).toBeGreaterThan(edge);
      expect(b.y + b.d / 2).toBeLessThan(layout.pageHeightMm - edge);
    }
    for (const m of layout.markers) {
      expect(m.x - layout.markerSizeMm / 2).toBeGreaterThan(edge);
      expect(m.x + layout.markerSizeMm / 2).toBeLessThan(layout.pageWidthMm - edge);
    }
  });

  it.each(STRIPS)("%s: no two bubbles overlap and none touches a marker", (format) => {
    const layout = buildSheetLayout(items(MAX_ITEMS_BY_FORMAT[format], 5), format);
    const bubbles = [...allBubbles(layout), layout.orientationDot];
    for (let i = 0; i < bubbles.length; i += 1) {
      for (let j = i + 1; j < bubbles.length; j += 1) {
        const a = bubbles[i];
        const b = bubbles[j];
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan((a.d + b.d) / 2);
      }
      for (const m of layout.markers) {
        const clearance =
          Math.max(
            Math.abs(bubbles[i].x - m.x) - layout.markerSizeMm / 2,
            Math.abs(bubbles[i].y - m.y) - layout.markerSizeMm / 2,
          ) - bubbles[i].d / 2;
        expect(clearance).toBeGreaterThan(0);
      }
    }
  });

  it.each(STRIPS)(
    "%s: the orientation dot lands on nothing printed under a wrong rotation",
    (format) => {
      const layout = buildSheetLayout(items(MAX_ITEMS_BY_FORMAT[format], 5), format);
      const rotations = [
        [1, 2, 3, 0],
        [2, 3, 0, 1],
        [3, 0, 1, 2],
      ];
      for (const rotation of rotations) {
        // Where the decoder samples, in true sheet coordinates, when it
        // assumes the sheet is turned by this rotation.
        const h = solveHomography(
          [...layout.markers],
          rotation.map((i) => layout.markers[i]),
        );
        expect(h).not.toBeNull();
        const p = applyHomography(h as number[], layout.orientationDot);
        for (const b of allBubbles(layout)) {
          expect(Math.hypot(p.x - b.x, p.y - b.y)).toBeGreaterThan(
            (b.d + layout.orientationDot.d) / 2,
          );
        }
      }
    },
  );

  it("offers only the formats an exam fits", () => {
    expect(formatsForItemCount(20)).toEqual(["full", "half", "quarter"]);
    expect(formatsForItemCount(40)).toEqual(["full", "half"]);
    expect(formatsForItemCount(80)).toEqual(["full"]);
    expect(MAX_ITEMS_BY_FORMAT).toEqual({ full: 100, half: 50, quarter: 25 });
    expect(SHEETS_PER_PAGE).toEqual({ full: 1, half: 2, quarter: 4 });
  });

  it("refuses more items than the strip holds", () => {
    expect(() => buildSheetLayout(items(26), "quarter")).toThrow(/at most 25/);
    expect(() => buildSheetLayout(items(51), "half")).toThrow(/at most 50/);
  });

  it("leaves the full sheet's geometry exactly as it was", () => {
    const layout = buildSheetLayout(items(30));
    expect(layout.format).toBe("full");
    expect(layout.markers[0]).toEqual({ x: 13.5, y: 13.5 });
    expect(layout.orientationDot).toEqual({ x: 13.5, y: 26, d: 5 });
    expect(layout.rows[0].bubbles[0]).toEqual({ x: 14, y: 92, d: 4 });
    expect(layout.idColumns[0][0]).toEqual({ x: 138, y: 30, d: 3.2 });
  });
});

describe("decoding a cut strip", () => {
  it.each(STRIPS)("%s: photographed on its own", (format) => {
    const count = MAX_ITEMS_BY_FORMAT[format];
    const layout = buildSheetLayout(items(count), format);
    const letters = lettersFor(count, 1);
    const result = decodeSheet(render(layout, 52031, letters), layout);
    if (!result.ok) throw new Error(result.reason);
    expect(result.sheet.studentId).toBe(52031);
    expect(result.sheet.answers).toEqual(letters);
  });

  it.each(STRIPS)("%s: upside down", (format) => {
    const layout = buildSheetLayout(items(20), format);
    const letters = lettersFor(20, 2);
    const result = decodeSheet(rotate180(render(layout, 811, letters)), layout);
    if (!result.ok) throw new Error(result.reason);
    expect(result.sheet.flags.rotated).toBe(true);
    expect(result.sheet.answers).toEqual(letters);
  });

  it.each(STRIPS)("%s: hand-held phone photo, at an angle, on a bigger frame", (format) => {
    const layout = buildSheetLayout(items(20), format);
    const letters = lettersFor(20, 3);
    const strip = render(layout, 4410, letters);
    const frameW = Math.round(strip.width * 1.5);
    const frameH = Math.round(strip.height * 1.15);
    const photo = warpImage(strip, frameW, frameH, [
      { x: frameW * 0.2, y: frameH * 0.05 },
      { x: frameW * 0.82, y: frameH * 0.08 },
      { x: frameW * 0.86, y: frameH * 0.95 },
      { x: frameW * 0.16, y: frameH * 0.92 },
    ]);
    const result = decodeSheets(photo, [
      buildSheetLayout(items(20), "full"),
      buildSheetLayout(items(20), "half"),
      buildSheetLayout(items(20), "quarter"),
    ]);
    if (!result.ok) throw new Error(result.reason);
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].format).toBe(format);
    expect(result.sheets[0].studentId).toBe(4410);
    expect(result.sheets[0].answers).toEqual(letters);
  });

  it.each(STRIPS)("%s: laid in a corner of an A4 flatbed scan", (format) => {
    const layout = buildSheetLayout(items(20), format);
    const letters = lettersFor(20, 4);
    const strip = render(layout, 9001, letters);
    const scan = blit(null, A4.w, A4.h, strip, 0, 0);
    // The corner search alone cannot see it; the whole-image search must.
    const single = decodeSheet(scan, layout);
    if (!single.ok) throw new Error(single.reason);
    expect(single.sheet.studentId).toBe(9001);
    expect(single.sheet.answers).toEqual(letters);
  });
});

describe("several strips in one image", () => {
  const formatsFor = (count: number) =>
    formatsForItemCount(count).map((f) => buildSheetLayout(items(count), f));

  it.each(STRIPS)("%s: an uncut page reads as one sheet per strip", (format) => {
    const layout = buildSheetLayout(items(20), format);
    const perPage = SHEETS_PER_PAGE[format];
    const stripPx = Math.round(layout.pageWidthMm * SCALE);
    let page: GrayImage | null = null;
    const ids: number[] = [];
    const answers: string[][] = [];
    for (let i = 0; i < perPage; i += 1) {
      const letters = lettersFor(20, i);
      const id = 1000 + i;
      ids.push(id);
      answers.push(letters);
      page = blit(page, A4.w, A4.h, render(layout, id, letters), i * stripPx, 0);
    }

    const result = decodeSheets(page as GrayImage, formatsFor(20));
    if (!result.ok) throw new Error(result.reason);
    expect(result.sheets.map((s) => s.format)).toEqual(
      Array<SheetFormat>(perPage).fill(format),
    );
    expect(result.sheets.map((s) => s.studentId)).toEqual(ids);
    expect(result.sheets.map((s) => s.answers)).toEqual(answers);
  });

  it("cut strips spaced out on the glass", () => {
    const layout = buildSheetLayout(items(20), "quarter");
    let scan: GrayImage | null = null;
    const offsets = [10, 300, 560];
    offsets.forEach((x, i) => {
      // Not quite level with each other, as strips laid by hand never are.
      scan = blit(scan, A4.w + 40, A4.h + 80, render(layout, 70 + i, lettersFor(20, i)), x, 10 + i * 25);
    });
    const result = decodeSheets(scan as unknown as GrayImage, formatsFor(20));
    if (!result.ok) throw new Error(result.reason);
    expect(result.sheets.map((s) => s.studentId)).toEqual([70, 71, 72]);
  });

  it("a full A4 sheet is still read as one full sheet", () => {
    const layout = buildSheetLayout(items(20), "full");
    const letters = lettersFor(20, 5);
    const result = decodeSheets(render(layout, 123, letters), formatsFor(20));
    if (!result.ok) throw new Error(result.reason);
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].format).toBe("full");
    expect(result.sheets[0].answers).toEqual(letters);
  });
});
