import { describe, expect, it } from "vitest";
import { GpaThresholds } from "../gpaThresholds";
import {
  autoAssignSection,
  batchAutoAssignSections,
  classifyGpaBucket,
  DEFAULT_ASSIGNMENT_CONFIG,
  GpaDistribution,
  SectionCandidate,
  SectionSuggestion,
  scoreCapacity,
  scoreGenderBalance,
  scoreGpaDistribution,
  scoreSectionTypeMatch,
  StudentInput,
  suggestSections,
} from "../sectionAssignment";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const THRESHOLDS: GpaThresholds = {
  homogeneous_fast_learner: { minGpa: 90 },
  homogeneous_crack_section: { maxGpa: 75 },
  heterogeneous: true,
  homogeneous_random: true,
};

function makeSection(overrides: Partial<SectionCandidate> & { id: string }): SectionCandidate {
  return {
    name: `Section-${overrides.id}`,
    sectionType: null,
    maxStudents: 40,
    enrolledCount: 0,
    maleCount: 0,
    femaleCount: 0,
    gpaDistribution: { high: 0, mid: 0, low: 0, unknown: 0 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// classifyGpaBucket
// ---------------------------------------------------------------------------

describe("classifyGpaBucket", () => {
  it("returns 'high' for GPA >= fast_learner_min", () => {
    expect(classifyGpaBucket(95, THRESHOLDS)).toBe("high");
    expect(classifyGpaBucket(90, THRESHOLDS)).toBe("high");
  });

  it("returns 'low' for GPA < crack_section_max", () => {
    expect(classifyGpaBucket(74, THRESHOLDS)).toBe("low");
    expect(classifyGpaBucket(50, THRESHOLDS)).toBe("low");
  });

  it("returns 'mid' for GPA in between", () => {
    expect(classifyGpaBucket(75, THRESHOLDS)).toBe("mid");
    expect(classifyGpaBucket(89, THRESHOLDS)).toBe("mid");
  });

  it("returns 'unknown' for null", () => {
    expect(classifyGpaBucket(null, THRESHOLDS)).toBe("unknown");
    expect(classifyGpaBucket(undefined, THRESHOLDS)).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// scoreSectionTypeMatch
// ---------------------------------------------------------------------------

describe("scoreSectionTypeMatch", () => {
  it("returns 1.0 when GPA matches section type", () => {
    expect(scoreSectionTypeMatch("homogeneous_fast_learner", 95, THRESHOLDS)).toBe(1.0);
    expect(scoreSectionTypeMatch("homogeneous_crack_section", 70, THRESHOLDS)).toBe(1.0);
    expect(scoreSectionTypeMatch("heterogeneous", 85, THRESHOLDS)).toBe(1.0);
  });

  it("returns 0.0 when GPA does not match", () => {
    expect(scoreSectionTypeMatch("homogeneous_fast_learner", 70, THRESHOLDS)).toBe(0.0);
    expect(scoreSectionTypeMatch("homogeneous_crack_section", 80, THRESHOLDS)).toBe(0.0);
  });

  it("returns 1.0 for null section type", () => {
    expect(scoreSectionTypeMatch(null, 50, THRESHOLDS)).toBe(1.0);
  });

  it("returns 1.0 for null GPA (accepts anyone)", () => {
    expect(scoreSectionTypeMatch("homogeneous_fast_learner", null, THRESHOLDS)).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// scoreGenderBalance
// ---------------------------------------------------------------------------

describe("scoreGenderBalance", () => {
  it("returns 0.5 when gender data is unavailable", () => {
    expect(scoreGenderBalance(undefined, undefined, "male")).toBe(0.5);
    expect(scoreGenderBalance(10, 10, null)).toBe(0.5);
  });

  it("returns 1.0 for empty section", () => {
    expect(scoreGenderBalance(0, 0, "male")).toBe(1.0);
  });

  it("returns 1.0 when adding a student creates perfect balance", () => {
    // 1 male, 0 female → add female → 1M:1F = 0.5 ratio
    expect(scoreGenderBalance(1, 0, "female")).toBe(1.0);
  });

  it("returns high score when improving balance", () => {
    // 10M, 5F → add female → 10M:6F → ratio = 10/16 = 0.625 → dev = 0.125 → score = 0.75
    const score = scoreGenderBalance(10, 5, "female");
    expect(score).toBeGreaterThan(0.5);
  });

  it("returns low score when worsening balance", () => {
    // 10M, 5F → add male → 11M:5F → ratio = 11/16 = 0.6875 → dev = 0.1875 → score = 0.625
    const worseScore = scoreGenderBalance(10, 5, "male");
    const betterScore = scoreGenderBalance(10, 5, "female");
    expect(betterScore).toBeGreaterThan(worseScore);
  });

  it("handles extreme imbalance", () => {
    // 30M, 0F → add female → 30M:1F → ratio = 30/31 ≈ 0.968 → low score
    const score = scoreGenderBalance(30, 0, "female");
    expect(score).toBeLessThan(0.15);
  });
});

// ---------------------------------------------------------------------------
// scoreGpaDistribution
// ---------------------------------------------------------------------------

describe("scoreGpaDistribution", () => {
  it("returns 0.5 when distribution is undefined", () => {
    expect(scoreGpaDistribution(undefined, "mid", true)).toBe(0.5);
  });

  it("returns 0.5 for unknown bucket", () => {
    const dist: GpaDistribution = { high: 5, mid: 5, low: 5, unknown: 0 };
    expect(scoreGpaDistribution(dist, "unknown", true)).toBe(0.5);
  });

  it("returns 0.75 for empty section", () => {
    const dist: GpaDistribution = { high: 0, mid: 0, low: 0, unknown: 0 };
    expect(scoreGpaDistribution(dist, "mid", true)).toBe(0.75);
  });

  describe("heterogeneous", () => {
    it("scores higher when adding to the smallest bucket", () => {
      const dist: GpaDistribution = { high: 10, mid: 10, low: 5, unknown: 0 };
      const addLow = scoreGpaDistribution(dist, "low", true);
      const addHigh = scoreGpaDistribution(dist, "high", true);
      expect(addLow).toBeGreaterThan(addHigh);
    });

    it("scores highest for perfectly balanced distribution", () => {
      const dist: GpaDistribution = { high: 10, mid: 10, low: 10, unknown: 0 };
      const score = scoreGpaDistribution(dist, "mid", true);
      // Adding to any bucket when balanced should still be high
      expect(score).toBeGreaterThan(0.8);
    });
  });

  describe("homogeneous", () => {
    it("returns 1.0 when student bucket matches dominant", () => {
      const dist: GpaDistribution = { high: 20, mid: 3, low: 2, unknown: 0 };
      expect(scoreGpaDistribution(dist, "high", false)).toBe(1.0);
    });

    it("returns 0.2 when student bucket does not match dominant", () => {
      const dist: GpaDistribution = { high: 20, mid: 3, low: 2, unknown: 0 };
      expect(scoreGpaDistribution(dist, "low", false)).toBe(0.2);
    });
  });
});

// ---------------------------------------------------------------------------
// scoreCapacity
// ---------------------------------------------------------------------------

describe("scoreCapacity", () => {
  it("returns 1.0 for empty section", () => {
    expect(scoreCapacity(0, 40)).toBe(1.0);
  });

  it("returns 0.5 for half-full section", () => {
    expect(scoreCapacity(20, 40)).toBe(0.5);
  });

  it("returns 0.0 for full section", () => {
    expect(scoreCapacity(40, 40)).toBe(0.0);
  });

  it("returns 1.0 for null maxStudents (unlimited)", () => {
    expect(scoreCapacity(100, null)).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// suggestSections
// ---------------------------------------------------------------------------

describe("suggestSections", () => {
  it("returns empty array when all sections are full", () => {
    const sections = [
      makeSection({ id: "1", maxStudents: 10, enrolledCount: 10 }),
      makeSection({ id: "2", maxStudents: 10, enrolledCount: 10 }),
    ];
    const result = suggestSections(
      { studentId: "s1", gpa: 85, gender: "male" },
      sections,
      THRESHOLDS
    );
    expect(result).toHaveLength(0);
  });

  it("excludes full sections from results", () => {
    const sections = [
      makeSection({ id: "1", maxStudents: 10, enrolledCount: 10 }),
      makeSection({ id: "2", maxStudents: 40, enrolledCount: 5 }),
    ];
    const result = suggestSections(
      { studentId: "s1", gpa: 85, gender: "male" },
      sections,
      THRESHOLDS
    );
    expect(result).toHaveLength(1);
    expect(result[0].sectionId).toBe("2");
  });

  it("ranks sections by score descending", () => {
    const sections = [
      makeSection({
        id: "1",
        sectionType: "heterogeneous",
        enrolledCount: 30,
        maxStudents: 40,
        maleCount: 15,
        femaleCount: 15,
        gpaDistribution: { high: 10, mid: 10, low: 10, unknown: 0 },
      }),
      makeSection({
        id: "2",
        sectionType: "heterogeneous",
        enrolledCount: 5,
        maxStudents: 40,
        maleCount: 1,
        femaleCount: 4,
        gpaDistribution: { high: 2, mid: 2, low: 1, unknown: 0 },
      }),
    ];
    const result = suggestSections(
      { studentId: "s1", gpa: 85, gender: "male" },
      sections,
      THRESHOLDS
    );
    expect(result.length).toBe(2);
    expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
  });

  it("prefers sections that improve gender balance", () => {
    // Two heterogeneous sections: one male-heavy, one female-heavy
    const sections = [
      makeSection({
        id: "male_heavy",
        sectionType: "heterogeneous",
        enrolledCount: 20,
        maleCount: 15,
        femaleCount: 5,
        gpaDistribution: { high: 7, mid: 7, low: 6, unknown: 0 },
      }),
      makeSection({
        id: "female_heavy",
        sectionType: "heterogeneous",
        enrolledCount: 20,
        maleCount: 5,
        femaleCount: 15,
        gpaDistribution: { high: 7, mid: 7, low: 6, unknown: 0 },
      }),
    ];

    // Adding a male student should prefer female-heavy section
    const result = suggestSections(
      { studentId: "s1", gpa: 85, gender: "male" },
      sections,
      THRESHOLDS
    );
    expect(result[0].sectionId).toBe("female_heavy");

    // Adding a female student should prefer male-heavy section
    const result2 = suggestSections(
      { studentId: "s2", gpa: 85, gender: "female" },
      sections,
      THRESHOLDS
    );
    expect(result2[0].sectionId).toBe("male_heavy");
  });

  it("prefers matching section type for homogeneous sections", () => {
    const sections = [
      makeSection({
        id: "fast",
        sectionType: "homogeneous_fast_learner",
        enrolledCount: 10,
        maleCount: 5,
        femaleCount: 5,
        gpaDistribution: { high: 10, mid: 0, low: 0, unknown: 0 },
      }),
      makeSection({
        id: "hetero",
        sectionType: "heterogeneous",
        enrolledCount: 10,
        maleCount: 5,
        femaleCount: 5,
        gpaDistribution: { high: 3, mid: 4, low: 3, unknown: 0 },
      }),
    ];

    // High GPA student should prefer fast learner section
    const result = suggestSections(
      { studentId: "s1", gpa: 95, gender: "male" },
      sections,
      THRESHOLDS
    );
    expect(result[0].sectionId).toBe("fast");
  });

  it("provides score breakdown for each suggestion", () => {
    const sections = [makeSection({ id: "1", sectionType: "heterogeneous" })];
    const result = suggestSections(
      { studentId: "s1", gpa: 85, gender: "male" },
      sections,
      THRESHOLDS
    );
    expect(result[0].breakdown).toHaveProperty("sectionTypeMatch");
    expect(result[0].breakdown).toHaveProperty("genderBalance");
    expect(result[0].breakdown).toHaveProperty("gpaDistribution");
    expect(result[0].breakdown).toHaveProperty("capacityAvailability");
  });

  it("is deterministic — same input always produces same output", () => {
    const sections = [
      makeSection({ id: "1", sectionType: "heterogeneous", enrolledCount: 10, maleCount: 5, femaleCount: 5 }),
      makeSection({ id: "2", sectionType: "heterogeneous", enrolledCount: 10, maleCount: 5, femaleCount: 5 }),
    ];
    const student: StudentInput = { studentId: "s1", gpa: 85, gender: "male" };

    const r1 = suggestSections(student, sections, THRESHOLDS);
    const r2 = suggestSections(student, sections, THRESHOLDS);
    expect(r1.map((s) => s.sectionId)).toEqual(r2.map((s) => s.sectionId));
    expect(r1.map((s) => s.score)).toEqual(r2.map((s) => s.score));
  });
});

// ---------------------------------------------------------------------------
// autoAssignSection (backward compatibility)
// ---------------------------------------------------------------------------

describe("autoAssignSection", () => {
  it("works with the old 3-argument signature", () => {
    const sections = [
      makeSection({ id: "1", enrolledCount: 5 }),
      makeSection({ id: "2", enrolledCount: 10 }),
    ];
    const result = autoAssignSection(85, sections, THRESHOLDS);
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  it("returns null when all sections are full", () => {
    const sections = [
      makeSection({ id: "1", maxStudents: 5, enrolledCount: 5 }),
    ];
    expect(autoAssignSection(85, sections, THRESHOLDS)).toBeNull();
  });

  it("respects countOverrides", () => {
    const sections = [
      makeSection({ id: "1", maxStudents: 10, enrolledCount: 5 }),
    ];
    const overrides = new Map([["1", 10]]); // Mark as full via override
    expect(autoAssignSection(85, sections, THRESHOLDS, overrides)).toBeNull();
  });

  it("uses gender when provided", () => {
    const sections = [
      makeSection({ id: "male_heavy", sectionType: "heterogeneous", enrolledCount: 20, maleCount: 15, femaleCount: 5 }),
      makeSection({ id: "balanced", sectionType: "heterogeneous", enrolledCount: 20, maleCount: 10, femaleCount: 10 }),
    ];
    // Adding a male should avoid the male-heavy section
    const result = autoAssignSection(
      85,
      sections,
      THRESHOLDS,
      undefined,
      "male"
    );
    expect(result).toBe("balanced");
  });
});

// ---------------------------------------------------------------------------
// batchAutoAssignSections
// ---------------------------------------------------------------------------

describe("batchAutoAssignSections", () => {
  it("assigns all students when capacity allows", () => {
    const sections = [
      makeSection({ id: "1", maxStudents: 40 }),
      makeSection({ id: "2", maxStudents: 40 }),
    ];
    const students: StudentInput[] = Array.from({ length: 10 }, (_, i) => ({
      studentId: `s${i}`,
      gpa: 80 + i,
      gender: i % 2 === 0 ? ("male" as const) : ("female" as const),
    }));

    const result = batchAutoAssignSections(students, sections, THRESHOLDS);
    expect(result.size).toBe(10);
  });

  it("does not exceed section capacity", () => {
    const sections = [
      makeSection({ id: "1", maxStudents: 3 }),
      makeSection({ id: "2", maxStudents: 3 }),
    ];
    const students: StudentInput[] = Array.from({ length: 8 }, (_, i) => ({
      studentId: `s${i}`,
      gpa: 85,
      gender: "male" as const,
    }));

    const result = batchAutoAssignSections(students, sections, THRESHOLDS);
    // Only 6 can be assigned (3 + 3)
    expect(result.size).toBe(6);

    // Verify no section has more than 3
    const counts = new Map<string, number>();
    for (const sectionId of result.values()) {
      counts.set(sectionId, (counts.get(sectionId) ?? 0) + 1);
    }
    for (const count of counts.values()) {
      expect(count).toBeLessThanOrEqual(3);
    }
  });

  it("distributes students across sections when capacity is limited", () => {
    // Use small capacity to force distribution via capacity scoring
    const sections = [
      makeSection({ id: "1", sectionType: "heterogeneous", maxStudents: 10 }),
      makeSection({ id: "2", sectionType: "heterogeneous", maxStudents: 10 }),
    ];

    const students: StudentInput[] = Array.from({ length: 16 }, (_, i) => ({
      studentId: `s${i}`,
      gpa: 85,
      gender: (i % 2 === 0 ? "male" : "female") as "male" | "female",
    }));

    const result = batchAutoAssignSections(students, sections, THRESHOLDS);
    expect(result.size).toBe(16);

    // Both sections should have students
    const perSection = new Map<string, number>();
    for (const sectionId of result.values()) {
      perSection.set(sectionId, (perSection.get(sectionId) ?? 0) + 1);
    }
    expect(perSection.size).toBe(2);
    for (const count of perSection.values()) {
      expect(count).toBeGreaterThanOrEqual(6);
      expect(count).toBeLessThanOrEqual(10);
    }
  });

  it("distributes GPA across heterogeneous sections", () => {
    const sections = [
      makeSection({ id: "1", sectionType: "heterogeneous", maxStudents: 40 }),
      makeSection({ id: "2", sectionType: "heterogeneous", maxStudents: 40 }),
    ];

    // Interleave high, mid, low GPA students for realistic enrollment order
    const students: StudentInput[] = [];
    for (let i = 0; i < 6; i++) {
      students.push({ studentId: `h${i}`, gpa: 92 + i, gender: i % 2 === 0 ? "male" : "female" });
      students.push({ studentId: `m${i}`, gpa: 80 + i, gender: i % 2 === 0 ? "male" : "female" });
      students.push({ studentId: `l${i}`, gpa: 65 + i, gender: i % 2 === 0 ? "male" : "female" });
    }

    const result = batchAutoAssignSections(students, sections, THRESHOLDS);
    expect(result.size).toBe(18);

    // Students should be distributed across both sections
    const perSection = new Map<string, number>();
    for (const sectionId of result.values()) {
      perSection.set(sectionId, (perSection.get(sectionId) ?? 0) + 1);
    }
    expect(perSection.size).toBe(2);
    // Each section should have a meaningful share of students
    for (const count of perSection.values()) {
      expect(count).toBeGreaterThanOrEqual(5);
    }
  });

  it("groups similar GPAs in homogeneous sections", () => {
    const sections = [
      makeSection({
        id: "fast",
        sectionType: "homogeneous_fast_learner",
        maxStudents: 40,
      }),
      makeSection({
        id: "crack",
        sectionType: "homogeneous_crack_section",
        maxStudents: 40,
      }),
    ];

    const students: StudentInput[] = [
      { studentId: "high1", gpa: 95, gender: "male" },
      { studentId: "high2", gpa: 92, gender: "female" },
      { studentId: "low1", gpa: 70, gender: "male" },
      { studentId: "low2", gpa: 65, gender: "female" },
    ];

    const result = batchAutoAssignSections(students, sections, THRESHOLDS);
    expect(result.get("high1")).toBe("fast");
    expect(result.get("high2")).toBe("fast");
    expect(result.get("low1")).toBe("crack");
    expect(result.get("low2")).toBe("crack");
  });

  it("falls back when no matching section type exists", () => {
    const sections = [
      makeSection({ id: "1", sectionType: "heterogeneous", maxStudents: 40 }),
    ];

    // High GPA student but no fast learner section → should still be assigned
    const students: StudentInput[] = [
      { studentId: "s1", gpa: 95, gender: "male" },
    ];

    const result = batchAutoAssignSections(students, sections, THRESHOLDS);
    expect(result.size).toBe(1);
    expect(result.get("s1")).toBe("1");
  });

  it("handles students with null GPA", () => {
    const sections = [
      makeSection({ id: "1", maxStudents: 40 }),
    ];
    const students: StudentInput[] = [
      { studentId: "s1", gpa: null, gender: "male" },
    ];

    const result = batchAutoAssignSections(students, sections, THRESHOLDS);
    expect(result.size).toBe(1);
  });

  it("handles students with null gender", () => {
    const sections = [
      makeSection({ id: "1", maxStudents: 40 }),
    ];
    const students: StudentInput[] = [
      { studentId: "s1", gpa: 85, gender: null },
    ];

    const result = batchAutoAssignSections(students, sections, THRESHOLDS);
    expect(result.size).toBe(1);
  });

  it("distributes evenly when sections have no maxStudents (null) and students share same GPA bucket", () => {
    // Reproduces the reported bug: without maxStudents, capacity is always 1.0,
    // so all scores tie after the first round and the alphabetically first section
    // gets all remaining students. Fix: tie-break by effectiveCount (fewest first).
    const sections = [
      makeSection({ id: "Adelfa", name: "Adelfa", sectionType: "heterogeneous", maxStudents: null }),
      makeSection({ id: "Camia", name: "Camia", sectionType: "heterogeneous", maxStudents: null }),
      makeSection({ id: "Rosa", name: "Rosa", sectionType: "heterogeneous", maxStudents: null }),
    ];

    // 30 students all in the same GPA bucket (mid), all same gender (male)
    // — worst-case for the old alphabetical tie-breaking
    const students: StudentInput[] = Array.from({ length: 30 }, (_, i) => ({
      studentId: `s${i}`,
      gpa: 82,
      gender: "male" as const,
    }));

    const result = batchAutoAssignSections(students, sections, THRESHOLDS);
    expect(result.size).toBe(30);

    const perSection = new Map<string, number>();
    for (const sectionId of result.values()) {
      perSection.set(sectionId, (perSection.get(sectionId) ?? 0) + 1);
    }

    expect(perSection.size).toBe(3);
    for (const count of perSection.values()) {
      // Each section should get roughly 10 students (30/3), allow ±1
      expect(count).toBeGreaterThanOrEqual(9);
      expect(count).toBeLessThanOrEqual(11);
    }
  });

  it("distributes evenly across 4 heterogeneous sections with null maxStudents and null GPA/gender", () => {
    const sections = [
      makeSection({ id: "A", name: "A", sectionType: "heterogeneous", maxStudents: null }),
      makeSection({ id: "B", name: "B", sectionType: "heterogeneous", maxStudents: null }),
      makeSection({ id: "C", name: "C", sectionType: "heterogeneous", maxStudents: null }),
      makeSection({ id: "D", name: "D", sectionType: "heterogeneous", maxStudents: null }),
    ];

    const students: StudentInput[] = Array.from({ length: 40 }, (_, i) => ({
      studentId: `s${i}`,
      gpa: null,
      gender: null,
    }));

    const result = batchAutoAssignSections(students, sections, THRESHOLDS);
    expect(result.size).toBe(40);

    const perSection = new Map<string, number>();
    for (const sectionId of result.values()) {
      perSection.set(sectionId, (perSection.get(sectionId) ?? 0) + 1);
    }

    expect(perSection.size).toBe(4);
    for (const count of perSection.values()) {
      expect(count).toBe(10);
    }
  });
});
