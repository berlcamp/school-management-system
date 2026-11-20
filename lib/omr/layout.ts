/**
 * OMR answer-sheet geometry — the single source of truth for where every mark
 * sits on the printed sheet.
 *
 * Both halves of the pipeline read this file and nothing else:
 *   - `lib/pdf/generateAnswerSheets.ts` draws the sheet from these coordinates
 *   - `lib/omr/decode.ts` samples the scan at these coordinates
 *
 * If the two ever disagree the decoder reads noise, so no other module is
 * allowed to hard-code a position. All coordinates are millimetres from the
 * top-left of an A4 portrait page, and every bubble is given by its CENTRE —
 * jsPDF draws circles from the centre and the decoder samples from the centre,
 * so centres travel better than corners.
 *
 * Three FORMATS share this file (`SheetFormat`). `full` is the original A4
 * page and its geometry is frozen — every constant below that is not inside
 * `STRIP_GEOMETRY` is the full sheet's, unchanged. `half` and `quarter` are
 * strips cut lengthwise from A4 (105 × 297 and 52.5 × 297 mm), printed 2 or 4
 * to a page so a school saves paper. Each strip carries its OWN four corner
 * markers, orientation dot and learner code, so once cut it is a complete
 * sheet; for a strip, "page" in this file means the strip, and coordinates are
 * millimetres from the strip's top-left. The decoder tells the formats apart by
 * the proportions of the marker rectangle (~0.68, ~0.31, ~0.13 wide-to-tall),
 * which is why no format is recorded anywhere.
 *
 * Scale, translation and moderate skew are all recovered at decode time from
 * the four corner markers, so a photocopy at 98%, a page fed in crooked, or a
 * phone photo taken at an angle still lands on the right bubbles. What is NOT
 * recoverable is a change to this file after sheets have been printed: the
 * printed batch encodes this geometry physically.
 */

export interface Point {
  x: number;
  y: number;
}

/** A circle to be printed and later sampled: centre + diameter, in mm. */
export interface BubbleSpec extends Point {
  d: number;
}

export interface AnswerRowSpec {
  itemNumber: number;
  /** Bubbles printed for this item (2–5); a True/False item gets 2, not 4. */
  choiceCount: number;
  /** Where the item number is printed (right-aligned baseline anchor). */
  label: Point;
  bubbles: BubbleSpec[];
}

/** Paper size of one learner's sheet. */
export type SheetFormat = "full" | "half" | "quarter";

export const SHEET_FORMATS: SheetFormat[] = ["full", "half", "quarter"];

export interface SheetLayout {
  format: SheetFormat;
  pageWidthMm: number;
  pageHeightMm: number;
  /** Corner marker centres, in sheet order: TL, TR, BR, BL. */
  markers: [Point, Point, Point, Point];
  markerSizeMm: number;
  /**
   * Asymmetric mark near the top-left, printed solid. Nothing else on the sheet
   * occupies its position or the positions it maps to under a 90/180/270°
   * rotation, so the decoder can tell which way up a scan is by sampling it
   * under each candidate orientation and keeping the darkest.
   */
  orientationDot: BubbleSpec;
  /**
   * ID block: one inner array per digit POSITION, ten bubbles (0–9) each. On
   * the full and half sheets a position is a column of bubbles running down;
   * the quarter strip is too narrow for nine columns, so there a position is a
   * row running across. The decoder reads the arrays, never the direction.
   */
  idColumns: BubbleSpec[][];
  /** Digits of student id carried by the block, excluding the check digit. */
  idDigits: number;
  /** Answer bubbles, one entry per exam item, in item order. */
  rows: AnswerRowSpec[];
  /** Answer columns actually used (1–4), for the printed column rules. */
  columnsUsed: number;
}

// --- page ------------------------------------------------------------------
export const PAGE_WIDTH_MM = 210; // A4 portrait
export const PAGE_HEIGHT_MM = 297;

// --- corner markers --------------------------------------------------------
export const MARKER_SIZE_MM = 7;
const MARKER_MARGIN_MM = 10;
const MARKER_CX_LEFT = MARKER_MARGIN_MM + MARKER_SIZE_MM / 2; // 13.5
const MARKER_CX_RIGHT = PAGE_WIDTH_MM - MARKER_MARGIN_MM - MARKER_SIZE_MM / 2; // 196.5
const MARKER_CY_TOP = MARKER_MARGIN_MM + MARKER_SIZE_MM / 2; // 13.5
const MARKER_CY_BOTTOM = PAGE_HEIGHT_MM - MARKER_MARGIN_MM - MARKER_SIZE_MM / 2; // 283.5

