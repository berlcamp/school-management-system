import { beforeEach, describe, expect, it, vi } from "vitest";

/* A fake PostgREST builder: records the filters each query applied and
   resolves to the rows registered for its table. Enough to prove the
   fetchers widen the read to the sibling sections and then pick per key. */
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const calls: Array<{ table: string; filters: Array<[string, string, unknown]> }> = [];

function builder(table: string) {
  const filters: Array<[string, string, unknown]> = [];
  let window: [number, number] | null = null;
  calls.push({ table, filters });
  const apply = () => {
    const rows = (tables[table] ?? []).filter((row) =>
      filters.every(([op, col, val]) =>
        op === "eq"
          ? String(row[col]) === String(val)
          : (val as unknown[]).map(String).includes(String(row[col])),
      ),
    );
    return window ? rows.slice(window[0], window[1] + 1) : rows;
  };
  const b = {
    select: () => b,
    order: () => b,
    range: (from: number, to: number) => {
      window = [from, to];
      return b;
    },
    eq: (col: string, val: unknown) => {
      filters.push(["eq", col, val]);
      return b;
    },
    in: (col: string, val: unknown[]) => {
      filters.push(["in", col, val]);
      return b;
    },
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
      Promise.resolve({ data: apply(), error: null }).then(resolve),
  };
  return b;
}

vi.mock("@/lib/supabase/client", () => ({
  supabase: { from: (table: string) => builder(table) },
}));

import {
  fetchSectionOfferings,
  narrowToOffering,
  normaliseOfferedTerms,
  offeredFor,
  offeringsApply,
  withinOfferings,
} from "@/lib/utils/sectionOfferings";

describe("normaliseOfferedTerms", () => {
  it("sorts and de-duplicates", () => {
    expect(normaliseOfferedTerms([3, 1, 1], 3)).toEqual([1, 3]);
  });
  it("is null when every period is offered", () => {
    expect(normaliseOfferedTerms([1, 2, 3], 3)).toBeNull();
  });
  it("drops periods the year does not have", () => {
    expect(normaliseOfferedTerms([1, 4], 3)).toEqual([1]);
  });
});

describe("narrowToOffering", () => {
  it("a whole-year time block takes the offering", () => {
    expect(narrowToOffering(null, [1], 3)).toEqual([1]);
  });
  it("intersects", () => {
    expect(narrowToOffering([1, 2], [2, 3], 3)).toEqual([2]);
  });
  it("is null when nothing is left", () => {
    expect(narrowToOffering([3], [1], 3)).toBeNull();
  });
});

describe("offeringsApply", () => {
  it("only term-based Grade 11-12 sections not on the old curriculum", () => {
    expect(offeringsApply({ gradeLevel: 12, shsCurriculum: "old", schoolYear: "2026-2027" })).toBe(false);
    expect(offeringsApply({ gradeLevel: 11, shsCurriculum: "strengthened", schoolYear: "2026-2027" })).toBe(true);
    expect(offeringsApply({ gradeLevel: 11, shsCurriculum: null, schoolYear: "2025-2026" })).toBe(false);
    expect(offeringsApply({ gradeLevel: 10, shsCurriculum: null, schoolYear: "2026-2027" })).toBe(false);
  });
});

describe("fetchSectionOfferings", () => {
  beforeEach(() => {
    for (const k of Object.keys(tables)) delete tables[k];
  });

  it("maps subject id to terms, for the given section and school year only", async () => {
    tables.sms_section_subject_terms = [
      { section_id: 7, subject_id: 11, school_year: "2026-2027", terms: [1] },
      { section_id: 7, subject_id: 12, school_year: "2025-2026", terms: [2] },
      { section_id: 8, subject_id: 13, school_year: "2026-2027", terms: [3] },
    ];
    const map = await fetchSectionOfferings("7", "2026-2027");
    expect([...map.entries()]).toEqual([["11", [1]]]);
    expect(offeredFor(map, "11")).toEqual([1]);
    expect(offeredFor(map, "99")).toBeNull();
  });
});

describe("withinOfferings (student portal)", () => {
  it("drops grades outside a subject's offered terms in that section and year only", () => {
    const grades = [
      { section_id: 7, subject_id: 11, school_year: "2026-2027", grading_period: 1, grade: 88 },
      { section_id: 7, subject_id: 11, school_year: "2026-2027", grading_period: 2, grade: 60 },
      { section_id: 7, subject_id: 12, school_year: "2026-2027", grading_period: 2, grade: 80 },
      { section_id: 9, subject_id: 11, school_year: "2026-2027", grading_period: 2, grade: 81 },
    ];
    const offerings = [{ section_id: 7, subject_id: 11, school_year: "2026-2027", terms: [1] }];
    expect(withinOfferings(grades, offerings).map((g) => g.grade)).toEqual([88, 80, 81]);
  });
});
