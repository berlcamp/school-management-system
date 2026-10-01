"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ReviewEntity, ReviewStatus } from "@/lib/constants/examReview";
import { useAppSelector } from "@/lib/redux/hook";
import { decideReview, reopenReview, startReview } from "@/lib/utils/examReview";
import { useState } from "react";
import toast from "react-hot-toast";

interface Props {
  entity: ReviewEntity;
  row: { id: string; review_status: ReviewStatus; created_by: string | null };
  onChanged: () => void;
}

/**
 * QA's decisions. Every rule shown here is also enforced by 194's
 * exam_review_* functions; the panel only avoids offering what would fail.
 */
export function ReviewDecisionPanel({ entity, row, onChanged }: Props) {
  const me = useAppSelector((s) => s.user.user?.id);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const isOwn = me != null && String(row.created_by) === String(me);

  const run = async (fn: () => Promise<{ error: string | null }>, ok: string) => {
    if (busy) return;
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return toast.error(error);
    toast.success(ok);
    setComment("");
    onChanged();
  };

  if (isOwn)
    return (
      <p className="text-sm text-muted-foreground">
        You authored this, so another QA reviewer must decide it.
      </p>
    );

  const pending = row.review_status === "submitted" || row.review_status === "under_review";

  return (
    <div className="space-y-3">
      {(pending || row.review_status === "approved") && (
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={
            row.review_status === "approved"
              ? "Reason for reopening (required)"
              : "Comments for the author (required to return)"
          }
          rows={3}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {row.review_status === "submitted" && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => run(() => startReview(entity, row.id), "Review started")}
          >
            Start review
          </Button>
        )}
        {pending && (
          <>
            <Button
              variant="green"
              size="sm"
              disabled={busy}
              onClick={() => run(() => decideReview(entity, row.id, "approve", comment), "Approved")}
            >
              Approve
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy || !comment.trim()}
              onClick={() =>
                run(() => decideReview(entity, row.id, "reject", comment), "Returned to the author")
              }
            >
              Return with comments
            </Button>
          </>
        )}
        {row.review_status === "approved" && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !comment.trim()}
            onClick={() => run(() => reopenReview(entity, row.id, comment), "Reopened")}
          >
            Reopen for correction
          </Button>
        )}
      </div>
    </div>
  );
}
