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
import { getGradeLevelLabel } from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

/** Shape returned by the `enrollment_dependents` RPC. */
interface EnrollmentFacts {
  student_name: string;
  school_year: string;
  grade_level: number;
  section_name: string | null;
  enrollment_status: string;
  is_past_school_year: boolean;
  counts: Record<string, number>;
  cascades: { sned_disabilities: number };
  blockers: string[];
  deletable: boolean;
}

const COUNT_LABELS: Record<string, string> = {
  grades: "Grades",
  attendance: "Attendance days",
  eccd: "ECCD checklist",
  learner_health: "Learner health (SF8)",
  kinder_progress: "Kindergarten progress ratings",
  pace: "Grade 1 PACE ratings",
  core_values: "Report card core values",
  class_record_scores: "Class record scores",
};

interface DeleteEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  enrollmentId: string | null;
  studentName: string;
  onDeleted: (enrollmentId: string) => void;
}

/**
 * Delete one enrollment row — but only a row nothing has been encoded against.
 *
 * The guard lives in `delete_enrollment_safe` (migration 183), not here: the
 * anon key ships in the browser bundle, so a dialog that merely hides its button
 * protects nothing. This screen reads `enrollment_dependents`, which is the same
 * function the delete refuses on, so what is shown and what is enforced cannot
 * drift apart.
 */
export function DeleteEnrollmentModal({
  isOpen,
  onClose,
  enrollmentId,
  studentName,
  onDeleted,
}: DeleteEnrollmentModalProps) {
  const [facts, setFacts] = useState<EnrollmentFacts | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen || !enrollmentId) {
      setFacts(null);
      return;
    }
    let isMounted = true;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc("enrollment_dependents", {
        p_enrollment_id: Number(enrollmentId),
      });
      if (!isMounted) return;
      if (error) {
        toast.error(error.message);
        setFacts(null);
      } else {
        setFacts(data as EnrollmentFacts);
      }
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [isOpen, enrollmentId]);

  const handleDelete = async () => {
    if (!enrollmentId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.rpc("delete_enrollment_safe", {
        p_enrollment_id: Number(enrollmentId),
        p_reason: null,
      });
      if (error) throw new Error(error.message);
      toast.success("Enrollment deleted.");
      onDeleted(enrollmentId);
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete enrollment",
      );
    } finally {
      setDeleting(false);
    }
  };

  const encodedEntries = facts
    ? Object.entries(facts.counts).filter(([, n]) => Number(n) > 0)
    : [];

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !deleting && !open && onClose()}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Delete Enrollment
          </DialogTitle>
          <DialogDescription>
            {studentName}
            {facts && (
              <>
                {" "}&mdash; SY {facts.school_year},{" "}
                {getGradeLevelLabel(facts.grade_level)}
                {facts.section_name ? ` · ${facts.section_name}` : ""}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking what is encoded against this enrollment...
            </div>
          )}

          {!loading && facts && !facts.deletable && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 space-y-2 text-sm">
              <p className="font-medium text-destructive">
                This enrollment cannot be deleted.
              </p>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                {facts.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
              <p className="text-muted-foreground border-t border-destructive/20 pt-2">
                Use <span className="font-medium text-foreground">Correct
                Enrollment</span> instead — it moves the row to the right grade
                level and section and keeps everything already encoded.
              </p>
            </div>
          )}

          {!loading && facts && facts.deletable && (
            <div className="rounded-md border px-3 py-2.5 space-y-2 text-sm">
              <p className="text-muted-foreground">
                Nothing is encoded against this enrollment — no grades, no
                attendance, no health or assessment records. Deleting it removes
                the register entry permanently; there is no undo.
              </p>
              {facts.cascades.sned_disabilities > 0 && (
                <p className="text-muted-foreground">
                  {facts.cascades.sned_disabilities} SNED disability record(s)
                  entered with this enrollment will be deleted with it.
                </p>
              )}
              <p className="text-muted-foreground">
                The learner will fall back to their most recent remaining
                enrollment at this school.
              </p>
            </div>
          )}

          {!loading && facts?.is_past_school_year && facts.deletable && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/50 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                SY {facts.school_year} has already ended. If its enrolment
                figures were reported to the division, deleting this row makes
                the school&apos;s numbers stop matching what was filed.
              </span>
            </div>
          )}

          {!loading && encodedEntries.length > 0 && (
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Encoded records:</p>
              {encodedEntries.map(([key, n]) => (
                <div key={key} className="flex justify-between">
                  <span>{COUNT_LABELS[key] ?? key}</span>
                  <span className="tabular-nums">{n}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting || loading || !facts?.deletable}
          >
            {deleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Deleting...
              </>
            ) : (
              "Delete Permanently"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