export const ORIENTATION_DOT: BubbleSpec = {
  x: MARKER_CX_LEFT,
  y: 26,
  d: 5,
};

// --- learner ID block ------------------------------------------------------
/** Student id digits encoded on the sheet; ids beyond this cannot be printed. */
export const ID_DIGITS = 8;
/** Digit columns printed = the id plus a mod-10 check digit. */
export const ID_COLUMNS = ID_DIGITS + 1;
const ID_BUBBLE_D = 3.2;
const ID_COL_PITCH = 6;
const ID_ROW_PITCH = 4.8;
const ID_ORIGIN_X = 138; // centre of the first digit column
const ID_ORIGIN_Y = 30; // centre of the "0" row

// --- answer grid -----------------------------------------------------------
export const ANSWER_BUBBLE_D = 4;
export const MAX_CHOICES = 5; // A–E
const CHOICE_PITCH = 6.5;
const ROW_PITCH = 7;
const ROWS_PER_COLUMN = 25;
const ANSWER_COLUMNS = 4;
const COLUMN_PITCH = 44;
const ANSWER_ORIGIN_X = 14; // centre of choice A in column 1
const ANSWER_ORIGIN_Y = 92; // centre of the first row
const LABEL_OFFSET_MM = 5.5; // item number sits this far left of choice A

/** Items that fit on one sheet. One learner is always exactly one page. */
export const MAX_ITEMS = ROWS_PER_COLUMN * ANSWER_COLUMNS; // 100

// --- cut strips (half and quarter) ----------------------------------------
//
// Bubble and marker SIZES are the full sheet's; only positions differ, so a
// strip shades and reads exactly like the page. Markers sit closer to the edge
// (6 / 5 mm, not 10) because a strip has no room to spare, which still leaves
// room for a crooked scissor cut.
//
// The orientation dot is placed lower than the full sheet's on purpose. An
// UNCUT page of strips has its outermost four markers where a full sheet's
// would be, near enough; with the dot where the full sheet's maps to, such a
// page would read as one full sheet of garbage. At y = 30 the full layout finds
// no dot there and fails, and the strips are found one by one instead.

interface StripGeometry {
  pageWidthMm: number;
  markerMarginMm: number;
  dot: BubbleSpec;
  id: {
    originX: number;
    originY: number;
    /** Step between digit POSITIONS. */
    positionPitch: number;
    /** Step between the digits 0–9 of one position. */
    digitPitch: number;
    /** True = a position runs across (quarter); false = runs down. */
    across: boolean;
  };
  answer: {
    originX: number;
    originY: number;
    rowPitch: number;
    rowsPerColumn: number;
    columns: number;
    columnPitch: number;
  };
}

const STRIP_ROW_PITCH = 6.5;

const STRIP_GEOMETRY: Record<"half" | "quarter", StripGeometry> = {
  half: {
    pageWidthMm: 105,
    markerMarginMm: 6,
    dot: { x: 9.5, y: 30, d: 5 },
    id: {
      originX: 31,
      originY: 56,
      positionPitch: ID_COL_PITCH,
      digitPitch: ID_ROW_PITCH,
      across: false,
    },
    answer: {
      originX: 18,
      originY: 121,
      rowPitch: STRIP_ROW_PITCH,
      rowsPerColumn: 25,
      columns: 2,
      columnPitch: COLUMN_PITCH,
    },
  },
  quarter: {
    pageWidthMm: 52.5,
    markerMarginMm: 5,
    dot: { x: 8.5, y: 30, d: 5 },
    id: {
      originX: 9.5,
      originY: 47,
      positionPitch: 4.4,
      digitPitch: 4,
      across: true,
    },
    answer: {
      originX: 17,
      originY: 104,
      rowPitch: STRIP_ROW_PITCH,
      rowsPerColumn: 25,
      columns: 1,
      columnPitch: COLUMN_PITCH,
    },
  },
};

