import {
  EDITABLE_REVIEW_STATUSES,
  type ReviewEntity,
  type ReviewStatus,
} from "@/lib/constants/examReview";
import { supabase } from "@/lib/supabase/client";

export interface ReviewRow {
  created_by?: string | number | null;
  school_id?: string | number | null;
  review_status?: ReviewStatus | null;
}

interface AuthorReader {
  userId: string | number | null;
  isAuthorizedAuthor: boolean;
}

function isAuthor(row: ReviewRow, userId: string | number | null): boolean {
  return userId != null && row.created_by != null && String(row.created_by) === String(userId);
}

/** Mirrors `can_edit_tos` / `can_edit_exam` (194) for a division row. */
export function canEditReviewRow(row: ReviewRow, reader: AuthorReader): boolean {
  return (
    reader.isAuthorizedAuthor &&
    isAuthor(row, reader.userId) &&
    row.review_status != null &&
    EDITABLE_REVIEW_STATUSES.includes(row.review_status)
  );
}

export function availableAuthorActions(
  row: ReviewRow,
  userId: string | number | null,
  isAuthorizedAuthor: boolean,
): ("submit" | "withdraw")[] {
  if (!isAuthor(row, userId)) return [];
  if (row.review_status === "submitted") return ["withdraw"];
  if (isAuthorizedAuthor && (row.review_status === "draft" || row.review_status === "rejected"))
    return ["submit"];
  return [];
}

async function call(fn: string, args: Record<string, unknown>): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc(fn, args);
  return { error: error ? error.message : null };
}

export const submitForReview = (entity: ReviewEntity, id: string | number) =>
  call("exam_review_submit", { p_entity: entity, p_id: Number(id) });
export const withdrawFromReview = (entity: ReviewEntity, id: string | number) =>
  call("exam_review_withdraw", { p_entity: entity, p_id: Number(id) });
export const startReview = (entity: ReviewEntity, id: string | number) =>
  call("exam_review_start", { p_entity: entity, p_id: Number(id) });
export const decideReview = (
  entity: ReviewEntity,
  id: string | number,
  decision: "approve" | "reject",
  comment: string,
) =>
  call("exam_review_decide", {
    p_entity: entity,
    p_id: Number(id),
    p_decision: decision,
    p_comment: comment,
  });
export const reopenReview = (entity: ReviewEntity, id: string | number, comment: string) =>
  call("exam_review_reopen", { p_entity: entity, p_id: Number(id), p_comment: comment });
export const authorizeTeacher = (userId: string | number) =>
  call("exam_qa_authorize", { p_user_id: Number(userId) });
export const revokeTeacher = (userId: string | number, reason: string) =>
  call("exam_qa_revoke", { p_user_id: Number(userId), p_reason: reason });
