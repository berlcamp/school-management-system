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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getGradeLevelLabel } from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import { Student } from "@/types";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

type ActionType = "retain" | "nlis" | null;

interface RetainNlisModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  enrollmentId: string;
  gradeLevel: number;
  sectionId: string;
  schoolYear: string;
  schoolId: string | null;
  onUpdated: () => void;
}

export function RetainNlisModal({
  isOpen,
  onClose,
  student,
  enrollmentId,
  gradeLevel,
  schoolYear,
  schoolId,
  onUpdated,
}: RetainNlisModalProps) {
  const [actionType, setActionType] = useState<ActionType>(null);
  const [dateDropped, setDateDropped] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const studentName = `${student.last_name}, ${student.first_name}${student.middle_name ? ` ${student.middle_name}` : ""}`;

  const resetForm = () => {
    setActionType(null);
    setDateDropped("");
    setRemarks("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const canSubmit =
    actionType &&
    remarks.trim() &&
    (actionType === "retain" || (actionType === "nlis" && dateDropped));

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSaving(true);
    try {
      if (actionType === "retain") {
        let q = supabase
          .from("sms_enrollments")
          .update({
            enrollment_status: "retained",
            remarks: remarks.trim(),
          })
          .eq("id", Number(enrollmentId));
        if (schoolId != null) {
          q = q.eq("school_id", Number(schoolId));
        }
        const { error } = await q;

        if (error) throw error;

        toast.success("Student has been retained");
      } else {
        // NLIS - mark as dropped. The trg_sync_student_enrollment_status
        // trigger (migration 056) propagates 'dropped' to sms_students
        // automatically, so we no longer write that row separately —
        // doing so previously created a zombie state if it failed.
        let q = supabase
          .from("sms_enrollments")
          .update({
            enrollment_status: "dropped",
            date_dropped: dateDropped,
            remarks: `NLIS: ${remarks.trim()}`,
          })
          .eq("id", Number(enrollmentId));
        if (schoolId != null) {
          q = q.eq("school_id", Number(schoolId));
        }
        const { error: enrollmentError } = await q;

        if (enrollmentError) throw enrollmentError;

        toast.success("Student marked as NLIS (dropped)");
      }

      handleClose();
      onUpdated();
    } catch (error) {
      console.error("Error updating student status:", error);
      toast.error("Failed to update student status");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Retain / NLIS</DialogTitle>
          <DialogDescription>
            {studentName} &mdash; {getGradeLevelLabel(gradeLevel)},{" "}
            {schoolYear}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Action Selection */}
          <div className="space-y-2">
            <Label>Action</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={actionType === "retain" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setActionType("retain")}
              >
                Retain
              </Button>
              <Button
                type="button"
                variant={actionType === "nlis" ? "destructive" : "outline"}
                className="flex-1"
                onClick={() => setActionType("nlis")}
              >
                NLIS
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {actionType === "retain"
                ? "Student will remain in the same grade level and will not be allowed to enroll in the next grade level."
                : actionType === "nlis"
                  ? "No Longer In School — student is not allowed to enroll in the next grade level."
                  : "Select an action above."}
            </p>
          </div>

          {/* Date Dropped (NLIS only) */}
          {actionType === "nlis" && (
            <div className="space-y-2">
              <Label htmlFor="date-dropped">Date Dropped</Label>
              <input
                id="date-dropped"
                type="date"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={dateDropped}
                onChange={(e) => setDateDropped(e.target.value)}
              />
            </div>
          )}

          {/* Remarks */}
          {actionType && (
            <div className="space-y-2">
              <Label htmlFor="remarks">Remarks</Label>
              <Textarea
                id="remarks"
                placeholder="Enter remarks..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            variant={actionType === "nlis" ? "destructive" : "default"}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {actionType === "retain"
              ? "Retain Student"
              : actionType === "nlis"
                ? "Mark as NLIS"
                : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
