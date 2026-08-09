/**
 * OMR decoder — read a scanned/photographed answer sheet back into answers.
 *
 * Deliberately dependency-free and DOM-free: the input is a plain grayscale
 * buffer, so the same code runs in the browser (fed from a canvas) and in the
 * unit tests (fed from a synthetic sheet). No OpenCV, no WASM, no worker.
 *
 * The pipeline, in order:
 *
 *   1. Otsu threshold          — pick the ink/paper split from the image itself,
 *                                so a grey phone photo and a crisp flatbed scan
 *                                binarise to the same thing.
 *   2. Corner marker search    — the largest square-ish blob in each corner
 *                                quadrant, by connected components.
 *   3. Homography              — the four marker centres pin sheet millimetres
 *                                to image pixels. This is what absorbs scale,
 *                                translation, a crooked feed and the mild
 *                                perspective of a hand-held photo, and it is
 *                                why the sheet does not need to be scanned at
 *                                any particular DPI.
 *   4. Orientation             — try all four corner assignments, keep the one
 *                                where the asymmetric orientation dot is dark.
 *                                An upside-down sheet decodes correctly instead
 *                                of producing a page of garbage answers.
 *   5. Bubble sampling         — sample the inner disc of each bubble (never the
 *                                printed ring) and take the dark fraction.
 *
 * The reading of a row is RELATIVE, not a fixed cutoff: a faint pencil on a
 * washed-out photo still wins against its neighbours, and two marks of similar
 * weight are reported as a multi-mark rather than resolved by a coin flip.
 * Everything the decoder is unsure about is flagged and surfaced to the teacher
 * for confirmation — the module never invents an answer to avoid asking.
 */

import {
  choiceLetter,
  decodeStudentCode,
  type BubbleSpec,
  type Point,
  type SheetLayout,
} from "./layout";

export interface GrayImage {
  width: number;
  height: number;
  /** One byte per pixel, 0 = black … 255 = white. */
  data: Uint8Array;
}

/** Structural shape of a canvas ImageData; typed here so tests need no DOM. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export const MULTI_MARK = "?";
export const BLANK = "";

/** Below this dark fraction, the strongest bubble in a row is still no mark. */
const MIN_FILL = 0.3;
/** A runner-up this close to the winner means the learner marked two. */
const AMBIGUITY_RATIO = 0.75;
/** A winner below this is accepted but flagged for the teacher to eyeball. */
const LOW_CONFIDENCE_FILL = 0.45;
/** Fraction of the bubble diameter sampled, keeping clear of the printed ring. */
const SAMPLE_RADIUS_FRACTION = 0.35;
/** Corner quadrant searched for each marker, as a fraction of the image. */
const CORNER_REGION = 0.35;

export interface DecodeFlags {
  /** True when the sheet had to be turned to be read. */
  rotated: boolean;
  /** ID block was blank, multi-marked or failed its check digit. */
  idUnreadable: boolean;
  /** Item numbers where two or more bubbles were marked. */
  multiMarkItems: number[];
  /** Item numbers left blank. */
  blankItems: number[];
  /** Item numbers read faintly — probably right, worth a look. */
  lowConfidenceItems: number[];
}

export interface DecodedSheet {
  /** Learner id read from the pre-printed ID block; null when unreadable. */
  studentId: number | null;
  /** One response per layout row, in item order. "" blank, "?" multi-mark. */
  answers: string[];
  /** Raw dark fractions per item per choice — shown in the review UI. */
  fills: number[][];
  flags: DecodeFlags;
}

export type DecodeResult =
  | { ok: true; sheet: DecodedSheet }
  | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

/** Flatten RGBA (a canvas ImageData) to luminance. */
export function toGrayImage(image: RgbaImage): GrayImage {
  const { width, height, data } = image;
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < out.length; i += 4, p += 1) {
    // Rec. 601 luma — closer to perceived darkness than a flat mean, which
    // matters for coloured pens and the blue-ish cast of phone photos.
    out[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }
  return { width, height, data: out };
}

