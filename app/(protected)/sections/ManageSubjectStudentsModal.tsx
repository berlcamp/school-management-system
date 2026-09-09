"use client";

import { Button } from "@/components/ui/button";
import { formatLrn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SELECTIVE_EMPTY_ROSTER_NOTICE,
  getSubjectProgram,
  getSubjectProgramShortLabel,
  isSelectiveProgram,
} from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { Section, Student, Subject } from "@/types";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  subject: Subject | null;
  section: Section | null;
  onSuccess?: () => void;
}

/**
 * The per-learner roster for any subject with `selective_enrolment` on.
 *
 * Built for Madrasah (034), generalised by migration 179: it now carries MEP,
 * ALS, special-program and EPP/TLE rosters alike, with no per-program branch
 * anywhere in it. A subject is offered this modal because it is selective —
 * never because of which program it belongs to.
 *
 * When the subject is tagged to a special program, the members of that program
 * are PRE-TICKED on open. That prefill is one-way and on demand: it reads
 * membership, it never writes it, and nothing at all is written until Save
 * (the 132 answer-key rule — prefill is a convenience, not the mechanism).
 */
export const ManageSubjectStudentsModal = ({
  isOpen,
  onClose,
  subject,
  section,
  onSuccess,
}: ModalProps) => {
  const user = useAppSelector((state) => state.user.user);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [originalIds, setOriginalIds] = useState<Set<string>>(new Set());
  /** How many learners the program membership pre-ticked, for the notice. */
  const [prefilledCount, setPrefilledCount] = useState(0);
  const [programLabel, setProgramLabel] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!section || !subject) return;

    setLoading(true);
    try {
      // 1. Fetch all approved enrollments for this section
      const { data: enrollments, error: enrollmentError } = await supabase
        .from("sms_enrollments")
        .select(
          `
          student_id,
          student:sms_students!sms_enrollments_student_id_fkey(*)
        `
        )
        .eq("section_id", section.id)
        .eq("school_year", section.school_year)
        .eq("status", "approved");

      if (enrollmentError) throw enrollmentError;

      const studentList = (enrollments || [])
        .map((e) => {
          const student = Array.isArray(e.student) ? e.student[0] : e.student;
          return student as Student;
        })
        .filter(Boolean)
        .sort((a, b) => {
          const lastCmp = (a.last_name || "").localeCompare(b.last_name || "");
          if (lastCmp !== 0) return lastCmp;
          return (a.first_name || "").localeCompare(b.first_name || "");
        });

      setStudents(studentList);

      // 2. Fetch current Madrasah enrollments for this subject+section
      let query = supabase
        .from("sms_student_subjects")
        .select("student_id")
        .eq("subject_id", subject.id)
        .eq("section_id", section.id)
        .eq("school_year", section.school_year);

      if (user?.school_id != null) {
        query = query.eq("school_id", user.school_id);
      }

      const { data: existing, error: existingError } = await query;

      if (existingError) throw existingError;

      const enrolledSet = new Set(
        (existing || []).map((row) => String(row.student_id))
      );
      setOriginalIds(enrolledSet);

      // PREFILL FROM PROGRAM MEMBERSHIP (migration 179).
      //
      // Membership and roster are two different relationships and stay that
      // way: this only pre-ticks boxes. It adds, never removes — a learner
      // already on the roster stays on it whatever their membership says, and
      // un-ticking anything the prefill suggested is a click.
      const selected = new Set(enrolledSet);
      let prefilled = 0;
      let label: string | null = null;

      if (subject.special_program_id) {
        const [{ data: programRow }, { data: strandRow }] = await Promise.all([
          supabase
            .from("sms_special_programs")
            .select("name")
            .eq("id", subject.special_program_id)
            .maybeSingle(),
          subject.specialization_id
            ? supabase
                .from("sms_special_program_specializations")
                .select("name")
                .eq("id", subject.specialization_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        label = [programRow?.name, strandRow?.name]
          .filter(Boolean)
          .join(" \u2014 ") || null;

        let memberQuery = supabase
          .from("sms_student_special_programs")
          .select("student_id")
          .eq("special_program_id", subject.special_program_id)
          .eq("school_year", section.school_year)
          .in(
            "student_id",
            studentList.map((s) => s.id)
          );
        // A subject tagged to a strand takes that strand's members; one tagged
        // to the program as a whole takes everybody in the program, whatever
        // strand they are on.
        if (subject.specialization_id) {
          memberQuery = memberQuery.eq(
            "specialization_id",
            subject.specialization_id
          );
        }
        const { data: members } = await memberQuery;

        (members || []).forEach((row) => {
          const id = String(row.student_id);
          if (!selected.has(id)) {
            selected.add(id);
            prefilled += 1;
          }
        });
      }

      setPrefilledCount(prefilled);
      setProgramLabel(label);
      setSelectedIds(selected);
    } catch (err) {
      console.error("Error fetching data:", err);
      toast.error("Failed to load students");
    } finally {
      setLoading(false);
    }
  }, [section, subject, user?.school_id]);

  useEffect(() => {
    if (isOpen && section && subject) {
      fetchData();
    }
  }, [isOpen, section, subject, fetchData]);

  const toggleStudent = (studentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(students.map((s) => String(s.id))));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleSave = async () => {
    if (!section || !subject || !user) return;

    setSaving(true);
    try {
      // Determine additions and removals
      const toAdd = [...selectedIds].filter((id) => !originalIds.has(id));
      const toRemove = [...originalIds].filter((id) => !selectedIds.has(id));

      // Remove unselected students
      if (toRemove.length > 0) {
        const { error: deleteError } = await supabase
          .from("sms_student_subjects")
          .delete()
          .eq("subject_id", subject.id)
          .eq("section_id", section.id)
          .eq("school_year", section.school_year)
          .in("student_id", toRemove);

        if (deleteError) throw deleteError;
      }

      // Add newly selected students
      if (toAdd.length > 0) {
        const rows = toAdd.map((studentId) => ({
          student_id: studentId,
          subject_id: subject.id,
          section_id: section.id,
          school_id: user.school_id,
          school_year: section.school_year,
          enrolled_by: user.system_user_id,
        }));

        const { error: insertError } = await supabase
          .from("sms_student_subjects")
          .insert(rows);

        if (insertError) throw insertError;
      }

      toast.success("Subject enrollment updated successfully!");
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error("Error saving:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to save enrollment"
      );
    } finally {
      setSaving(false);
    }
  };

  const getStudentName = (student: Student) => {
    if (!student) return "-";
    return `${student.last_name}, ${student.first_name}${
      student.middle_name ? ` ${student.middle_name.charAt(0)}.` : ""
    }`;
  };

  const hasChanges =
    selectedIds.size !== originalIds.size ||
    [...selectedIds].some((id) => !originalIds.has(id));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            Manage Students
          </DialogTitle>
          <DialogDescription>
            Select students to enroll in{" "}
            <span className="font-medium">
              {subject?.code} - {subject?.name}
            </span>{" "}
            for {section?.name} ({section?.school_year}).
            {subject && isSelectiveProgram(getSubjectProgram(subject)) && (
              <>
                {" "}
                This is a{" "}
                {getSubjectProgramShortLabel(getSubjectProgram(subject))}{" "}
                subject, so it is selectively enrolled by definition.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* An empty roster is not an empty section: nobody listed here means
              nobody can be graded, which looks identical to "everyone takes
              it" unless it is said out loud. */}
          {!loading && originalIds.size === 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {SELECTIVE_EMPTY_ROSTER_NOTICE}
            </div>
          )}

          {prefilledCount > 0 && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              Pre-ticked <strong>{prefilledCount}</strong>{" "}
              {prefilledCount === 1 ? "learner" : "learners"} from
              {programLabel ? ` ${programLabel}` : " this special program"}{" "}
              membership. Nothing is saved until you press Save.
            </div>
          )}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">
              Students ({selectedIds.size} of {students.length} selected)
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={selectAll}
                disabled={loading || saving}
              >
                Select All
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={deselectAll}
                disabled={loading || saving}
              >
                Deselect All
              </Button>
            </div>
          </div>

          <div className="border rounded-md">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">
                Loading...
              </div>
            ) : students.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No students enrolled in this section
              </div>
            ) : (
              <div className="divide-y">
                {students.map((student) => {
                  const studentId = String(student.id);
                  const isChecked = selectedIds.has(studentId);
                  return (
                    <label
                      key={student.id}
                      className="p-3 flex items-center gap-3 hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={isChecked}
                        onChange={() => toggleStudent(studentId)}
                        disabled={saving}
                      />
                      <div className="flex-1">
                        <div className="font-medium text-sm">
                          {getStudentName(student)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          LRN: {formatLrn(student.lrn)}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Saving...
              </span>
            ) : (
              "Save Enrollment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
