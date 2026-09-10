import { describe, expect, it } from "vitest";
import {
  computeItemMastery,
  computeMps,
  mpsRollupRow,
  passingRate,
  summarizeMpsRollup,
  type ItemStat,
} from "@/lib/utils/itemAnalysis";

/**
 * The figures below are one real return off the division's Item Analysis /
 * MPS workbook (Intro to the Philosophy of the Human Person, Q1): four
 * sections, and the per-item correct-response counts of the first one.
 */
const CORRECT_RESPONSES = [
  15, 15, 16, 11, 14, 13, 15, 14, 15, 16, 12, 14, 10, 15, 11, 14, 12, 14, 13,
  12, 12, 10, 13, 11, 13, 12, 13, 12, 11, 11, 13, 12, 9, 11, 10, 8, 12, 11, 10,
  12, 14, 13, 12, 13, 11, 13, 14, 14, 15, 16,
];
const EXAMINEES = 20;

const itemStats = (correct: number[], total: number): ItemStat[] =>
  correct.map((c, i) => ({
    itemNumber: i + 1,
    correct: c,
    total,
    difficulty: 0,
    difficultyLabel: "",
    discrimination: 0,
    discriminationLabel: "",
    verdict: "Retain" as const,
  }));

describe("computeItemMastery", () => {
  const mastery = computeItemMastery(itemStats(CORRECT_RESPONSES, EXAMINEES), EXAMINEES);

  it("bands each item at 75% / 50% of the examinees", () => {
    // 15 of 20 is exactly 75% -> mastered; 10 is exactly 50% -> nearing.
    expect(mastery.rows[0]).toMatchObject({ correct: 15, tier: "mastered", remark: "PASS" });
    expect(mastery.rows[12]).toMatchObject({ correct: 10, tier: "nearing", remark: "PASS" });
    expect(mastery.rows[35]).toMatchObject({ correct: 8, tier: "not", remark: "REMEDIAL" });
  });

  it("counts the tiers exclusively, so they add up to the item total", () => {
    expect(mastery.mastered).toBe(9);
    expect(mastery.notMastered).toBe(2);
    expect(mastery.mastered + mastery.nearing + mastery.notMastered).toBe(
      CORRECT_RESPONSES.length,
    );
  });

  it("reproduces the workbook's MPS for the section", () => {
    const totalScore = CORRECT_RESPONSES.reduce((s, c) => s + c, 0);
    expect(totalScore).toBe(632);
    expect(computeMps(Array(EXAMINEES).fill(totalScore / EXAMINEES), 50)).toBe(63.2);
  });
});

describe("passingRate", () => {
  it("counts the learners who reached half the items", () => {
    // 25 of 50 is exactly the mark and passes; 24 does not.
    expect(passingRate([25, 24, 10, 0], 50)).toBe(25);
    expect(passingRate([25, 25, 24, 0], 50)).toBe(50);
    expect(passingRate([], 50)).toBe(0);
  });
});

describe("MPS roll-up", () => {
  const rows = [
    { key: "1", sectionName: "12 TVL B", students: 20, items: 50, totalScore: 632 },
    { key: "2", sectionName: "TVL A", students: 32, items: 50, totalScore: 918 },
    { key: "3", sectionName: "TVL B", students: 18, items: 50, totalScore: 557 },
    { key: "4", sectionName: "TVL C", students: 16, items: 40, totalScore: 256 },
  ].map((r) => mpsRollupRow({ ...r, subject: "PHILO" }));

  it("computes each section's MPS and its learner-weighted share", () => {
    expect(rows.map((r) => r.mps)).toEqual([63.2, 57.38, 61.89, 40]);
    expect(rows.map((r) => r.mpsTimesN)).toEqual([12.64, 18.36, 11.14, 6.4]);
  });

  it("weights the General MPS by learners, not by items", () => {
    const totals = summarizeMpsRollup(rows);
    expect(totals.students).toBe(86);
    expect(totals.totalScore).toBe(2363);
    expect(totals.mpsTimesN).toBe(48.54);
    expect(totals.generalMps).toBe(56.44);
  });
});