/**
 * Box-average down to a bounded size. Scans arrive at anything from 150 to 600
 * DPI; past roughly 1600px across, the extra pixels buy no accuracy (a 4mm
 * bubble is already 30px) and cost real time in the flood fill. Averaging
 * rather than sampling also suppresses the speckle of a cheap scanner.
 */
export function downscaleGray(gray: GrayImage, maxDim = 1600): GrayImage {
  const factor = Math.max(gray.width, gray.height) / maxDim;
  if (factor <= 1) return gray;

  const width = Math.max(1, Math.round(gray.width / factor));
  const height = Math.max(1, Math.round(gray.height / factor));
  const out = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const sy0 = Math.floor((y * gray.height) / height);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * gray.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sx0 = Math.floor((x * gray.width) / width);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * gray.width) / width));
      let sum = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy += 1) {
        for (let sx = sx0; sx < sx1; sx += 1) {
          sum += gray.data[sy * gray.width + sx];
          n += 1;
        }
      }
      out[y * width + x] = sum / n;
    }
  }
  return { width, height, data: out };
}

/** Otsu's method: the threshold maximising between-class variance. */
export function otsuThreshold(gray: GrayImage): number {
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.data.length; i += 1) histogram[gray.data[i]] += 1;

  const total = gray.data.length;
  let sum = 0;
  for (let t = 0; t < 256; t += 1) sum += t * histogram[t];

  let sumBackground = 0;
  let weightBackground = 0;
  let best = 0;
  let bestVariance = -1;

  for (let t = 0; t < 256; t += 1) {
    weightBackground += histogram[t];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += t * histogram[t];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance =
      weightBackground *
      weightForeground *
      (meanBackground - meanForeground) ** 2;

    if (variance > bestVariance) {
      bestVariance = variance;
      best = t;
    }
  }
  return best;
}

/** 1 where the pixel is ink (at or below the threshold), 0 where it is paper. */
function binarize(gray: GrayImage, threshold: number): Uint8Array {
  const out = new Uint8Array(gray.width * gray.height);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = gray.data[i] <= threshold ? 1 : 0;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Corner markers
// ---------------------------------------------------------------------------

interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Largest square-ish solid blob inside a region, by iterative flood fill.
 *
 * The shape tests are what keep it from locking onto a block of header text or
 * the edge shadow of a scanned page: a marker is near-square, solidly filled,
 * and a plausible fraction of the page across.
 */
interface MarkerCandidate extends Point {
  area: number;
}

function findMarkerCentre(
  bin: Uint8Array,
  width: number,
  region: Region,
  minSide: number,
  maxSide: number,
): MarkerCandidate | null {
  const seen = new Uint8Array((region.x1 - region.x0) * (region.y1 - region.y0));
  const regionWidth = region.x1 - region.x0;
  let best: { area: number; cx: number; cy: number } | null = null;
  const stack: number[] = [];

  for (let y = region.y0; y < region.y1; y += 1) {
    for (let x = region.x0; x < region.x1; x += 1) {
      const localIndex = (y - region.y0) * regionWidth + (x - region.x0);
      if (seen[localIndex] || !bin[y * width + x]) continue;

      let area = 0;
      let sumX = 0;
      let sumY = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      seen[localIndex] = 1;
      stack.push(x, y);
      while (stack.length > 0) {
        const py = stack.pop() as number;
        const px = stack.pop() as number;
        area += 1;
        sumX += px;
        sumY += py;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;

        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = px + dx;
            const ny = py + dy;
            if (
              nx < region.x0 ||
              nx >= region.x1 ||
              ny < region.y0 ||
              ny >= region.y1
            ) {
              continue;
            }
            const nIndex = (ny - region.y0) * regionWidth + (nx - region.x0);
            if (seen[nIndex] || !bin[ny * width + nx]) continue;
            seen[nIndex] = 1;
            stack.push(nx, ny);
          }
        }
      }

      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const aspect = boxWidth / boxHeight;
      const solidity = area / (boxWidth * boxHeight);
      const sideOk =
        boxWidth >= minSide &&
        boxWidth <= maxSide &&
        boxHeight >= minSide &&
        boxHeight <= maxSide;

      if (!sideOk || aspect < 0.6 || aspect > 1.67 || solidity < 0.55) continue;
      if (!best || area > best.area) {
        best = { area, cx: sumX / area, cy: sumY / area };
      }
    }
  }

  return best ? { x: best.cx, y: best.cy, area: best.area } : null;
}

