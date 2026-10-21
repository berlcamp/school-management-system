import { describe, expect, it } from "vitest";
import {
  DEPARTMENT_HEAD_EDITABLE_SUBJECT_FIELDS,
  pickDepartmentHeadSubjectUpdate,
} from "../subjectEditScope";

describe("pickDepartmentHeadSubjectUpdate", () => {
  it("keeps only code, name and description", () => {
    expect(
      pickDepartmentHeadSubjectUpdate({
        code: "M7",
        name: "Math 7",
        description: "x",
        is_madrasah: true,
        grade_level: 7,
      }),
    ).toEqual({ code: "M7", name: "Math 7", description: "x" });
  });

  it("keeps a null description and omits absent fields", () => {
    expect(pickDepartmentHeadSubjectUpdate({ name: "A", description: null }))
      .toEqual({ name: "A", description: null });
  });

  it("lists exactly the three editable fields", () => {
    expect([...DEPARTMENT_HEAD_EDITABLE_SUBJECT_FIELDS]).toEqual([
      "code",
      "name",
      "description",
    ]);
  });
});
