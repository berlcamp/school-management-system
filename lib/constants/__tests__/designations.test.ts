import { describe, expect, it } from "vitest";
import {
  DESIGNATION_LABELS,
  STAFF_DESIGNATIONS,
  canBeDesignated,
  canManageDesignations,
  designationNeeds,
  isSubjectRosterRole,
} from "../designations";

describe("designations", () => {
  it("says what each designation needs", () => {
    expect(designationNeeds("department_head")).toBe("subjects");
    expect(designationNeeds("grade_level_coordinator")).toBe("grade_levels");
    expect(designationNeeds("aral_coordinator")).toBeNull();
    expect(designationNeeds("reading_coordinator")).toBeNull();
  });

  it("only lets login-capable staff be designated", () => {
    expect(canBeDesignated("teacher")).toBe(true);
    expect(canBeDesignated("security_guard")).toBe(false);
    expect(canBeDesignated(null)).toBe(false);
  });

  it("limits who manages designations", () => {
    expect(canManageDesignations("admin")).toBe(true);
    expect(canManageDesignations("school_head")).toBe(true);
    expect(canManageDesignations("teacher")).toBe(false);
    expect(canManageDesignations(undefined)).toBe(false);
  });

  it("labels every designation", () => {
    for (const d of STAFF_DESIGNATIONS) {
      expect(DESIGNATION_LABELS[d]).toBeTruthy();
    }
  });

  it("mirrors the subject write roster", () => {
    expect(isSubjectRosterRole("registrar")).toBe(true);
    expect(isSubjectRosterRole("teacher")).toBe(false);
    expect(isSubjectRosterRole(null)).toBe(false);
  });
});
