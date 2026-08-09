/**
 * Test-only synthetic answer sheet renderer.
 *
 * Draws a sheet from the SAME layout the real generator and decoder use, then
 * optionally abuses it the way a real scan would: rotated on the glass, skewed
 * by a hand-held phone, faint pencil, scanner speckle. That is what makes the
 * decoder tests meaningful — they exercise the actual geometry rather than a
 * hand-written fixture that could drift away from it.
 *
 * Not a .test.ts file, so vitest treats it as a helper, not a suite.
 */

import type { GrayImage } from "../decode";
import { solveHomography } from "../decode";
import type { Point, SheetLayout } from "../layout";

export interface RenderOptions {
  /** Pixels per sheet millimetre. */
  scale?: number;
  /** Ink level for learner marks: 0 = firm pen, ~150 = faint pencil. */
  markGray?: number;
  /** Peak amplitude of uniform noise added to every pixel. */
  noise?: number;
  /** Deterministic seed for that noise. */
  seed?: number;
}

export interface SheetContent {
  /**
   * One entry per layout row: the 0-based choice index marked, null for a
   * blank, or an array to mark several bubbles (a multi-mark).
   */
  marks: (number | null | number[])[];
  /** Digits shaded in the ID block; length must match layout.idColumns. */
  idDigits: number[];
}

const WHITE = 255;
const BLACK = 0;

function createCanvas(width: number, height: number): GrayImage {
  const data = new Uint8Array(width * height);
  data.fill(WHITE);
  return { width, height, data };
}

function fillRect(
  img: GrayImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  value: number,
): void {
  for (let y = Math.max(0, Math.round(y0)); y < Math.min(img.height, Math.round(y1)); y += 1) {
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(img.width, Math.round(x1)); x += 1) {
      img.data[y * img.width + x] = value;
    }
  }
}

function fillCircle(
  img: GrayImage,
  cx: number,
  cy: number,
  radius: number,
  value: number,
): void {
  const r2 = radius * radius;
  for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(img.height - 1, Math.ceil(cy + radius)); y += 1) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(img.width - 1, Math.ceil(cx + radius)); x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) img.data[y * img.width + x] = value;
    }
  }
}

function strokeCircle(
  img: GrayImage,
  cx: number,
  cy: number,
  radius: number,
  thickness: number,
): void {
  const outer = (radius + thickness / 2) ** 2;
  const inner = Math.max(0, radius - thickness / 2) ** 2;
  for (let y = Math.max(0, Math.floor(cy - radius - thickness)); y <= Math.min(img.height - 1, Math.ceil(cy + radius + thickness)); y += 1) {
    for (let x = Math.max(0, Math.floor(cx - radius - thickness)); x <= Math.min(img.width - 1, Math.ceil(cx + radius + thickness)); x += 1) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 <= outer && d2 >= inner) img.data[y * img.width + x] = BLACK;
    }
  }
}

/** Render the sheet upright, in sheet space, at `scale` px/mm. */
export function renderSheet(
  layout: SheetLayout,
  content: SheetContent,
  options: RenderOptions = {},
): GrayImage {
  const scale = options.scale ?? 4;
  const markGray = options.markGray ?? BLACK;
  const img = createCanvas(
    Math.round(layout.pageWidthMm * scale),
    Math.round(layout.pageHeightMm * scale),
  );
  const mm = (v: number) => v * scale;

  // Corner markers.
  const half = layout.markerSizeMm / 2;
  for (const marker of layout.markers) {
    fillRect(
      img,
      mm(marker.x - half),
      mm(marker.y - half),
      mm(marker.x + half),
      mm(marker.y + half),
      BLACK,
    );
  }

  // Orientation mark.
  fillCircle(
    img,
    mm(layout.orientationDot.x),
    mm(layout.orientationDot.y),
    mm(layout.orientationDot.d / 2),
    BLACK,
  );

  // ID block: every bubble outlined, the encoded digit shaded solid (the
  // printer pre-shades these — the learner never touches them).
  layout.idColumns.forEach((column, columnIndex) => {
    column.forEach((bubble, digit) => {
      strokeCircle(img, mm(bubble.x), mm(bubble.y), mm(bubble.d / 2), Math.max(1, mm(0.3)));
      if (content.idDigits[columnIndex] === digit) {
        fillCircle(img, mm(bubble.x), mm(bubble.y), mm(bubble.d / 2) * 0.8, BLACK);
      }
    });
  });

  // Answer grid.
  layout.rows.forEach((row, rowIndex) => {
    const mark = content.marks[rowIndex];
    const marked =
      mark === null || mark === undefined
        ? []
        : Array.isArray(mark)
          ? mark
          : [mark];

    row.bubbles.forEach((bubble, choice) => {
      strokeCircle(img, mm(bubble.x), mm(bubble.y), mm(bubble.d / 2), Math.max(1, mm(0.3)));
      if (marked.includes(choice)) {
        fillCircle(img, mm(bubble.x), mm(bubble.y), mm(bubble.d / 2) * 0.8, markGray);
      }
    });
  });

  if (options.noise) addNoise(img, options.noise, options.seed ?? 1);
  return img;
}

/**
 * Resample an image through a projective transform: the source image's four
 * corners land on `dstCorners`. Used to fake a rotated or perspective-skewed
 * scan without needing a real camera.
 */
export function warpImage(
  src: GrayImage,
  dstWidth: number,
  dstHeight: number,
  dstCorners: [Point, Point, Point, Point],
): GrayImage {
  const srcCorners: Point[] = [
    { x: 0, y: 0 },
    { x: src.width - 1, y: 0 },
    { x: src.width - 1, y: src.height - 1 },
    { x: 0, y: src.height - 1 },
  ];
  // Solve destination -> source so every output pixel pulls a source sample.
  const h = solveHomography(dstCorners, srcCorners);
  if (!h) throw new Error("Degenerate warp corners");

  const out = createCanvas(dstWidth, dstHeight);
  for (let y = 0; y < dstHeight; y += 1) {
    for (let x = 0; x < dstWidth; x += 1) {
      const denominator = h[6] * x + h[7] * y + 1;
      const sx = Math.round((h[0] * x + h[1] * y + h[2]) / denominator);
      const sy = Math.round((h[3] * x + h[4] * y + h[5]) / denominator);
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
      out.data[y * dstWidth + x] = src.data[sy * src.width + sx];
    }
  }
  return out;
}

/** Turn an upright render upside-down, as a sheet fed the wrong way round. */
export function rotate180(src: GrayImage): GrayImage {
  return warpImage(src, src.width, src.height, [
    { x: src.width - 1, y: src.height - 1 },
    { x: 0, y: src.height - 1 },
    { x: 0, y: 0 },
    { x: src.width - 1, y: 0 },
  ]);
}

/** Deterministic uniform noise, so a failing test fails the same way twice. */
function addNoise(img: GrayImage, amplitude: number, seed: number): void {
  let state = seed >>> 0;
  for (let i = 0; i < img.data.length; i += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const delta = ((state >>> 16) / 65535 - 0.5) * 2 * amplitude;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + delta));
  }
}

/** Convenience: a sheet where item i is answered with choice `pick(i)`. */
export function marksFromLetters(
  letters: (string | null)[],
): (number | null)[] {
  return letters.map((letter) =>
    letter === null || letter === "" ? null : letter.toUpperCase().charCodeAt(0) - 65,
  );
}