/**
 * Sanity-check the quad the four candidates form against the rectangle the
 * markers actually make on the sheet.
 *
 * Without this, a page whose markers are cropped off happily locks onto
 * whatever else is dark near the corners — an ID bubble, the orientation dot —
 * and returns a full page of confident nonsense. Every check below is a shape
 * that a real marker quad cannot have, however the page was scanned:
 *
 *   - the four blobs are the same printed square, so their areas must be
 *     comparable; a bubble or a dot is an order of magnitude off;
 *   - opposite sides are parallel on paper, so perspective may shorten them but
 *     cannot halve one against the other;
 *   - the quad's proportions are fixed by the sheet.
 */
function isPlausibleMarkerQuad(
  quad: MarkerCandidate[],
  layout: SheetLayout,
): boolean {
  const areas = quad.map((c) => c.area);
  if (Math.max(...areas) > Math.min(...areas) * 3) return false;

  const [tl, tr, br, bl] = quad;
  const topWidth = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const bottomWidth = Math.hypot(br.x - bl.x, br.y - bl.y);
  const leftHeight = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const rightHeight = Math.hypot(br.x - tr.x, br.y - tr.y);

  const balanced = (a: number, b: number) =>
    Math.min(a, b) > 0 && Math.max(a, b) / Math.min(a, b) <= 1.3;
  if (!balanced(topWidth, bottomWidth)) return false;
  if (!balanced(leftHeight, rightHeight)) return false;

  const expectedAspect =
    (layout.markers[1].x - layout.markers[0].x) /
    (layout.markers[3].y - layout.markers[0].y);
  const aspect =
    (topWidth + bottomWidth) / 2 / ((leftHeight + rightHeight) / 2);
  return aspect > expectedAspect * 0.7 && aspect < expectedAspect * 1.4;
}

/** Find all four corner markers and label them TL, TR, BR, BL by position. */
function findMarkers(
  bin: Uint8Array,
  width: number,
  height: number,
  layout: SheetLayout,
): [Point, Point, Point, Point] | null {
  const regionWidth = Math.floor(width * CORNER_REGION);
  const regionHeight = Math.floor(height * CORNER_REGION);
  // The marker is a known fraction of the page; allow a wide band around it so
  // a sheet that does not fill the scan is still accepted.
  const expected = (layout.markerSizeMm / layout.pageWidthMm) * width;
  const minSide = Math.max(3, expected * 0.35);
  const maxSide = expected * 3;

  const regions: Region[] = [
    { x0: 0, y0: 0, x1: regionWidth, y1: regionHeight },
    { x0: width - regionWidth, y0: 0, x1: width, y1: regionHeight },
    {
      x0: width - regionWidth,
      y0: height - regionHeight,
      x1: width,
      y1: height,
    },
    { x0: 0, y0: height - regionHeight, x1: regionWidth, y1: height },
  ];

  const found = regions.map((region) =>
    findMarkerCentre(bin, width, region, minSide, maxSide),
  );
  if (found.some((p) => p === null)) return null;

  // Label by geometry rather than by which quadrant they were found in, so a
  // mildly rotated scan still gets a consistent quad.
  const points = found as MarkerCandidate[];
  const bySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...points].sort((a, b) => a.x - a.y - (b.x - b.y));
  const quad = [bySum[0], byDiff[3], bySum[3], byDiff[0]];

  if (!isPlausibleMarkerQuad(quad, layout)) return null;
  return [quad[0], quad[1], quad[2], quad[3]];
}

