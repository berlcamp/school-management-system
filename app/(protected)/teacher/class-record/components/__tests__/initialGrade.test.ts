import { describe, expect, it } from "vitest";

import { ClassRecord, ClassRecordItem } from "@/types";

import {
  ClassRecordBlock,
  blockWS,
  initialGrade,
  termGrade,
} from "../classRecordUtils";

/**
 * The Initial Grade and the Term Grade, pinned to what the database posts.
 *
 * `post_class_record_grades` sums `block_ps × weight / 100` at full precision
 * and transmutes THAT. This side used to round each weighted score to the two
 * decimals its cell prints and then round the sum again, which crossed a
 * MATATAG band often enough to matter: on the local clone 14 of 7,209 posted
 * learner-rows came out a mark apart, so the teacher read one figure on the
 * class record and the card printed another.
 *
 * The cases below are those rows, taken off the clone with their own component
 * percentage scores, and each expects the POSTED grade — the figure in
 * sms_grades.
 */

const record = (overrides: Partial<ClassRecord> = {}): ClassRecord =>
  ({
    id: "1",
    ww_weight: 20,
    pt_weight: 50,
    st_weight: 30,
    grading_scheme: "matatag",
    use_transmutation: false,
    form_layout: "standard",
    ...overrides,
  }) as ClassRecord;

const BLOCKS: ClassRecordBlock[] = [
  { id: null, code: "WW", component: "WW", label: "WW", weight: 20, fixedItems: false },
  { id: null, code: "PT", component: "PT", label: "PT", weight: 50, fixedItems: false },
  { id: null, code: "ST", component: "ST", label: "EX", weight: 30, fixedItems: true },
];

/**
 * One column per component, scored so the component's percentage score is
 * exactly the figure named — out of 10,000 so two decimals are reachable.
 */
const item = (component: "WW" | "PT" | "ST"): ClassRecordItem =>
  ({
    id: component,
    component,
    max_score: 10000,
    weight: component === "ST" ? 100 : null,
    position: 1,
  }) as ClassRecordItem;

const ITEMS = [item("WW"), item("PT"), item("ST")];

const scoresFor = (ww: number, pt: number, st: number) => ({
  WW: ww * 100,
  PT: pt * 100,
  ST: st * 100,
});

/** The 14 rows the clone disagreed on, with the grade that was posted. */
const CLONE_CASES: [ww: number, pt: number, st: number, posted: number][] = [
  [89.49, 96.36, 76.0, 90],
  [54.44, 94.5, 24.0, 73],
  [81.54, 0, 39.0, 65],
  [77.5, 90.59, 70.0, 84],
  [3.33, 100.0, 33.33, 72],
  [13.33, 100.0, 26.67, 72],
  [86.25, 85.33, 69.0, 83],
  [89.09, 91.67, 88.0, 91],
  [74.55, 88.33, 60.0, 80],
  [69.09, 48.89, 28.0, 69],
  [84.29, 96.0, 84.0, 91],
  [90.0, 80.0, 79.33, 84],
  [75.0, 85.0, 65.25, 80],
  [88.89, 100.0, 90.0, 95],
];

describe("initialGrade", () => {
  it("sums the weighted scores at full precision, not off the printed cells", () => {
    const scores = scoresFor(89.49, 96.36, 76.0);

    // 89.49 × 0.20 + 96.36 × 0.50 + 76.00 × 0.30
    expect(initialGrade(BLOCKS, ITEMS, scores)).toBeCloseTo(88.878, 6);

    // The cells themselves still print two decimals, as the DepEd form does.
    expect(BLOCKS.map((b) => blockWS(ITEMS, b, scores))).toEqual([
      17.9, 48.18, 22.8,
    ]);
  });

  it("still reads as two decimals on screen", () => {
    // Every caller formats with toFixed(2); the displayed figure is unchanged.
    expect(initialGrade(BLOCKS, ITEMS, scoresFor(89.49, 96.36, 76.0)).toFixed(2)).toBe(
      "88.88",
    );
  });
});

describe("termGrade agrees with post_class_record_grades", () => {
  it.each(CLONE_CASES)(
    "WW %s / PT %s / EX %s posts %i",
    (ww, pt, st, posted) => {
      expect(termGrade(record(), BLOCKS, ITEMS, scoresFor(ww, pt, st))).toBe(posted);
    },
  );

  it("rounds rather than transmutes on a legacy record that opted out", () => {
    // 88.878 → 89, the same ROUND(v_initial) the SQL takes on that branch.
    expect(
      termGrade(
        record({ grading_scheme: "legacy", use_transmutation: false }),
        BLOCKS,
        ITEMS,
        scoresFor(89.49, 96.36, 76.0),
      ),
    ).toBe(89);
  });
});
