import { describe, expect, it } from "vitest";
import {
  NOT_ANSWERED_CODE,
  SpecializationStaff,
  buildSpecializationCounts,
  isIncomplete,
  partLabel,
  specializationExportRows,
} from "../employeeSpecialization";

const person = (o: Partial<SpecializationStaff>): SpecializationStaff => ({
  id: 1, name: "A", gender: null, type: "teacher", school_id: 1,
  school_name: "S1", undergrad_major: null, graduate_major: null,
  learning_area: null, ...o,
});

describe("buildSpecializationCounts", () => {
  const staff = [
    person({ id: 1, gender: "male", undergrad_major: "bsed_math" }),
    person({ id: 2, gender: "female", undergrad_major: "bsed_math" }),
    person({ id: 3, gender: null, undergrad_major: "other:AB Psych" }),
    person({ id: 4, gender: "female", undergrad_major: "other:BS Bio" }),
    person({ id: 5, gender: "male" }),
    person({ id: 6, gender: "female", undergrad_major: "general" }),
  ];

  it("counts by sex, groups every Other together, puts unanswered last", () => {
    const rows = buildSpecializationCounts(staff, "undergrad");
    expect(rows.map((r) => r.code)).toEqual([
      "general", "bsed_math", "other", NOT_ANSWERED_CODE,
    ]);
    const math = rows.find((r) => r.code === "bsed_math")!;
    expect([math.male, math.female, math.unrecorded, math.total]).toEqual([1, 1, 0, 2]);
    const other = rows.find((r) => r.code === "other")!;
    expect([other.female, other.unrecorded, other.total]).toEqual([1, 1, 2]);
    expect(rows.reduce((s, r) => s + r.total, 0)).toBe(staff.length);
  });

  it("keeps an unlisted stored code as its own row, before Other", () => {
    const rows = buildSpecializationCounts(
      [person({ undergrad_major: "retired_code" }), person({ id: 2, undergrad_major: "other:x" })],
      "undergrad",
    );
    expect(rows.map((r) => r.code)).toEqual(["retired_code", "other"]);
    expect(rows[0].label).toBe("retired_code");
  });

  it("reads part 3 from learning_area", () => {
    const rows = buildSpecializationCounts(
      [person({ learning_area: "math" }), person({ id: 2, learning_area: "general" })],
      "work",
    );
    expect(rows.map((r) => r.code)).toEqual(["general", "math"]);
    expect(rows[1].label).toBe("Mathematics");
  });
});

describe("roster helpers", () => {
  it("incomplete when any part is blank", () => {
    expect(isIncomplete(person({ undergrad_major: "general", graduate_major: "none", learning_area: "math" }))).toBe(false);
    expect(isIncomplete(person({ undergrad_major: "general", graduate_major: "none" }))).toBe(true);
  });

  it("labels Other with the typed text", () => {
    expect(partLabel("graduate", person({ graduate_major: "other:MA Psych" }))).toBe("Other: MA Psych");
  });

  it("export carries School only division-wide", () => {
    const p = person({ undergrad_major: "bsed_math", gender: "male" });
    expect(Object.keys(specializationExportRows([p], true)[0])).toContain("School");
    expect(Object.keys(specializationExportRows([p], false)[0])).not.toContain("School");
    expect(specializationExportRows([p], false)[0]["Sex"]).toBe("Male");
  });
});
