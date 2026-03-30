"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useState } from "react";

interface RejectReasonDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  title?: string;
  description?: string;
}

export function RejectReasonDialog({
  isOpen,
  onClose,
  onConfirm,
  title = "Reject Request",
  description = "Provide a reason for rejecting this request.",
}: RejectReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setError("Please provide a rejection reason (min. 5 characters).");
      return;
    }
    setError("");
    setSubmitting(true);
    await onConfirm(trimmed);
    setSubmitting(false);
    setReason("");
    onClose();
  };

  const handleClose = () => {
    if (!submitting) {
      setReason("");
      setError("");
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Textarea
            placeholder="State the reason for rejection..."
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError("");
            }}
            rows={4}
            className="resize-none"
            disabled={submitting}
          />
          {error && (
            <p className="text-sm text-destructive font-medium">{error}</p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Rejecting...
              </>
            ) : (
              "Confirm Reject"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
