/**
 * Table of Specification (TOS) computation helpers.
 *
 * A TOS distributes a fixed number of exam items across competency rows, each
 * weighted by its "No. of days" of instruction. The number of items per
 * competency is derived from the total instructional days for the term:
 *   no_of_items = round( (competency days / total days) * total items )
 * Item placement (which item number sits under which competency × cognitive
 * level) is stored separately (sms_tos_items).
 */

import {
  BLOOM_LEVELS,
  type CognitiveLevel,
} from "@/lib/constants/examinations";

export interface TosCompetencyLike {
  no_of_days: number;
}

export interface TosItemLike {
  competency_id?: number | string | null;
  item_number: number;
  cognitive_level: CognitiveLevel;
}

/**
 * Item count for one competency:
 *   round( (competency days / total days) * total items ).
 * Returns 0 when total days or total items is 0.
 */
export function computeItemCount(
  competencyDays: number,
  totalDays: number,
  totalItems: number,
): number {
  if (totalDays <= 0 || totalItems <= 0) return 0;
  return Math.round(((Number(competencyDays) || 0) / totalDays) * totalItems);
}

/** Item counts for every competency row, given the term's total days. */
export function computeItemCounts(
  rows: TosCompetencyLike[],
  totalDays: number,
  totalItems: number,
): number[] {
  return rows.map((r) => computeItemCount(r.no_of_days, totalDays, totalItems));
}

export interface PlacementCell {
  /** Item numbers placed in this competency × cognitive-level cell, ascending. */
  items: number[];
}

export interface PlacementRow {
  /** Keyed by cognitive level -> the cell for that column. */
  cells: Record<CognitiveLevel, PlacementCell>;
  /** Total items placed on this competency row. */
  total: number;
}

export interface PlacementGrid<Row> {
  /** One placement row per competency (same order as `competencies`). */
  rows: Array<{ competency: Row; placement: PlacementRow }>;
  /** Column totals per cognitive level (the TOS "Total" row). */
  columnTotals: Record<CognitiveLevel, number>;
  /** Grand total of placed items. */
  grandTotal: number;
}

function emptyCells(): Record<CognitiveLevel, PlacementCell> {
  const cells = {} as Record<CognitiveLevel, PlacementCell>;
  for (const lvl of BLOOM_LEVELS) cells[lvl.value] = { items: [] };
  return cells;
}

/**
 * Build the printable item-placement grid: for each competency, the item
 * numbers under each cognitive-level column, plus per-column totals.
 *
 * `competencies` must carry a stable `id`; `items` reference it via
 * `competency_id`.
 */
export function buildPlacementGrid<Row extends { id: number | string }>(
  competencies: Row[],
  items: TosItemLike[],
): PlacementGrid<Row> {
  const columnTotals = {} as Record<CognitiveLevel, number>;
  for (const lvl of BLOOM_LEVELS) columnTotals[lvl.value] = 0;

  const rows = competencies.map((competency) => {
    const cells = emptyCells();
    let total = 0;
    for (const item of items) {
      if (String(item.competency_id) !== String(competency.id)) continue;
      const cell = cells[item.cognitive_level];
      if (!cell) continue;
      cell.items.push(item.item_number);
      columnTotals[item.cognitive_level] += 1;
      total += 1;
    }
    for (const lvl of BLOOM_LEVELS) {
      cells[lvl.value].items.sort((a, b) => a - b);
    }
    return { competency, placement: { cells, total } };
  });

  const grandTotal = Object.values(columnTotals).reduce((s, v) => s + v, 0);
  return { rows, columnTotals, grandTotal };
}

/** Format a list of item numbers for a grid cell, e.g. [1,2,3] -> "1, 2, 3". */
export function formatItemNumbers(items: number[]): string {
  return items.join(", ");
}

const ORDINAL_WORDS = ["", "First", "Second", "Third", "Fourth"];

/** Ordinal word for a grading period (1 -> "First", …). */
export function periodOrdinalWord(period: number): string {
  return ORDINAL_WORDS[period] ?? `${period}th`;
}

/**
 * Auto-generated TOS title, e.g.
 * "Table of Specification for the Second Quarterly Examination in EPP 4".
 */
export function generateTosTitle(header: {
  subject_name: string;
  grade_level: number;
  exam_type: string;
  grading_period: number;
}): string {
  const gradePart =
    header.grade_level === 0
      ? "Kindergarten"
      : header.grade_level === -1
        ? "SNED"
        : String(header.grade_level);
  return `Table of Specification for the ${periodOrdinalWord(
    header.grading_period,
  )} ${header.exam_type} in ${header.subject_name} ${gradePart}`.trim();
}

