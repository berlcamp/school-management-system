"use client";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";
import { formatLrn } from "@/lib/utils";
import { Student } from "@/types";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

type ForceDeleteStudentModalProps = {
  isOpen: boolean;
  student: Student | null;
  onClose: () => void;
  onDeleted: (student: Student) => void;
};

// All tables linked to a student via the student_id column. Most cascade on
// delete, but we delete explicitly to avoid FK errors (sms_requests has no
// ON DELETE rule and would block the delete) and orphaned rows
// (sms_form_requests is ON DELETE SET NULL). Children are removed first, the
// student row last.
const RELATED_TABLES: { table: string; label: string }[] = [
  { table: "sms_grades", label: "Grades" },
  { table: "sms_attendance", label: "Attendance records" },
  { table: "sms_learner_health", label: "Learner health records (SF8)" },
  { table: "sms_eccd_assessments", label: "ECCD assessments" },
  { table: "sms_book_issuances", label: "Book issuances" },
  { table: "sms_historical_grades", label: "Historical grades" },
  { table: "sms_student_subjects", label: "Subject enrollments" },
  { table: "sms_student_disabilities", label: "SNED disability records" },
  { table: "sms_report_card_core_values", label: "Report card core values" },
  { table: "sms_record_requests", label: "Record transfer requests" },
  { table: "sms_requests", label: "Document requests" },
  { table: "sms_form_requests", label: "Form 137 requests" },
  { table: "sms_enrollments", label: "Enrollment records" },
];

const EVAL_RESPONSES_TABLE = "sms_evaluation_responses";
const CONFIRM_WORD = "DELETE";

