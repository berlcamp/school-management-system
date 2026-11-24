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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ADJUSTMENT_REASONS,
  getAdjustmentReasonLabel,
  MAX_ADJUSTMENT_POINTS,
  MAX_FINAL_GRADE,
} from "@/lib/constants/gradeAdjustments";
import { useAppSelector } from "@/lib/redux/hook";
import {
  requestAdjustment,
  withdrawAdjustment,
  type SectionAdjustment,
} from "@/lib/utils/gradeAdjustments";
import { useState } from "react";
import toast from "react-hot-toast";

interface GradeAdjustmentModalProps {
  studentId: string;
  studentName: string;
  subjectId: string;
  sectionId: string;
  semester: number;
  /** The final grade without any points. */
  baseFinal: number;
  /** The learner's live or last rejected request, if any. */
  current: SectionAdjustment | null;
  onClose: () => void;
  onChanged: () => void;
}

/** Ask for points on one final grade, or look at the request already made. */
export function GradeAdjustmentModal({
  studentId,
  studentName,
  subjectId,
  sectionId,
  semester,
  baseFinal,
  current,
  onClose,
  onChanged,
}: GradeAdjustmentModalProps) {
  const userId = useAppSelector((state) => state.user.user?.system_user_id);
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const live = current?.status === "pending" || current?.status === "approved";
  const max = Math.min(MAX_ADJUSTMENT_POINTS, MAX_FINAL_GRADE - baseFinal);
  const value = Number(points);
  const validPoints =
    points !== "" && Number.isInteger(value) && value >= 1 && value <= max;
  const canSubmit =
    validPoints && reason !== "" && (reason !== "other" || note.trim() !== "");

  const run = async (action: () => Promise<void>, done: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.success(done);
      onChanged();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Additional points</DialogTitle>
          <DialogDescription>
            {studentName} — final grade {baseFinal}. Points count only after the
            subject&apos;s Department Head or the School Head approves them.
          </DialogDescription>
        </DialogHeader>

        {live && current ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium">
              +{current.points} ({baseFinal} →{" "}
              {Math.min(MAX_FINAL_GRADE, baseFinal + current.points)}) ·{" "}
              {current.status === "pending" ? "Waiting for approval" : "Approved"}
            </p>
            <p>{getAdjustmentReasonLabel(current.reason)}</p>
            {current.note && <p className="text-muted-foreground">{current.note}</p>}
          </div>
        ) : max < 1 ? (
          <p className="text-sm">The final grade is already {MAX_FINAL_GRADE}.</p>
        ) : (
          <div className="space-y-4">
            {current?.status === "rejected" && (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                The last request (+{current.points}) was rejected
                {current.decision_remarks ? `: ${current.decision_remarks}` : "."}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="adjustment-points">Points to add</Label>
              <Input
                id="adjustment-points"
                type="number"
                min={1}
                max={max}
                step={1}
                value={points}
                onChange={(e) => setPoints(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {validPoints
                  ? `Final grade if approved: ${baseFinal + value}`
                  : `A whole number from 1 to ${max}.`}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adjustment-reason">Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="adjustment-reason" className="w-full">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adjustment-note">
                Details{reason === "other" ? "" : " (optional)"}
              </Label>
              <Textarea
                id="adjustment-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Close
          </Button>
          {current?.status === "pending" &&
            Number(current.requested_by) === Number(userId) && (
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  run(() => withdrawAdjustment(current.id), "Request withdrawn")
                }
              >
                Withdraw request
              </Button>
            )}
          {!live && max >= 1 && (
            <Button
              type="button"
              disabled={busy || !canSubmit}
              onClick={() =>
                run(
                  () =>
                    requestAdjustment({
                      studentId,
                      subjectId,
                      sectionId,
                      semester,
                      points: value,
                      reason,
                      note,
                    }),
                  "Sent for approval",
                )
              }
            >
              Send for approval
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
