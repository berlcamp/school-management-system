import { describe, expect, it } from "vitest";
import { mpsBySex } from "@/lib/utils/mps";
import { aggregateExamMps, groupExamResults } from "@/lib/utils/mpsAggregate";
import { MPS_MARKS, MPS_ROWS } from "./fixtures/mpsRows";

/**
 * Characterization of the aggregation that used to live inline in
 * app/(protected)/mps/page.tsx. The expected values below were produced by
 * running that original inline code over the same fixture rows.
 */
const sexSplit = (row: { id: number | string; total_items: number | string }) =>
  mpsBySex(
    (MPS_MARKS.get(String(row.id)) ?? []).map((m) => ({
      sex: m.sex,
      score: m.correctItems.size,
    })),
    Number(row.total_items)
  );

describe("groupExamResults (moved from /mps page)", () => {
  it("matches the original inline output exactly", () => {
    const out = groupExamResults(MPS_ROWS, sexSplit).map((g) => ({
      key: g.key,
      subjectName: g.subjectName,
      section: g.section,
      gradeLevel: g.gradeLevel,
      quarter: g.quarter,
      mps: g.mps,
      mpsMale: g.mpsMale,
      mpsFemale: g.mpsFemale,
      results: g.results,
    }));
    const ref = (
      resultId: string,
      examId: string,
      subjectName: string,
      gradeLevel: number,
      quarter: number,
      sectionName: string
    ) => ({ resultId, examId, subjectName, gradeLevel, quarter, sectionName });
    expect(out).toEqual([
      {
        key: "Mathematics__100__1",
        subjectName: "Mathematics",
        section: { id: "100", name: "7-A", grade_level: 7 },
        gradeLevel: 7,
        quarter: 1,
        mps: 75.25,
        mpsMale: 75,
        mpsFemale: 60,
        results: [
          ref("1", "11", "Mathematics", 7, 1, "7-A"),
          ref("2", "12", "Mathematics", 7, 1, "7-A"),
        ],
      },
      {
        key: "Mathematics__101__1",
        subjectName: "Mathematics",
        section: { id: "101", name: "7-B", grade_level: 7 },
        gradeLevel: 7,
        quarter: 1,
        mps: 92,
        mpsMale: null,
        mpsFemale: 95,
        results: [ref("3", "11", "Mathematics", 7, 1, "7-B")],
      },
      {
        key: "Mathematics__100__2",
        subjectName: "Mathematics",
        section: { id: "100", name: "7-A", grade_level: 7 },
        gradeLevel: 7,
        quarter: 2,
        mps: 65,
        mpsMale: null,
        mpsFemale: null,
        results: [ref("4", "13", "Mathematics", 7, 2, "7-A")],
      },
      {
        key: "Science__102__1",
        subjectName: "Science",
        section: { id: "102", name: "8-A", grade_level: 8 },
        gradeLevel: 8,
        quarter: 1,
        mps: 77,
        mpsMale: 90,
        mpsFemale: null,
        results: [ref("5", "14", "Science", 8, 1, "8-A")],
      },
      {
        key: "Science__103__3",
        subjectName: "Science",
        section: null,
        gradeLevel: 9,
        quarter: 3,
        mps: 55,
        mpsMale: null,
        mpsFemale: 50,
        results: [ref("6", "15", "Science", 9, 3, "Unknown section")],
      },
    ]);
  });

  it("works without a sex split", () => {
    const out = groupExamResults(MPS_ROWS);
    expect(out.map((g) => [g.mps, g.mpsMale, g.mpsFemale])).toEqual([
      [75.25, null, null],
      [92, null, null],
      [65, null, null],
      [77, null, null],
      [55, null, null],
    ]);
  });
});

describe("aggregateExamMps", () => {
  it("projects the same groups onto MpsGroup, adding the TOS subject id", () => {
    expect(aggregateExamMps(MPS_ROWS)).toEqual([
      { subjectName: "Mathematics", subjectId: "5", sectionId: "100", gradeLevel: 7, period: 1, mps: 75.25 },
      { subjectName: "Mathematics", subjectId: "5", sectionId: "101", gradeLevel: 7, period: 1, mps: 92 },
      { subjectName: "Mathematics", subjectId: "5", sectionId: "100", gradeLevel: 7, period: 2, mps: 65 },
      { subjectName: "Science", subjectId: null, sectionId: "102", gradeLevel: 8, period: 1, mps: 77 },
      { subjectName: "Science", subjectId: null, sectionId: "103", gradeLevel: 9, period: 3, mps: 55 },
    ]);
  });
});