// ── Custom item numbering ────────────────────────────────────────────────
//
// By default a TOS numbers items in competency order (competency 1 → 1..n1,
// competency 2 → n1+1.., …). A TOS may instead place a competency's items
// anywhere on the paper — competency 1 on items 1, 4 and 9 — because tests
// are routinely ordered easy-to-difficult or by test type. sms_tos_items
// already stores one row per item number, so this is purely how the builder
// assigns the numbers; nothing downstream assumes a competency's items are
// consecutive (every reader joins on item_number).

/** Largest range a typed "a-b" may expand to; guards against "1-99999". */
const MAX_RANGE = 500;

/** Item numbers 1..n in competency order, one list per competency. */
export function sequentialItemNumbers(counts: number[]): number[][] {
  let n = 0;
  return counts.map((count) =>
    Array.from({ length: Math.max(0, count) }, () => ++n),
  );
}

/** True when the lists, read in competency order, are exactly 1, 2, 3, … */
export function isSequentialPlacement(lists: number[][]): boolean {
  let expected = 1;
  for (const list of lists) {
    for (const n of list) {
      if (n !== expected) return false;
      expected += 1;
    }
  }
  return true;
}

export type ParsedItemNumbers =
  | { ok: true; numbers: number[] }
  | { ok: false; error: string };

/**
 * Parse what a teacher types into a competency's item-number field:
 * "1, 4, 9", "1-3, 7", "1–3; 7". Returned ascending.
 */
export function parseItemNumbers(text: string): ParsedItemNumbers {
  const tokens = text
    .replace(/\s*[-–—]\s*/g, "-")
    .split(/[,;\s]+/)
    .filter(Boolean);
  const seen = new Set<number>();
  for (const token of tokens) {
    const range = /^(\d+)-(\d+)$/.exec(token);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (a < 1 || b < a)
        return { ok: false, error: `“${token}” is not a valid range.` };
      if (b - a + 1 > MAX_RANGE)
        return { ok: false, error: `“${token}” is too long a range.` };
      for (let n = a; n <= b; n++) {
        if (seen.has(n)) return { ok: false, error: `Item ${n} is listed twice.` };
        seen.add(n);
      }
      continue;
    }
    if (!/^\d+$/.test(token))
      return { ok: false, error: `“${token}” is not an item number.` };
    const n = Number(token);
    if (n < 1) return { ok: false, error: "Item numbers start at 1." };
    if (seen.has(n)) return { ok: false, error: `Item ${n} is listed twice.` };
    seen.add(n);
  }
  return { ok: true, numbers: [...seen].sort((a, b) => a - b) };
}

/** Compact display of item numbers: [1,2,3,7,9,10] -> "1–3, 7, 9–10". */
export function formatItemRanges(numbers: number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    let end = start;
    while (i + 1 < sorted.length && sorted[i + 1] === end + 1) {
      end = sorted[i + 1];
      i += 1;
    }
    parts.push(start === end ? String(start) : `${start}–${end}`);
  }
  return parts.join(", ");
}

/**
 * Why a custom placement cannot be saved, or null when it can. Every item
 * 1..total must sit under exactly one competency, and each competency must
 * carry exactly as many numbers as it has items.
 */
export function itemNumberingError(
  rows: {
    count: number;
    numbers: number[];
    /** 1-based number the competency carries on screen; defaults to its index + 1. */
    position?: number;
  }[],
): string | null {
  const pos = (i: number) => rows[i].position ?? i + 1;
  const total = rows.reduce((s, r) => s + Math.max(0, r.count), 0);
  for (let i = 0; i < rows.length; i++) {
    const { count, numbers } = rows[i];
    if (numbers.length !== count)
      return `Competency ${pos(i)} has ${count} item${count === 1 ? "" : "s"} but ${numbers.length} item number${numbers.length === 1 ? "" : "s"}.`;
  }
  const owner = new Map<number, number>();
  for (let i = 0; i < rows.length; i++) {
    for (const n of rows[i].numbers) {
      if (n < 1 || n > total)
        return `Item ${n} is beyond the ${total} items of this TOS (competency ${pos(i)}).`;
      const prev = owner.get(n);
      if (prev !== undefined)
        return `Item ${n} is placed under both competency ${pos(prev)} and competency ${pos(i)}.`;
      owner.set(n, i);
    }
  }
  // Each competency carries exactly its count of distinct numbers in
  // 1..total, so together they cover every item; nothing can be left over.
  return null;
}