/** Items one learner's sheet holds, per format. */
export const MAX_ITEMS_BY_FORMAT: Record<SheetFormat, number> = {
  full: MAX_ITEMS,
  half: STRIP_GEOMETRY.half.answer.rowsPerColumn * STRIP_GEOMETRY.half.answer.columns,
  quarter:
    STRIP_GEOMETRY.quarter.answer.rowsPerColumn *
    STRIP_GEOMETRY.quarter.answer.columns,
};

/** Sheets of this format printed side by side on one A4 page. */
export const SHEETS_PER_PAGE: Record<SheetFormat, number> = {
  full: 1,
  half: 2,
  quarter: 4,
};

export const SHEET_FORMAT_LABELS: Record<SheetFormat, string> = {
  full: "Whole sheet (A4)",
  half: "½ sheet lengthwise",
  quarter: "¼ sheet lengthwise",
};

/** Formats an exam of `itemCount` items fits on, largest first. */
export function formatsForItemCount(itemCount: number): SheetFormat[] {
  return SHEET_FORMATS.filter((f) => itemCount <= MAX_ITEMS_BY_FORMAT[f]);
}

/** Choice letter for a 0-based index: 0 -> "A". */
export function choiceLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** 0-based index for a choice letter: "A" -> 0, unknown -> -1. */
export function choiceIndex(letter: string): number {
  const i = letter.trim().toUpperCase().charCodeAt(0) - 65;
  return i >= 0 && i < MAX_CHOICES ? i : -1;
}

export interface ItemSpec {
  itemNumber: number;
  choiceCount: number;
}

/**
 * Build the full sheet geometry for a set of exam items.
 *
 * Items are laid out down column 1, then column 2, and so on — the reading
 * order a learner expects, and the order the decoder walks. Every item keeps
 * its own `choiceCount`, so a 2-choice True/False item prints two bubbles and
 * is read as two, rather than being padded to four and inviting a stray mark.
 */
export function buildSheetLayout(
  items: ItemSpec[],
  format: SheetFormat = "full",
): SheetLayout {
  if (format !== "full") return buildStripLayout(items, format);
  if (items.length === 0) {
    throw new Error("Cannot build an answer sheet with no items.");
  }
  if (items.length > MAX_ITEMS) {
    throw new Error(
      `An answer sheet holds at most ${MAX_ITEMS} items; got ${items.length}.`,
    );
  }

  const rows: AnswerRowSpec[] = items.map((item, index) => {
    const column = Math.floor(index / ROWS_PER_COLUMN);
    const row = index % ROWS_PER_COLUMN;
    const x0 = ANSWER_ORIGIN_X + column * COLUMN_PITCH;
    const y = ANSWER_ORIGIN_Y + row * ROW_PITCH;
    const choiceCount = Math.min(
      MAX_CHOICES,
      Math.max(2, Math.round(item.choiceCount)),
    );

    return {
      itemNumber: item.itemNumber,
      choiceCount,
      label: { x: x0 - LABEL_OFFSET_MM, y },
      bubbles: Array.from({ length: choiceCount }, (_, c) => ({
        x: x0 + c * CHOICE_PITCH,
        y,
        d: ANSWER_BUBBLE_D,
      })),
    };
  });

  const idColumns: BubbleSpec[][] = Array.from(
    { length: ID_COLUMNS },
    (_, col) =>
      Array.from({ length: 10 }, (_, digit) => ({
        x: ID_ORIGIN_X + col * ID_COL_PITCH,
        y: ID_ORIGIN_Y + digit * ID_ROW_PITCH,
        d: ID_BUBBLE_D,
      })),
  );

  return {
    format: "full",
    pageWidthMm: PAGE_WIDTH_MM,
    pageHeightMm: PAGE_HEIGHT_MM,
    markers: [
      { x: MARKER_CX_LEFT, y: MARKER_CY_TOP },
      { x: MARKER_CX_RIGHT, y: MARKER_CY_TOP },
      { x: MARKER_CX_RIGHT, y: MARKER_CY_BOTTOM },
      { x: MARKER_CX_LEFT, y: MARKER_CY_BOTTOM },
    ],
    markerSizeMm: MARKER_SIZE_MM,
    orientationDot: ORIENTATION_DOT,
    idColumns,
    idDigits: ID_DIGITS,
    rows,
    columnsUsed: Math.min(
      ANSWER_COLUMNS,
      Math.ceil(items.length / ROWS_PER_COLUMN),
    ),
  };
}

