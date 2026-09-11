import { describe, expect, it } from "vitest";

import {
  canManageTieredRow,
  examTier,
  visibleTierFilter,
} from "@/lib/utils/examVisibility";

describe("visibleTierFilter", () => {
  it("admits all three tiers: division, the school's shared rows, and my own", () => {
    // The school clause is nested because both halves must hold — a row
    // shared at a DIFFERENT school must not appear. Dropping it is the bug
    // that kept school-wide exams out of Item Analysis.
    expect(visibleTierFilter("7", "2")).toBe(
      "school_id.is.null,and(school_id.eq.2,is_school_shared.is.true),created_by.eq.7",
    );
  });

  it("omits the school clause when the reader has no school", () => {
    expect(visibleTierFilter("7", null)).toBe("school_id.is.null,created_by.eq.7");
  });

  it("drops the shared half for the super admin, so the school's private rows show", () => {
    expect(visibleTierFilter("7", "2", "super admin")).toBe(
      "school_id.is.null,school_id.eq.2,created_by.eq.7",
    );
    expect(visibleTierFilter("7", "2", "teacher")).toBe(visibleTierFilter("7", "2"));
  });
});

describe("examTier", () => {
  it("places a row by the pair, not by either half alone", () => {
    expect(examTier({ school_id: null, is_school_shared: false })).toBe("division");
    expect(examTier({ school_id: 2, is_school_shared: true })).toBe("school");
    expect(examTier({ school_id: 2, is_school_shared: false })).toBe("private");
    // 160's default: a row predating the flag keeps the visibility it had.
    expect(examTier({ school_id: 2 })).toBe("private");
  });
});

describe("canManageTieredRow", () => {
  const head = { userId: "9", schoolId: "2", type: "school_head" };

  it("lets the author edit their own row whatever the tier", () => {
    expect(
      canManageTieredRow({ school_id: 2, is_school_shared: false, created_by: 9 }, head),
    ).toBe(true);
  });

  it("lets the school's head fix a school-wide row they did not write", () => {
    expect(
      canManageTieredRow({ school_id: 2, is_school_shared: true, created_by: 7 }, head),
    ).toBe(true);
  });

  it("refuses a colleague's private row, and another school's shared one", () => {
    expect(
      canManageTieredRow({ school_id: 2, is_school_shared: false, created_by: 7 }, head),
    ).toBe(false);
    expect(
      canManageTieredRow({ school_id: 3, is_school_shared: true, created_by: 7 }, head),
    ).toBe(false);
  });

  it("refuses a teacher a school-wide row that is not theirs", () => {
    expect(
      canManageTieredRow(
        { school_id: 2, is_school_shared: true, created_by: 7 },
        { userId: "9", schoolId: "2", type: "teacher" },
      ),
    ).toBe(false);
  });
});
