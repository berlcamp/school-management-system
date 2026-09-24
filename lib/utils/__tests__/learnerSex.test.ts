import { describe, expect, it } from "vitest";
import {
  groupLearnersBySex,
  learnerSexKey,
  sortLearnersBySex,
  startsSexGroup,
} from "../learnerSex";

type Row = { name: string; gender: string | null };
const rows: Row[] = [
  { name: "Abad", gender: "female" },
  { name: "Bautista", gender: "male" },
  { name: "Cruz", gender: null },
  { name: "Dela Cruz", gender: "Male" },
  { name: "Esteban", gender: "F" },
];

describe("learnerSex", () => {
  it("normalises the recorded value", () => {
    expect(learnerSexKey("M")).toBe("male");
    expect(learnerSexKey(" Female ")).toBe("female");
    expect(learnerSexKey("")).toBe("unspecified");
    expect(learnerSexKey(undefined)).toBe("unspecified");
  });

  it("groups male first, female second, keeping input order", () => {
    const groups = groupLearnersBySex(rows, (r) => r.gender);
    expect(groups.map((g) => g.label)).toEqual(["MALE", "FEMALE", "UNSPECIFIED"]);
    expect(groups[0].rows.map((r) => r.name)).toEqual(["Bautista", "Dela Cruz"]);
    expect(groups[1].rows.map((r) => r.name)).toEqual(["Abad", "Esteban"]);
  });

  it("always emits MALE and FEMALE, omits an empty UNSPECIFIED", () => {
    const groups = groupLearnersBySex([] as Row[], (r) => r.gender);
    expect(groups.map((g) => g.key)).toEqual(["male", "female"]);
  });

  it("flags group starts in a sorted flat list", () => {
    const sorted = sortLearnersBySex(rows, (r) => r.gender);
    const starts = sorted.map((_, i) => startsSexGroup(sorted, i, (r) => r.gender));
    expect(starts).toEqual([true, false, true, false, true]);
  });
});
