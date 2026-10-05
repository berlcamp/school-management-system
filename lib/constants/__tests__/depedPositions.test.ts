import { describe, expect, it } from "vitest";
import { DEPED_POSITION_GROUPS, matchDepedPosition } from "../depedPositions";
import { TEACHER_POSITIONS } from "../teacherPositions";
import { suggestCareerStage } from "../supervision";

const all = DEPED_POSITION_GROUPS.flatMap((g) => g.positions);

describe("DEPED_POSITION_GROUPS", () => {
  it("lists every position once", () => {
    expect(new Set(all).size).toBe(all.length);
  });

  it("starts with the plantilla teacher positions, unchanged", () => {
    expect(DEPED_POSITION_GROUPS[0].positions).toEqual(TEACHER_POSITIONS);
  });

  it("carries the common school leadership and non-teaching items", () => {
    for (const p of [
      "Head Teacher I",
      "School Principal I",
      "Assistant School Principal I",
      "Administrative Officer II",
      "Administrative Assistant II",
      "Nurse II",
      "Special Science Teacher I",
    ]) {
      expect(all).toContain(p);
    }
  });

  it("teacher items still suggest a COT career stage", () => {
    expect(suggestCareerStage("Teacher III")).not.toBeNull();
    expect(suggestCareerStage("Master Teacher I")).not.toBeNull();
  });
});

describe("matchDepedPosition", () => {
  it.each([
    ["TEACHER III", "Teacher III"],
    ["Teacher 1", "Teacher I"],
    ["Teacher-I", "Teacher I"],
    ["MASTER TEACHER-I", "Master Teacher I"],
    ["PRINCIPAL I", "School Principal I"],
    ["school principal ii", "School Principal II"],
    ["ADMINISTRATIVE OFFICER II", "Administrative Officer II"],
    ["AO II", "Administrative Officer II"],
    ["ADAS II", "Administrative Assistant II"],
    ["Head Teacher 2", "Head Teacher II"],
  ])("%s → %s", (typed, listed) => {
    expect(matchDepedPosition(typed)).toBe(listed);
  });

  it.each(["ICT Coordinator", "Alive Teacher", "", null])(
    "leaves %s unmatched",
    (typed) => {
      expect(matchDepedPosition(typed)).toBeNull();
    },
  );

  it("does not read Head Teacher I as Teacher I", () => {
    expect(matchDepedPosition("Head Teacher I")).toBe("Head Teacher I");
  });
});