export const ForceDeleteStudentModal = ({
  isOpen,
  student,
  onClose,
  onDeleted,
}: ForceDeleteStudentModalProps) => {
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [evalCount, setEvalCount] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  // A learner is a single shared row across the division, so deleting one wipes
  // every school's records. Block deletion when the learner has records at more
  // than one school (i.e. a transferee) to protect the other school's data.
  const [blocked, setBlocked] = useState(false);
  const [otherSchoolNames, setOtherSchoolNames] = useState<string[]>([]);

  const fetchCounts = useCallback(async (studentId: string) => {
    setLoadingCounts(true);
    try {
      const results = await Promise.all(
        RELATED_TABLES.map(async ({ table }) => {
          const { count } = await supabase
            .from(table)
            .select("*", { count: "exact", head: true })
            .eq("student_id", studentId);
          return [table, count ?? 0] as const;
        }),
      );
      const { count: evalResponses } = await supabase
        .from(EVAL_RESPONSES_TABLE)
        .select("*", { count: "exact", head: true })
        .eq("respondent_type", "student")
        .eq("respondent_id", studentId);

      const countsMap = Object.fromEntries(results);
      setCounts(countsMap);
      setEvalCount(evalResponses ?? 0);

      // Detect cross-school records: enrollments at more than one school, or an
      // open/approved record request (transfer).
      const { data: enrollRows } = await supabase
        .from("sms_enrollments")
        .select("school_id")
        .eq("student_id", studentId);
      const schoolIds = Array.from(
        new Set(
          (enrollRows ?? [])
            .map((r) => (r.school_id != null ? String(r.school_id) : ""))
            .filter(Boolean),
        ),
      );
      const isTransferee =
        schoolIds.length > 1 || (countsMap["sms_record_requests"] ?? 0) > 0;
      setBlocked(isTransferee);

      if (isTransferee && schoolIds.length > 0) {
        const { data: schoolsData } = await supabase
          .from("sms_schools")
          .select("id, name")
          .in("id", schoolIds);
        setOtherSchoolNames((schoolsData ?? []).map((s) => s.name));
      } else {
        setOtherSchoolNames([]);
      }
    } finally {
      setLoadingCounts(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && student?.id) {
      setConfirmText("");
      setCounts({});
      setEvalCount(0);
      setBlocked(false);
      setOtherSchoolNames([]);
      fetchCounts(String(student.id));
    }
  }, [isOpen, student?.id, fetchCounts]);

  if (!isOpen || !student) return null;

  const fullName = `${student.last_name}, ${student.first_name}${
    student.middle_name ? ` ${String(student.middle_name).charAt(0)}.` : ""
  }${student.suffix ? ` ${student.suffix}` : ""}`;

  const relatedWithData = RELATED_TABLES.filter(
    ({ table }) => (counts[table] ?? 0) > 0,
  );
  const totalRelated =
    relatedWithData.reduce((sum, { table }) => sum + (counts[table] ?? 0), 0) +
    evalCount;

  const confirmed = confirmText.trim().toUpperCase() === CONFIRM_WORD;

  const handleConfirm = async () => {
    if (!confirmed || deleting || blocked) return;
    const studentId = String(student.id);
    setDeleting(true);
    try {
      // Delete children first so the student row delete cannot fail on a
      // foreign-key constraint.
      for (const { table, label } of RELATED_TABLES) {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq("student_id", studentId);
        if (error) {
          toast.error(`Failed to delete ${label}: ${error.message}`);
          return;
        }
      }

      const { error: evalError } = await supabase
        .from(EVAL_RESPONSES_TABLE)
        .delete()
        .eq("respondent_type", "student")
        .eq("respondent_id", studentId);
      if (evalError) {
        toast.error(`Failed to delete evaluation responses: ${evalError.message}`);
        return;
      }

      const { error: studentError } = await supabase
        .from("sms_students")
        .delete()
        .eq("id", studentId);
      if (studentError) {
        toast.error(`Failed to delete student: ${studentError.message}`);
        return;
      }

      toast.success("Student and all related records permanently deleted.");
      onDeleted(student);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      as="div"
      className="relative z-50 focus:outline-none"
      onClose={() => {}}
    >
      <div className="fixed inset-0 bg-gray-600 opacity-80" aria-hidden="true" />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg dark:bg-gray-900">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div className="min-w-0">
              <DialogTitle as="h3" className="text-base font-semibold text-red-700 dark:text-red-400">
                Permanently delete student
              </DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                You are about to permanently delete{" "}
                <span className="font-semibold text-foreground">{fullName}</span>{" "}
                (LRN <span className="font-mono">{formatLrn(student.lrn)}</span>).
                This action cannot be undone.
              </p>
            </div>
          </div>

          {loadingCounts ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking related records…
            </div>
          ) : blocked ? (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800/60 dark:bg-amber-950/20">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Deletion is disabled for this learner.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                This learner is a transferee with records at more than one
                school. Because a learner is a single shared record across the
                division, deleting it here would permanently destroy{" "}
                <span className="font-medium text-foreground">
                  every school&apos;s
                </span>{" "}
                grades, attendance and enrollment for this learner — not just
                this school&apos;s.
              </p>
              {otherSchoolNames.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-foreground">
                    Schools with records for this learner:
                  </p>
                  <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                    {otherSchoolNames.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                If this learner must be removed, resolve the transfer first
                (e.g. use the record-request / remove-transfer workflow).
              </p>
            </div>
          ) : (
            <>
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/20">
                <p className="text-sm font-medium text-foreground">
                  The following data will also be permanently deleted:
                </p>

                {totalRelated === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No related records found — only the student profile will be
                    removed.
                  </p>
                ) : (
                  <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-sm">
                    {relatedWithData.map(({ table, label }) => (
                      <li key={table} className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-semibold text-foreground">
                          {counts[table]}
                        </span>
                      </li>
                    ))}
                    {evalCount > 0 && (
                      <li className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">
                          Evaluation responses
                        </span>
                        <span className="font-semibold text-foreground">
                          {evalCount}
                        </span>
                      </li>
                    )}
                    <li className="mt-1 flex items-center justify-between gap-4 border-t border-red-200 pt-1 dark:border-red-900/50">
                      <span className="font-medium text-foreground">Total records</span>
                      <span className="font-bold text-red-700 dark:text-red-400">
                        {totalRelated}
                      </span>
                    </li>
                  </ul>
                )}
              </div>

              <div className="mt-4">
                <label className="text-sm text-muted-foreground">
                  Type <span className="font-mono font-semibold text-foreground">{CONFIRM_WORD}</span> to
                  confirm:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  disabled={deleting}
                  autoComplete="off"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40"
                  placeholder={CONFIRM_WORD}
                />
              </div>
            </>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={onClose} variant="outline" disabled={deleting}>
              {blocked ? "Close" : "Cancel"}
            </Button>
            {!blocked && (
              <Button
                onClick={handleConfirm}
                disabled={!confirmed || loadingCounts || deleting}
                variant="destructive"
              >
                {deleting ? "Deleting…" : "Permanently Delete"}
              </Button>
            )}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};
