import { describe, expect, it } from "vitest";
import {
  MODULE_KEYS,
  averageProgress,
  formatProgress,
  moduleResult,
  needsReviewSheet,
  normalizeNeedsReviewRow,
  reviewGroups,
  reviewTotals,
  schoolProgress,
  sortSchoolProgress,
} from "@/lib/utils/needsReview";

const school = (over: Record<string, unknown>) =>
  normalizeNeedsReviewRow({ school_id: 1, school_name: "A School", district: null, ...over });

describe("schoolProgress", () => {
  it("is zero for a school with nothing encoded, leaving out what does not apply", () => {
    const row = schoolProgress(school({}));
    expect(row.percent).toBe(0);
    // Every ratio module has a zero denominator: Books, Examinations and SBFP remain.
    expect(row.applicableModules).toBe(3);
    expect(row.completeModules).toBe(0);
  });

  it("averages ratio, partial-part and SBFP progress with equal weight", () => {
    const row = schoolProgress(
      school({
        books_total: 10, // 1 of 2 parts: 50
        tos_count: 1,
        summative_exams: 1,
        item_analyses: 1, // 100
        learners: 40,
        learners_measured: 10, // 25
        sbfp_program: true, // opened, no beneficiaries: 50
      }),
    );
    expect(row.applicableModules).toBe(4);
    expect(row.completeModules).toBe(1);
    expect(row.percent).toBe((50 + 100 + 25 + 50) / 4);
  });

  it("reaches 100 only when every applicable module is complete", () => {
    const done = {
      books_total: 1,
      books_allocated: 1,
      tos_count: 1,
      summative_exams: 1,
      item_analyses: 1,
      sbfp_program: true,
      sbfp_beneficiaries: 1,
    };
    expect(schoolProgress(school(done)).percent).toBe(100);
    expect(schoolProgress(school({ ...done, rooms: 2, rooms_complete: 1 })).percent).toBeLessThan(100);
  });

  it("caps a module that counts more done than expected", () => {
    expect(moduleResult(school({ learners: 10, learners_measured: 12 }), "health").progress).toBe(100);
  });
});

describe("progress display and order", () => {
  it("never rounds an unfinished school up to 100%, nor a started one down to 0%", () => {
    expect(formatProgress(99.6)).toBe("99%");
    expect(formatProgress(100)).toBe("100%");
    expect(formatProgress(0.2)).toBe("1%");
    expect(formatProgress(0)).toBe("0%");
    expect(formatProgress(72.5)).toBe("73%");
  });

  it("sorts lowest, highest and by name, breaking ties by name", () => {
    const row = (school_name: string, books_total: number) =>
      schoolProgress(school({ school_name, books_total, learners: 4, learners_measured: books_total }));
    const rows = [row("Cedar", 4), row("Birch", 0), row("Aspen", 0)];
    const names = (sort: "lowest" | "highest" | "name") =>
      sortSchoolProgress(rows, sort).map((r) => r.school.school_name);
    expect(names("lowest")).toEqual(["Aspen", "Birch", "Cedar"]);
    expect(names("highest")).toEqual(["Cedar", "Aspen", "Birch"]);
    expect(names("name")).toEqual(["Aspen", "Birch", "Cedar"]);
  });

  it("averages schools equally and is zero with none", () => {
    expect(averageProgress([])).toBe(0);
    const rows = [{ percent: 20 }, { percent: 60 }].map((r) => ({ ...schoolProgress(school({})), ...r }));
    expect(averageProgress(rows)).toBe(40);
  });
});

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