// ---------------------------------------------------------------------------
// Homography
// ---------------------------------------------------------------------------

/**
 * Solve the 3×3 projective transform taking four source points to four
 * destination points, returned as the eight free coefficients (h8 fixed at 1).
 */
export function solveHomography(src: Point[], dst: Point[]): number[] | null {
  if (src.length !== 4 || dst.length !== 4) return null;

  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x: u, y: v } = src[i];
    const { x, y } = dst[i];
    a.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    a.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }
  return solveLinearSystem(a, b);
}

/** Gaussian elimination with partial pivoting. */
function solveLinearSystem(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-10) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = m[row][col] / m[col][col];
      if (factor === 0) continue;
      for (let k = col; k <= n; k += 1) m[row][k] -= factor * m[col][k];
    }
  }

  return m.map((row, i) => row[n] / row[i]);
}

/** Map a sheet-millimetre point into image pixels. */
export function applyHomography(h: number[], p: Point): Point {
  const denominator = h[6] * p.x + h[7] * p.y + 1;
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / denominator,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / denominator,
  };
}

// ---------------------------------------------------------------------------
// Bubble sampling
// ---------------------------------------------------------------------------

/**
 * Dark fraction of a bubble's inner disc.
 *
 * The radius is derived from the local scale of the homography rather than a
 * global pixels-per-mm, so a perspective-warped photo samples a correctly-sized
 * disc at the far end of the page as well as the near end.
 */
function sampleFill(
  bin: Uint8Array,
  width: number,
  height: number,
  h: number[],
  bubble: BubbleSpec,
): number {
  const centre = applyHomography(h, bubble);
  const rightOf = applyHomography(h, { x: bubble.x + 1, y: bubble.y });
  const below = applyHomography(h, { x: bubble.x, y: bubble.y + 1 });
  const scaleX = Math.hypot(rightOf.x - centre.x, rightOf.y - centre.y);
  const scaleY = Math.hypot(below.x - centre.x, below.y - centre.y);
  const radius = Math.max(
    1,
    ((scaleX + scaleY) / 2) * bubble.d * SAMPLE_RADIUS_FRACTION,
  );

  const x0 = Math.max(0, Math.floor(centre.x - radius));
  const x1 = Math.min(width - 1, Math.ceil(centre.x + radius));
  const y0 = Math.max(0, Math.floor(centre.y - radius));
  const y1 = Math.min(height - 1, Math.ceil(centre.y + radius));

  let dark = 0;
  let total = 0;
  const radiusSquared = radius * radius;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - centre.x;
      const dy = y - centre.y;
      if (dx * dx + dy * dy > radiusSquared) continue;
      total += 1;
      dark += bin[y * width + x];
    }
  }
  return total === 0 ? 0 : dark / total;
}

interface RowReading {
  /** Winning choice index, or -1 for blank / unresolved. */
  index: number;
  multiMark: boolean;
  blank: boolean;
  lowConfidence: boolean;
}

/**
 * Resolve one row of bubbles.
 *
 * Relative, not absolute: the winner has to beat its runner-up by a margin, not
 * merely clear a fixed ink threshold. That is what lets a light pencil on a
 * bright photo read the same as a firm mark on a clean scan, while two genuine
 * marks stay a multi-mark instead of being silently reduced to the darker one.
 */
