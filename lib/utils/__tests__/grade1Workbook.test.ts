import { describe, expect, it } from "vitest";
import type { PaceArea, PaceCompetency, PaceTerm } from "@/types";
import {
  ageYearsMonths,
  aggregateGrade1Attendance,
  buildRatingColumns,
  countRatedCells,
  rateableCellsPerLearner,
  ratingSheetFor,
} from "../grade1Workbook";

const area = (id: string, code: string, mode: PaceArea["mode"]): PaceArea => ({
  id,
  code,
  name: code,
  mode,
  sort_order: Number(id),
  is_active: true,
  created_at: "",
  updated_at: "",
});

let seq = 0;
const comp = (
  areaId: string,
  description: string,
  opts: { n?: string; heading?: boolean; terms?: PaceTerm[]; group?: PaceTerm } = {},
): PaceCompetency => {
  seq += 1;
  return {
    id: String(seq),
    area_id: areaId,
    code: `C-${seq}`,
    item_number: opts.n ?? null,
    description,
    is_heading: !!opts.heading,
    terms: opts.terms ?? [],
    term_group: opts.group ?? null,
    print_column: 1,
    sort_order: seq,
    is_active: true,
  } as PaceCompetency;
};

const RL = area("1", "RL", "continuous");
const MATH = area("2", "MATH", "by_term");

const competencies: PaceCompetency[] = [
  comp("1", "Phonological Awareness", { heading: true }),
  comp("1", "Identify rhyming words.", { n: "1", terms: [1] }),
  comp("1", "Blend sounds.", { n: "2", terms: [1, 2, 3] }),
  comp("1", "Comprehending Texts", { heading: true }),
  comp("1", "Comprehend stories.", { n: "20" }), // parent: not rated itself
  comp("1", "a. Note important details.", { terms: [1, 2, 3] }),
  comp("1", "g. Identify problem and solution.", { terms: [3] }),
  comp("1", "a. oneself and family", { n: "22", terms: [3] }),
  comp("1", "b. others", { terms: [3] }),
  comp("2", "Number and Algebra", { heading: true }),
  comp("2", "Count up to 100.", { n: "1", terms: [1], group: 1 }),
  comp("2", "Illustrate properties.", { n: "9", terms: [1], group: 1 }),
  comp("2", "a. the sum of zero.", { terms: [1], group: 1 }),
  comp("2", "Number and Algebra", { heading: true }),
  comp("2", "Order numbers up to 100.", { n: "1", terms: [2], group: 2 }),
];

describe("ratingSheetFor", () => {
  it("names the workbook sheet: one per term for a continuous area, TERM 1-3 for a by-term one", () => {
    expect(ratingSheetFor(RL, 2).title).toBe("TERM 2 RL");
    expect(ratingSheetFor(MATH, 2).title).toBe("TERM 1-3 MATH");
  });
});

describe("buildRatingColumns", () => {
  const rlT1 = ratingSheetFor(RL, 1);
  const rlT3 = ratingSheetFor(RL, 3);

  it("keeps only competencies rated in the sheet's term, never a heading or a parent", () => {
    const labels = buildRatingColumns(competencies, rlT1).flatMap((g) => g.columns.map((c) => c.label));
    expect(labels).toEqual(["1", "2", "20a"]);
  });

  it("labels lettered sub-items from their numbered parent", () => {
    const labels = buildRatingColumns(competencies, rlT3).flatMap((g) => g.columns.map((c) => c.label));
    expect(labels).toEqual(["2", "20a", "20g", "22a", "22b"]);
  });

  it("groups columns under their strand headings", () => {
    const groups = buildRatingColumns(competencies, rlT1);
    expect(groups.map((g) => [g.strand, g.columns.length])).toEqual([
      ["Phonological Awareness", 2],
      ["Comprehending Texts", 1],
    ]);
  });

  it("shows a by-term area one term at a time, restarting numbers per term", () => {
    const t1 = buildRatingColumns(competencies, ratingSheetFor(MATH, 1));
    const t2 = buildRatingColumns(competencies, ratingSheetFor(MATH, 2));
    expect(t1.map((g) => [g.strand, g.columns.map((c) => c.label)])).toEqual([["Number and Algebra", ["1", "9", "9a"]]]);
    expect(t2.map((g) => [g.strand, g.columns.map((c) => c.label)])).toEqual([["Number and Algebra", ["1"]]]);
  });
});

describe("progress counts", () => {
  it("counts rated cells over learners x columns", () => {
    const columns = buildRatingColumns(competencies, ratingSheetFor(RL, 1)).flatMap((g) => g.columns);
    const rated = new Set(["s1:2:1", "s2:2:1"]);
    expect(countRatedCells(columns, ["s1", "s2"], (s, c, t) => rated.has(`${s}:${c}:${t}`))).toEqual({
      rated: 2,
      total: 6,
    });
  });

  it("counts a learner's cells across the year, skipping headings and parents", () => {
    // RL: 1 + 3 + 3 + 1 + 1 + 1 = 10; MATH: 1 + 1 + 1 + 1 = 4
    expect(rateableCellsPerLearner(competencies)).toBe(14);
  });
});

describe("ageYearsMonths", () => {
  it("counts whole years and leftover months", () => {
    expect(ageYearsMonths("2019-08-15", "2026-06-01")).toEqual({ years: "6", months: "9" });
    expect(ageYearsMonths(null, "2026-06-01")).toEqual({ years: "", months: "" });
  });
});

describe("aggregateGrade1Attendance", () => {
  it("counts an unrecorded class day as present and a recorded absence as absent, up to the cut-off", () => {
    const months = aggregateGrade1Attendance(
      [{ date: "2026-06-02", am_present: false, pm_present: false }],
      [],
      "2026-2027",
      "2026-06-05",
    );
    const june = months.find((m) => m.label === "June")!;
    // Mon 1 - Fri 5 June 2026: five class days, one absent.
    expect(june.classDays).toBe(5);
    expect(june.present).toBe(4);
    expect(june.absent).toBe(1);
    expect(months.find((m) => m.label === "July")!.classDays).toBe(0);
  });
});
