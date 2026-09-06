import {
  ClassRecordFormLayout,
  ClassRecordGradingScheme,
  componentTitle,
  gradeDescriptor,
  transmuteGrade,
} from "@/lib/constants/classRecord";
import {
  ClassRecord,
  ClassRecordBlockRow,
  ClassRecordComponent,
  ClassRecordItem,
} from "@/types";

export interface ComponentMeta {
  key: ClassRecordComponent;
  title: string;
  weightField: "ww_weight" | "pt_weight" | "st_weight";
  addLabel: string;
}

const COMPONENT_KEYS: {
  key: ClassRecordComponent;
  weightField: ComponentMeta["weightField"];
  addLabel: string;
}[] = [
  { key: "WW", weightField: "ww_weight", addLabel: "WW" },
  { key: "PT", weightField: "pt_weight", addLabel: "PT" },
  { key: "ST", weightField: "st_weight", addLabel: "EX" },
];

/**
 * The three printed groups, in order. The headings differ per scheme — the
 * updated DepEd form calls the third one "Examinations (EXs)" — so this is a
 * function of the record rather than a constant.
 */
export function componentsFor(scheme: ClassRecordGradingScheme): ComponentMeta[] {
  return COMPONENT_KEYS.map((c) => ({ ...c, title: componentTitle(c.key, scheme) }));
}

/** The scheme a record was opened under; older rows predate the column. */
export function schemeOf(record: ClassRecord): ClassRecordGradingScheme {
  return record.grading_scheme === "matatag" ? "matatag" : "legacy";
}

/** The form a record follows; older rows predate the column. */
export function layoutOf(record: ClassRecord): ClassRecordFormLayout {
  return record.form_layout === "gmrc" ? "gmrc" : "standard";
}

// ============================================================================
// BLOCKS
// ============================================================================

/**
 * One independently weighted block of the record.
 *
 * A standard record has exactly three, synthesised from the three weight
 * columns so that the whole class record — screen, printout and student
 * portal — walks one structure whichever form it is on. A GMRC record has six,
 * read from `sms_class_record_blocks` (migration 175).
 */
export interface ClassRecordBlock {
  /** The row id, or null when the block is one of the three synthetic ones. */
  id: string | null;
  code: string;
  component: ClassRecordComponent;
  label: string;
  weight: number;
  /** The Examinations block's columns are fixed (ST1 / ST2 / TE). */
  fixedItems: boolean;
}

export function blocksOf(
  record: ClassRecord,
  blockRows: ClassRecordBlockRow[]
): ClassRecordBlock[] {
  if (blockRows.length > 0) {
    // Ordered by component first, then position: the component heading row is
    // built by grouping, and the rows beneath it by walking this list, so a
    // block out of component order would silently mis-span the header. Sorting
    // here makes the two agree by construction rather than by convention.
    const componentOrder = COMPONENT_KEYS.map((c) => c.key);
    return [...blockRows]
      .sort(
        (a, b) =>
          componentOrder.indexOf(a.component) -
            componentOrder.indexOf(b.component) || a.position - b.position
      )
      .map((b) => ({
        id: String(b.id),
        code: b.code,
        component: b.component,
        label: b.label,
        weight: Number(b.weight),
        fixedItems: b.component === "ST",
      }));
  }

  return componentsFor(schemeOf(record)).map((c) => ({
    id: null,
    code: c.key,
    component: c.key,
    label: c.title,
    weight: weightOf(record, c.key),
    fixedItems: c.key === "ST",
  }));
}

/**
 * The blocks grouped under their printed component heading, in order.
 *
 * On a standard record every group holds exactly one block and the extra
 * heading row is redundant, which is why the caller checks `grouped` before
 * printing it.
 */
export function groupBlocks(
  blocks: ClassRecordBlock[],
  scheme: ClassRecordGradingScheme
): { component: ClassRecordComponent; title: string; blocks: ClassRecordBlock[] }[] {
  const titles = componentsFor(scheme);
  return titles
    .map((c) => ({
      component: c.key,
      title: c.title,
      blocks: blocks.filter((b) => b.component === c.key),
    }))
    .filter((g) => g.blocks.length > 0);
}

/** True when at least one component holds more than one block. */
export function hasNestedBlocks(blocks: ClassRecordBlock[]): boolean {
  return (["WW", "PT", "ST"] as ClassRecordComponent[]).some(
    (c) => blocks.filter((b) => b.component === c).length > 1
  );
}

/** Items of a block, ordered by position. */
export function itemsOfBlock(
  items: ClassRecordItem[],
  block: ClassRecordBlock
): ClassRecordItem[] {
  const inBlock =
    block.id === null
      ? items.filter((i) => !i.block_id && i.component === block.component)
      : items.filter((i) => String(i.block_id ?? "") === block.id);
  return [...inBlock].sort((a, b) => a.position - b.position);
}

/** Sum of max scores (Highest Possible Score) over a list of columns. */
export function maxTotalOf(items: ClassRecordItem[]): number {
  return items.reduce((sum, i) => sum + Number(i.max_score), 0);
}

/** Learner raw total over a list of columns (missing scores count as 0). */
export function rawTotalOf(
  items: ClassRecordItem[],
  scores: Record<string, number | null>
): number {
  return items.reduce((sum, i) => sum + (Number(scores[i.id] ?? 0) || 0), 0);
}

/**
 * Percentage Score over a list of columns, or null when there are none.
 *
 * The Examinations columns are a weighted average of each item's own
 * percentage score (raw/max × 100) using the item weights (ST1/ST2/TE =
 * 30/30/40 by default); everything else is SUM(raw)/SUM(max). One sentence,
 * applied per block — the same rule migration 081 wrote for the three
 * components. Missing scores count as 0.
 */
