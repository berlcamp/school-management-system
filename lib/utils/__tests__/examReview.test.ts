import { describe, expect, it } from "vitest";

import {
  availableAuthorActions,
  canEditReviewRow,
  examKeyPermissions,
} from "@/lib/utils/examReview";

const mine = { created_by: "7", school_id: null };

describe("canEditReviewRow", () => {
  it("lets an authorized author edit a draft or a returned item", () => {
    for (const s of ["draft", "rejected"] as const) {
      expect(
        canEditReviewRow({ ...mine, review_status: s }, { userId: 7, isAuthorizedAuthor: true }),
      ).toBe(true);
    }
  });

  it("freezes submitted, under review and approved items, even for the author", () => {
    for (const s of ["submitted", "under_review", "approved"] as const) {
      expect(
        canEditReviewRow({ ...mine, review_status: s }, { userId: 7, isAuthorizedAuthor: true }),
      ).toBe(false);
    }
  });

  it("refuses a revoked author and anyone who is not the author", () => {
    expect(
      canEditReviewRow({ ...mine, review_status: "draft" }, { userId: 7, isAuthorizedAuthor: false }),
    ).toBe(false);
    expect(
      canEditReviewRow({ ...mine, review_status: "draft" }, { userId: 8, isAuthorizedAuthor: true }),
    ).toBe(false);
  });
});

describe("availableAuthorActions", () => {
  it("offers submit on draft/rejected and withdraw only while submitted", () => {
    expect(availableAuthorActions({ ...mine, review_status: "draft" }, 7, true)).toEqual(["submit"]);
    expect(availableAuthorActions({ ...mine, review_status: "rejected" }, 7, true)).toEqual(["submit"]);
    expect(availableAuthorActions({ ...mine, review_status: "submitted" }, 7, true)).toEqual(["withdraw"]);
    expect(availableAuthorActions({ ...mine, review_status: "under_review" }, 7, true)).toEqual([]);
    expect(availableAuthorActions({ ...mine, review_status: "draft" }, 7, false)).toEqual([]);
  });
});

describe("examKeyPermissions", () => {
  const author = { userId: 7, schoolId: 3, type: "teacher", isAuthorizedAuthor: true };
  const division = (review_status: "draft" | "submitted" | "under_review" | "approved" | "rejected") => ({
    school_id: null,
    is_school_shared: false,
    created_by: "7",
    review_status,
  });

  it("lets the authorized author key their own division draft or returned exam", () => {
    expect(examKeyPermissions(division("draft"), author).canEditKey).toBe(true);
    expect(examKeyPermissions(division("rejected"), author).canEditKey).toBe(true);
  });

  it("freezes the key once submitted, under review or approved", () => {
    for (const s of ["submitted", "under_review", "approved"] as const) {
      expect(examKeyPermissions(division(s), author).canEditKey).toBe(false);
    }
  });

  it("refuses a revoked author, another teacher and the division office the key", () => {
    expect(examKeyPermissions(division("draft"), { ...author, isAuthorizedAuthor: false }).canEditKey).toBe(false);
    expect(examKeyPermissions(division("draft"), { ...author, userId: 8 }).canEditKey).toBe(false);
    expect(
      examKeyPermissions(division("draft"), { userId: 1, schoolId: null, type: "division_admin", isAuthorizedAuthor: false })
        .canEditKey,
    ).toBe(false);
  });

  it("gives the release code to the division office and QA only once approved", () => {
    for (const type of ["division_admin", "division_type", "super admin", "qa"]) {
      const reader = { userId: 1, schoolId: null, type, isAuthorizedAuthor: false };
      expect(examKeyPermissions(division("approved"), reader).canHoldCode).toBe(true);
      expect(examKeyPermissions(division("submitted"), reader).canHoldCode).toBe(false);
    }
    expect(examKeyPermissions(division("approved"), author).canHoldCode).toBe(false);
    expect(examKeyPermissions(division("draft"), author).canHoldCode).toBe(false);
  });

  it("keeps 160's rule for school-level exams", () => {
    const priv = { school_id: 3, is_school_shared: false, created_by: "7", review_status: null };
    expect(examKeyPermissions(priv, author)).toEqual({ canEditKey: true, canHoldCode: true });
    expect(examKeyPermissions(priv, { ...author, userId: 8 })).toEqual({ canEditKey: false, canHoldCode: false });
    const shared = { ...priv, is_school_shared: true };
    const head = { userId: 9, schoolId: 3, type: "school_head", isAuthorizedAuthor: false };
    expect(examKeyPermissions(shared, head)).toEqual({ canEditKey: true, canHoldCode: true });
  });
});
