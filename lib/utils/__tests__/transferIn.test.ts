import { describe, expect, it } from "vitest";

import { movementRemark } from "../enrollmentRemarks";
import { isTransferee, parseCarriedGrade, transferInSchool } from "../transferIn";

const names = new Map([["7", "Bayugan Central ES"]]);

describe("isTransferee", () => {
  it("is false for an ordinary enrolment", () => {
    expect(isTransferee({ origin_school_id: null, transfer_in_school_name: null })).toBe(false);
  });
  it("is true for an in-system transfer", () => {
    expect(isTransferee({ origin_school_id: 7 })).toBe(true);
  });
  it("is true for an out-of-system transfer", () => {
    expect(isTransferee({ transfer_in_school_name: "St. Jude Academy" })).toBe(true);
  });
  it("ignores a blank name", () => {
    expect(isTransferee({ transfer_in_school_name: "   " })).toBe(false);
  });
});

describe("transferInSchool", () => {
  it("prefers the origin school's name", () => {
    expect(transferInSchool({ origin_school_id: 7, transfer_in_school_name: "X" }, names)).toBe(
      "Bayugan Central ES",
    );
  });
  it("falls back when the origin school's name is unknown", () => {
    expect(transferInSchool({ origin_school_id: 99 }, names)).toBe("another school");
  });
  it("returns the trimmed typed name", () => {
    expect(transferInSchool({ transfer_in_school_name: " St. Jude Academy " }, names)).toBe(
      "St. Jude Academy",
    );
  });
  it("returns null for an ordinary enrolment", () => {
    expect(transferInSchool({}, names)).toBeNull();
  });
});

describe("parseCarriedGrade", () => {
  it("treats blank as no grade", () => {
    expect(parseCarriedGrade("  ")).toEqual({ ok: true, grade: null });
  });
  it("accepts whole numbers 60 to 100", () => {
    expect(parseCarriedGrade("60")).toEqual({ ok: true, grade: 60 });
    expect(parseCarriedGrade(" 100 ")).toEqual({ ok: true, grade: 100 });
  });
  it.each(["59", "101", "85.5", "abc", "8 5", "-80"])("refuses %s", (v) => {
    const r = parseCarriedGrade(v);
    expect(r.ok).toBe(false);
  });
});

describe("movementRemark (transfer-in)", () => {
  it("annotates an out-of-system transfer-in", () => {
    expect(
      movementRemark(
        { student_id: 1, enrollment_status: "active", transfer_in_school_name: "St. Jude Academy" },
        new Map(),
      ),
    ).toBe("Transferred in from St. Jude Academy");
  });
  it("still says nothing for a learner who stayed put", () => {
    expect(movementRemark({ student_id: 1, enrollment_status: "active" }, new Map())).toBe("");
  });
  it("keeps the in-system wording", () => {
    expect(
      movementRemark({ student_id: 1, enrollment_status: "active", origin_school_id: 7 }, names),
    ).toBe("Transferred in from Bayugan Central ES");
  });
});