export function psOfItems(
  items: ClassRecordItem[],
  weighted: boolean,
  scores: Record<string, number | null>
): number | null {
  if (items.length === 0) return null;

  if (weighted) {
    const totalWeight = items.reduce((sum, i) => sum + Number(i.weight ?? 0), 0);
    if (totalWeight <= 0) return null;
    const sum = items.reduce((acc, i) => {
      const max = Number(i.max_score);
      const raw = Number(scores[i.id] ?? 0) || 0;
      const itemPS = max > 0 ? (raw / max) * 100 : 0;
      return acc + itemPS * Number(i.weight ?? 0);
    }, 0);
    return round2(sum / totalWeight);
  }

  const max = maxTotalOf(items);
  if (max <= 0) return null;
  return round2((rawTotalOf(items, scores) / max) * 100);
}

/**
 * True when the block scores each column on its own weight rather than by
 * pooling raw scores — the Examinations block, on either form.
 */
export function isWeightedBlock(block: ClassRecordBlock): boolean {
  return block.component === "ST";
}

/**
 * One column's own weighted score, which the DepEd form prints beside the raw
 * marks as "WS ST1" / "WS ST2" / "WS TE": the learner's share of that exam's
 * highest possible score, taken at the exam's weight.
 *
 * Blank when nothing is encoded, exactly as the workbook's
 * `IF(ST1="","", ST1/HPS × 30)` leaves the cell empty. A blank still counts as
 * zero toward the block's percentage score, which is what SUM does there.
 */
export function itemWS(
  item: ClassRecordItem,
  scores: Record<string, number | null>
): number | null {
  const raw = scores[item.id];
  if (raw === null || raw === undefined) return null;
  const max = Number(item.max_score);
  if (max <= 0) return null;
  return round2((Number(raw) / max) * Number(item.weight ?? 0));
}

/**
 * How many summary columns a block prints after its own.
 *
 * A pooled block closes with TOTAL / PS / WS. The Examinations block has no
 * TOTAL — pooling raw marks across differently weighted exams would mean
 * nothing — and closes with one weighted score per exam, then PS / WS.
 */
export function trailingColsOf(
  block: ClassRecordBlock,
  itemCount: number
): number {
  return isWeightedBlock(block) ? itemCount + 2 : 3;
}

/** Total printed width of a block: its own columns plus its summary columns. */
export function blockColSpan(
  items: ClassRecordItem[],
  block: ClassRecordBlock
): number {
  const count = itemsOfBlock(items, block).length;
  return count + trailingColsOf(block, count);
}

/**
 * Whether a weighted block's column weights total 100.
 *
 * The DepEd form assumes they do — its PS cell is the plain sum of the
 * weighted scores. `blockPS` renormalises so a mis-entered set still yields a
 * figure out of 100, but then the printed columns no longer add up to the
 * printed PS, so the teacher is told rather than left to notice.
 */
export function itemWeightsValid(
  items: ClassRecordItem[],
  block: ClassRecordBlock
): boolean {
  if (!isWeightedBlock(block)) return true;
  return itemWeightTotal(items, block) === 100;
}

export function itemWeightTotal(
  items: ClassRecordItem[],
  block: ClassRecordBlock
): number {
  return round2(
    itemsOfBlock(items, block).reduce((sum, i) => sum + Number(i.weight ?? 0), 0)
  );
}

export function blockPS(
  items: ClassRecordItem[],
  block: ClassRecordBlock,
  scores: Record<string, number | null>
): number | null {
  return psOfItems(itemsOfBlock(items, block), block.component === "ST", scores);
}

/** Weighted Score = PS × the block's weight. */
export function blockWS(
  items: ClassRecordItem[],
  block: ClassRecordBlock,
  scores: Record<string, number | null>
): number | null {
  const ps = blockPS(items, block, scores);
  return ps === null ? null : round2((ps * block.weight) / 100);
}

/** Initial Grade = the sum of every block's weighted score. */
export function initialGrade(
  blocks: ClassRecordBlock[],
  items: ClassRecordItem[],
  scores: Record<string, number | null>
): number {
  return round2(
    blocks.reduce((sum, b) => sum + (blockWS(items, b, scores) ?? 0), 0)
  );
}

/**
 * Final Term Grade for a learner.
 *
 * The updated DepEd form always transmutes; `use_transmutation` is a legacy
 * record's choice only. Mirror of the branch in `post_class_record_grades`.
 */
export function termGrade(
  record: ClassRecord,
  blocks: ClassRecordBlock[],
  items: ClassRecordItem[],
  scores: Record<string, number | null>
): number {
  const scheme = schemeOf(record);
  const initial = initialGrade(blocks, items, scores);
  if (scheme === "matatag") return transmuteGrade(initial, scheme);
  return record.use_transmutation
    ? transmuteGrade(initial, scheme)
    : Math.round(initial);
}

/** DepEd descriptor band for a grade, under the record's own scheme. */
export function descriptor(
  grade: number,
  scheme: ClassRecordGradingScheme
): string {
  return gradeDescriptor(grade, scheme);
}

export function weightOf(record: ClassRecord, component: ClassRecordComponent): number {
  if (component === "WW") return Number(record.ww_weight);
  if (component === "PT") return Number(record.pt_weight);
  return Number(record.st_weight);
}

/** Whether the block weights sum to exactly 100. */
export function weightsValid(blocks: ClassRecordBlock[]): boolean {
  return totalWeight(blocks) === 100;
}

export function totalWeight(blocks: ClassRecordBlock[]): number {
  return round2(blocks.reduce((sum, b) => sum + b.weight, 0));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