const clampChoices = (count: number) =>
  Math.min(MAX_CHOICES, Math.max(2, Math.round(count)));

/** A half or quarter strip: the same rules as the page, its own positions. */
function buildStripLayout(
  items: ItemSpec[],
  format: "half" | "quarter",
): SheetLayout {
  const g = STRIP_GEOMETRY[format];
  const max = MAX_ITEMS_BY_FORMAT[format];
  if (items.length === 0) {
    throw new Error("Cannot build an answer sheet with no items.");
  }
  if (items.length > max) {
    throw new Error(
      `A ${SHEET_FORMAT_LABELS[format]} answer sheet holds at most ${max} items; got ${items.length}.`,
    );
  }

  const half = MARKER_SIZE_MM / 2;
  const left = g.markerMarginMm + half;
  const right = g.pageWidthMm - g.markerMarginMm - half;
  const top = g.markerMarginMm + half;
  const bottom = PAGE_HEIGHT_MM - g.markerMarginMm - half;

  const rows: AnswerRowSpec[] = items.map((item, index) => {
    const column = Math.floor(index / g.answer.rowsPerColumn);
    const row = index % g.answer.rowsPerColumn;
    const x0 = g.answer.originX + column * g.answer.columnPitch;
    const y = g.answer.originY + row * g.answer.rowPitch;
    const choiceCount = clampChoices(item.choiceCount);
    return {
      itemNumber: item.itemNumber,
      choiceCount,
      label: { x: x0 - LABEL_OFFSET_MM, y },
      bubbles: Array.from({ length: choiceCount }, (_, c) => ({
        x: x0 + c * CHOICE_PITCH,
        y,
        d: ANSWER_BUBBLE_D,
      })),
    };
  });

  const idColumns: BubbleSpec[][] = Array.from(
    { length: ID_COLUMNS },
    (_, position) =>
      Array.from({ length: 10 }, (_, digit) =>
        g.id.across
          ? {
              x: g.id.originX + digit * g.id.digitPitch,
              y: g.id.originY + position * g.id.positionPitch,
              d: ID_BUBBLE_D,
            }
          : {
              x: g.id.originX + position * g.id.positionPitch,
              y: g.id.originY + digit * g.id.digitPitch,
              d: ID_BUBBLE_D,
            },
      ),
  );

  return {
    format,
    pageWidthMm: g.pageWidthMm,
    pageHeightMm: PAGE_HEIGHT_MM,
    markers: [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ],
    markerSizeMm: MARKER_SIZE_MM,
    orientationDot: g.dot,
    idColumns,
    idDigits: ID_DIGITS,
    rows,
    columnsUsed: Math.min(
      g.answer.columns,
      Math.ceil(items.length / g.answer.rowsPerColumn),
    ),
  };
}

/**
 * Encode a student id as the digits to shade in the ID block: the id
 * zero-padded to ID_DIGITS, followed by a mod-10 check digit.
 *
 * The check digit is what stops a single mis-read bubble from silently
 * attributing a paper to the wrong learner — a plausible-but-wrong id is
 * rejected rather than matched.
 */
export function encodeStudentCode(studentId: number): number[] {
  if (!Number.isInteger(studentId) || studentId < 0) {
    throw new Error(`Student id must be a non-negative integer: ${studentId}`);
  }
  const text = String(studentId);
  if (text.length > ID_DIGITS) {
    throw new Error(
      `Student id ${studentId} needs more than ${ID_DIGITS} digits and cannot be printed on an answer sheet.`,
    );
  }
  const digits = text.padStart(ID_DIGITS, "0").split("").map(Number);
  return [...digits, checkDigit(digits)];
}

/**
 * Read a student id back from shaded ID-block digits. Returns null when a
 * column was blank or multi-marked (null entries), when the length is wrong, or
 * when the check digit disagrees — every one of which means "ask the teacher",
 * never "guess".
 */
export function decodeStudentCode(digits: (number | null)[]): number | null {
  if (digits.length !== ID_COLUMNS) return null;
  if (digits.some((d) => d === null)) return null;
  const values = digits as number[];
  const body = values.slice(0, ID_DIGITS);
  if (values[ID_DIGITS] !== checkDigit(body)) return null;
  return Number(body.join(""));
}

function checkDigit(digits: number[]): number {
  return digits.reduce((sum, d) => sum + d, 0) % 10;
}
