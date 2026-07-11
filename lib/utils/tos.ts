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