function readRow(fills: number[]): RowReading {
  let bestIndex = 0;
  for (let i = 1; i < fills.length; i += 1) {
    if (fills[i] > fills[bestIndex]) bestIndex = i;
  }
  const best = fills[bestIndex];
  let second = 0;
  for (let i = 0; i < fills.length; i += 1) {
    if (i !== bestIndex && fills[i] > second) second = fills[i];
  }

  if (best < MIN_FILL) {
    return { index: -1, multiMark: false, blank: true, lowConfidence: false };
  }
  if (second >= best * AMBIGUITY_RATIO) {
    return { index: -1, multiMark: true, blank: false, lowConfidence: false };
  }
  return {
    index: bestIndex,
    multiMark: false,
    blank: false,
    lowConfidence: best < LOW_CONFIDENCE_FILL,
  };
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

const CORNER_ROTATIONS = [
  [0, 1, 2, 3],
  [1, 2, 3, 0],
  [2, 3, 0, 1],
  [3, 0, 1, 2],
];

/**
 * Decode one scanned answer sheet.
 *
 * Returns a failure (never a throw, never a guess) when the sheet cannot be
 * located at all — the caller shows that file as unreadable and moves on to the
 * next one rather than losing the batch.
 */
export function decodeSheet(input: GrayImage, layout: SheetLayout): DecodeResult {
  const gray = downscaleGray(input);
  const { width, height } = gray;
  const bin = binarize(gray, otsuThreshold(gray));

  const corners = findMarkers(bin, width, height, layout);
  if (!corners) {
    return {
      ok: false,
      reason:
        "Could not find the four corner markers. Make sure the whole sheet is in the frame and not cropped.",
    };
  }

  // Try every corner assignment; the orientation dot picks the right one.
  let chosen: { h: number[]; rotation: number; dot: number } | null = null;
  for (let r = 0; r < CORNER_ROTATIONS.length; r += 1) {
    const dst = CORNER_ROTATIONS[r].map((i) => corners[i]);
    const h = solveHomography([...layout.markers], dst);
    if (!h) continue;
    const dot = sampleFill(bin, width, height, h, layout.orientationDot);
    if (!chosen || dot > chosen.dot) chosen = { h, rotation: r, dot };
  }

  if (!chosen || chosen.dot < MIN_FILL) {
    return {
      ok: false,
      reason:
        "Found the corner markers but not the orientation mark. The scan may be too faint, or this may not be an answer sheet for this exam.",
    };
  }

  const { h } = chosen;

  // --- learner ID block ---
  const idDigits = layout.idColumns.map((column) => {
    const fills = column.map((bubble) =>
      sampleFill(bin, width, height, h, bubble),
    );
    const reading = readRow(fills);
    return reading.index >= 0 ? reading.index : null;
  });
  const studentId = decodeStudentCode(idDigits);

  // --- answers ---
  const answers: string[] = [];
  const fills: number[][] = [];
  const multiMarkItems: number[] = [];
  const blankItems: number[] = [];
  const lowConfidenceItems: number[] = [];

  for (const row of layout.rows) {
    const rowFills = row.bubbles.map((bubble) =>
      sampleFill(bin, width, height, h, bubble),
    );
    fills.push(rowFills);
    const reading = readRow(rowFills);

    if (reading.multiMark) {
      answers.push(MULTI_MARK);
      multiMarkItems.push(row.itemNumber);
    } else if (reading.blank) {
      answers.push(BLANK);
      blankItems.push(row.itemNumber);
    } else {
      answers.push(choiceLetter(reading.index));
      if (reading.lowConfidence) lowConfidenceItems.push(row.itemNumber);
    }
  }

  return {
    ok: true,
    sheet: {
      studentId,
      answers,
      fills,
      flags: {
        rotated: chosen.rotation !== 0,
        idUnreadable: studentId === null,
        multiMarkItems,
        blankItems,
        lowConfidenceItems,
      },
    },
  };
}

/** Convenience wrapper for the browser: canvas ImageData straight to answers. */
export function decodeImageData(
  image: RgbaImage,
  layout: SheetLayout,
): DecodeResult {
  return decodeSheet(toGrayImage(image), layout);
}
