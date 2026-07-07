import { ClassRecord, ClassRecordComponent, ClassRecordItem } from "@/types";

export const COMPONENTS: {
  key: ClassRecordComponent;
  title: string;
  weightField: "ww_weight" | "pt_weight" | "st_weight";
  addLabel: string;
}[] = [
  {
    key: "WW",
    title: "Written / Oral Works",
    weightField: "ww_weight",
    addLabel: "WW",
  },
  {
    key: "PT",
    title: "Product / Performance Tasks",
    weightField: "pt_weight",
    addLabel: "PT",
  },
  {
    key: "ST",
    title: "Summative Tests & Term Exams",
    weightField: "st_weight",
    addLabel: "ST",
  },
];

export function weightOf(record: ClassRecord, component: ClassRecordComponent): number {
  if (component === "WW") return Number(record.ww_weight);
  if (component === "PT") return Number(record.pt_weight);
  return Number(record.st_weight);
}

/** Items of a component, ordered by position. */
export function itemsOf(
  items: ClassRecordItem[],
  component: ClassRecordComponent
): ClassRecordItem[] {
  return items
    .filter((i) => i.component === component)
    .sort((a, b) => a.position - b.position);
}

/** Sum of max scores (Highest Possible Score) for a component. */
export function componentMaxTotal(
  items: ClassRecordItem[],
  component: ClassRecordComponent
): number {
  return itemsOf(items, component).reduce((sum, i) => sum + Number(i.max_score), 0);
}

/** Learner raw total for a component (missing scores count as 0). */
export function componentRawTotal(
  items: ClassRecordItem[],
  component: ClassRecordComponent,
  scores: Record<string, number | null>
): number {
  return itemsOf(items, component).reduce(
    (sum, i) => sum + (Number(scores[i.id] ?? 0) || 0),
    0
  );
}

/**
 * Percentage Score for a component, or null when the component has no columns.
 *
 * ST is a weighted average of each fixed item's own percentage score
 * (raw/max × 100) using the item weights (ST1/ST2/TE = 30/30/40 by default).
 * WW/PT use the SUM(raw)/SUM(max) model. Missing scores count as 0.
 */
export function componentPS(
  items: ClassRecordItem[],
  component: ClassRecordComponent,
  scores: Record<string, number | null>
): number | null {
  const colItems = itemsOf(items, component);
  if (colItems.length === 0) return null;

  if (component === "ST") {
    const totalWeight = colItems.reduce((sum, i) => sum + Number(i.weight ?? 0), 0);
    if (totalWeight <= 0) return null;
    const weighted = colItems.reduce((sum, i) => {
      const max = Number(i.max_score);
      const raw = Number(scores[i.id] ?? 0) || 0;
      const itemPS = max > 0 ? (raw / max) * 100 : 0;
      return sum + itemPS * Number(i.weight ?? 0);
    }, 0);
    return round2(weighted / totalWeight);
  }

  const max = componentMaxTotal(items, component);
  if (max <= 0) return null;
  const raw = componentRawTotal(items, component, scores);
  return round2((raw / max) * 100);
}

/** Weighted Score = PS * weight%. */
export function componentWS(
  record: ClassRecord,
  items: ClassRecordItem[],
  component: ClassRecordComponent,
  scores: Record<string, number | null>
): number | null {
  const ps = componentPS(items, component, scores);
  if (ps === null) return null;
  return round2((ps * weightOf(record, component)) / 100);
}

/** Initial Grade = sum of the three weighted scores. */
export function initialGrade(
  record: ClassRecord,
  items: ClassRecordItem[],
  scores: Record<string, number | null>
): number {
  return round2(
    (["WW", "PT", "ST"] as ClassRecordComponent[]).reduce(
      (sum, c) => sum + (componentWS(record, items, c, scores) ?? 0),
      0
    )
  );
}

/** Final Term Grade for a learner (transmuted when enabled, else rounded). */
export function termGrade(
  record: ClassRecord,
  items: ClassRecordItem[],
  scores: Record<string, number | null>
): number {
  const initial = initialGrade(record, items, scores);
  return record.use_transmutation ? transmute(initial) : Math.round(initial);
}

/** DepEd descriptor band for a grade. */
export function descriptor(grade: number): string {
  if (grade >= 90) return "Outstanding";
  if (grade >= 85) return "Very Satisfactory";
  if (grade >= 80) return "Satisfactory";
  if (grade >= 75) return "Fairly Satisfactory";
  return "Did Not Meet Expectations";
}

/** Whether the three component weights sum to exactly 100. */
export function weightsValid(record: ClassRecord): boolean {
  return (
    Number(record.ww_weight) + Number(record.pt_weight) + Number(record.st_weight) ===
    100
  );
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** DepEd DO 8, s.2015 transmutation table (mirror of SQL sms_transmute_grade). */
export function transmute(initial: number): number {
  const table: [number, number][] = [
    [100, 100], [98.4, 99], [96.8, 98], [95.2, 97], [93.6, 96], [92.0, 95],
    [90.4, 94], [88.8, 93], [87.2, 92], [85.6, 91], [84.0, 90], [82.4, 89],
    [80.8, 88], [79.2, 87], [77.6, 86], [76.0, 85], [74.4, 84], [72.8, 83],
    [71.2, 82], [69.6, 81], [68.0, 80], [66.4, 79], [64.8, 78], [63.2, 77],
    [61.6, 76], [60.0, 75], [56.0, 74], [52.0, 73], [48.0, 72], [44.0, 71],
    [40.0, 70], [36.0, 69], [32.0, 68], [28.0, 67], [24.0, 66], [20.0, 65],
    [16.0, 64], [12.0, 63], [8.0, 62], [4.0, 61],
  ];
  for (const [threshold, grade] of table) {
    if (initial >= threshold) return grade;
  }
  return 60;
}
