import { describe, expect, it } from "vitest";

import { availableAuthorActions, canEditReviewRow } from "@/lib/utils/examReview";

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
