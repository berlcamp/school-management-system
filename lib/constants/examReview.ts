/**
 * QA review of Division TOS and exams (migration 194).
 *
 * The SQL is the enforcement — `exam_review_*` in 194 decide every transition.
 * This file mirrors its vocabulary for the screens, the way `classRecord.ts`
 * mirrors 173. Keep the two in step.
 */

export const REVIEW_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export type ReviewEntity = "tos" | "exam";

export type ReviewAction =
  | "authorize"
  | "revoke"
  | "submit"
  | "withdraw"
  | "start_review"
  | "approve"
  | "reject"
  | "reopen";

/** An author may edit only while the item is a draft or has been returned. */
export const EDITABLE_REVIEW_STATUSES: readonly ReviewStatus[] = ["draft", "rejected"];

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Returned",
};

export const REVIEW_STATUS_BADGE_CLASS: Record<ReviewStatus, string> = {
  draft: "bg-gray-100 text-gray-800",
  submitted: "bg-amber-100 text-amber-800",
  under_review: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export const REVIEW_ACTION_LABEL: Record<ReviewAction, string> = {
  authorize: "Authorized",
  revoke: "Authorization revoked",
  submit: "Submitted for review",
  withdraw: "Withdrawn",
  start_review: "Review started",
  approve: "Approved",
  reject: "Returned",
  reopen: "Reopened for correction",
};

export const QA_UNAUTHORIZED_MESSAGE =
  "You are not currently authorized to create Division TOS. Please contact the Division QA administrator.";
