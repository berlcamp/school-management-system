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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  clearsSectionAssignment,
  getAllowedStatusTransitions,
  getGradeLevelLabel,
  TERMINAL_GRADES,
} from "@/lib/constants";
import {
  ENROLLMENT_STATUS_LABELS,
  ENROLLMENT_STATUS_STYLES,
} from "@/lib/dashboard-utils";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import type { EnrollmentLifecycleStatus } from "@/types/database";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

interface ChangeStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  enrollmentId: string | null;
  currentStatus: EnrollmentLifecycleStatus | null;
  /** Needed to decide whether `graduated` is a legal target — see TERMINAL_GRADES. */
  gradeLevel: number | null;
  studentName: string;
  onStatusChanged: (newStatus: EnrollmentLifecycleStatus) => void;
}

export function ChangeStatusModal({
  isOpen,
  onClose,
  enrollmentId,
  currentStatus,
  gradeLevel,
  studentName,
  onStatusChanged,
}: ChangeStatusModalProps) {
  const user = useAppSelector((state) => state.user.user);
  const [newStatus, setNewStatus] = useState<string>("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNewStatus("");
      setRemarks("");
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!enrollmentId || !newStatus || !user?.system_user_id) return;

    // Re-check rather than trusting the dropdown: `availableStatuses` is
    // derived state, and this write is the last point before the database.
    if (!availableStatuses.includes(newStatus)) {
      toast.error("That status change is not allowed from the current status.");
      return;
    }

    setSubmitting(true);
    try {
      let query = supabase
        .from("sms_enrollments")
        .update({
          enrollment_status: newStatus,
          // A learner who is no longer sitting in the section must not keep
          // pointing at one — a promoted row that holds its section_id still
          // counts against that section's roster.
          ...(clearsSectionAssignment(newStatus) && { section_id: null }),
          ...(remarks.trim() && { remarks: remarks.trim() }),
        })
        .eq("id", Number(enrollmentId));

      if (user.school_id != null) {
        query = query.eq("school_id", Number(user.school_id));
      }

      const { error } = await query;
      if (error) throw new Error(error.message);

      toast.success(
        `Status changed to ${ENROLLMENT_STATUS_LABELS[newStatus] ?? newStatus}.`
      );
      onStatusChanged(newStatus as EnrollmentLifecycleStatus);
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to change status"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const availableStatuses = useMemo(
    () => getAllowedStatusTransitions(currentStatus, gradeLevel),
    [currentStatus, gradeLevel],
  );

  // Why `graduated` is missing, when it is the change the user came for.
  const graduationBlocked =
    gradeLevel != null &&
    !TERMINAL_GRADES.includes(gradeLevel as (typeof TERMINAL_GRADES)[number]) &&
    (currentStatus === "active" || currentStatus === "completed");

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !submitting && !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Enrollment Status</DialogTitle>
          <DialogDescription>
            {studentName}
            {currentStatus && (
              <>
                {" "}&mdash; currently{" "}
                <span
                  className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${ENROLLMENT_STATUS_STYLES[currentStatus] ?? ""}`}
                >
                  {ENROLLMENT_STATUS_LABELS[currentStatus] ?? currentStatus}
                </span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">New Status</label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {availableStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    <span className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${ENROLLMENT_STATUS_STYLES[status] ?? ""}`}
                      >
                        {ENROLLMENT_STATUS_LABELS[status] ?? status}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableStatuses.length === 0 && (
              <p className="text-xs text-muted-foreground">
                This enrollment is in a state the transfer workflow owns. It
                changes when the record request is approved, rejected, or
                cancelled — not from here.
              </p>
            )}
            {graduationBlocked && (
              <p className="text-xs text-muted-foreground">
                Graduated is not offered for{" "}
                {getGradeLevelLabel(gradeLevel as number)} — only Grade 6, 10,
                and 12 complete a level. Use Promoted or Completed.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Remarks <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Reason for status change..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !newStatus}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              "Change Status"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
