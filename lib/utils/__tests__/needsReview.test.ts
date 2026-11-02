import { describe, expect, it } from "vitest";
import {
  MODULE_KEYS,
  moduleResult,
  needsReviewSheet,
  normalizeNeedsReviewRow,
  reviewGroups,
  reviewTotals,
} from "@/lib/utils/needsReview";

const school = (over: Record<string, unknown>) =>
  normalizeNeedsReviewRow({ school_id: 1, school_name: "A School", district: null, ...over });

describe("moduleResult", () => {
  it("rates a ratio module as not started, incomplete or complete", () => {
    expect(moduleResult(school({ learners: 40, learners_measured: 0 }), "health").status).toBe("not_started");
    const partial = moduleResult(school({ learners: 40, learners_measured: 10 }), "health");
    expect(partial.status).toBe("incomplete");
    expect(partial.percent).toBe(25);
    expect(moduleResult(school({ learners: 40, learners_measured: 40 }), "health").status).toBe("complete");
  });

  it("is not applicable when the school has nobody to encode for", () => {
    expect(moduleResult(school({ crla_learners: 0 }), "crla").status).toBe("not_applicable");
  });

  it("needs every part of a presence module", () => {
    expect(moduleResult(school({}), "exams").status).toBe("not_started");
    expect(moduleResult(school({ tos_count: 2 }), "exams").status).toBe("incomplete");
    expect(
      moduleResult(school({ tos_count: 2, summative_exams: 1, item_analyses: 3 }), "exams").status,
    ).toBe("complete");
    expect(moduleResult(school({ books_total: 100 }), "books").status).toBe("incomplete");
  });

  it("rates SBFP by programme, then beneficiaries", () => {
    expect(moduleResult(school({ sbfp_program: false }), "sbfp").status).toBe("not_started");
    expect(moduleResult(school({ sbfp_program: true }), "sbfp").status).toBe("incomplete");
    expect(moduleResult(school({ sbfp_program: true, sbfp_beneficiaries: 5 }), "sbfp").status).toBe("complete");
  });
});

describe("groups and totals", () => {
  const a = school({ school_id: 1, school_name: "Alpha", learners: 10, learners_measured: 5 });
  const b = school({ school_id: 2, school_name: "Beta", learners: 10, learners_measured: 0 });

  it("lists not-started then incomplete schools per module", () => {
    const health = reviewGroups([a, b]).find((g) => g.key === "health")!;
    expect(health.notStarted.map((e) => e.school.school_name)).toEqual(["Beta"]);
    expect(health.incomplete.map((e) => e.school.school_name)).toEqual(["Alpha"]);
  });

  it("counts schools behind and module statuses", () => {
    const t = reviewTotals([a, b]);
    expect(t.schools).toBe(2);
    expect(t.schoolsBehind).toBe(2);
    expect(t.incomplete).toBeGreaterThanOrEqual(1);
  });
});

describe("needsReviewSheet", () => {
  it("keeps the workbook's three header rows and 21 columns", () => {
    const { rows, merges } = needsReviewSheet([school({ teachers: 4, class_record_teachers: 1 })]);
    expect(rows).toHaveLength(4);
    for (const r of rows) expect(r).toHaveLength(21);
    expect(rows[0][0]).toBe("School Name");
    expect(rows[3][14]).toBe("25.0%");
    expect(rows[3][20]).toBe("No programme");
    // No two merges overlap.
    const cells = new Set<string>();
    for (const m of merges)
      for (let r = m.s.r; r <= m.e.r; r++)
        for (let c = m.s.c; c <= m.e.c; c++) {
          const k = `${r},${c}`;
          expect(cells.has(k)).toBe(false);
          cells.add(k);
        }
  });

  it("covers every module", () => {
    expect(MODULE_KEYS).toHaveLength(9);
  });
});
