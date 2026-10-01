"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { ReviewEntity } from "@/lib/constants/examReview";
import {
  availableAuthorActions,
  submitForReview,
  withdrawFromReview,
  type ReviewRow,
} from "@/lib/utils/examReview";
import { FilePlus2, History, Send, Undo2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { ReviewHistory } from "./ReviewHistory";

interface Props {
  entity: ReviewEntity;
  row: ReviewRow & { id: string };
  userId: string | number | null;
  isAuthorizedAuthor: boolean;
  onChanged: () => void;
  /** TOS only: shown on an approved TOS for an authorized author. */
  onCreateExam?: (tosId: string) => void;
}

export function DivisionReviewActions({
  entity,
  row,
  userId,
  isAuthorizedAuthor,
  onChanged,
  onCreateExam,
}: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const actions = availableAuthorActions(row, userId, isAuthorizedAuthor);

  const run = async (fn: () => Promise<{ error: string | null }>, ok: string) => {
    if (busy) return;
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return toast.error(error);
    toast.success(ok);
    onChanged();
  };

  return (
    <>
      {actions.includes("submit") && (
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => run(() => submitForReview(entity, row.id), "Submitted to QA")}
        >
          <Send className="mr-2 h-4 w-4" />
          Submit to QA
        </DropdownMenuItem>
      )}
      {actions.includes("withdraw") && (
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => run(() => withdrawFromReview(entity, row.id), "Withdrawn")}
        >
          <Undo2 className="mr-2 h-4 w-4" />
          Withdraw
        </DropdownMenuItem>
      )}
      {entity === "tos" && onCreateExam && isAuthorizedAuthor && row.review_status === "approved" && (
        <DropdownMenuItem className="cursor-pointer" onClick={() => onCreateExam(row.id)}>
          <FilePlus2 className="mr-2 h-4 w-4" />
          Create Examination
        </DropdownMenuItem>
      )}
      <DropdownMenuItem className="cursor-pointer" onClick={() => setHistoryOpen(true)}>
        <History className="mr-2 h-4 w-4" />
        Review history
      </DropdownMenuItem>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review history</DialogTitle>
          </DialogHeader>
          <ReviewHistory entity={entity} id={row.id} />
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
