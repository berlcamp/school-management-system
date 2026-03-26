"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export const ManageMadrasahStudentsModal = ({
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
      setSelectedIds(new Set(enrolledSet));
      setOriginalIds(enrolledSet);
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

      toast.success("Madrasah enrollment updated successfully!");
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
            Manage Madrasah Students
          </DialogTitle>
          <DialogDescription>
            Select students to enroll in{" "}
            <span className="font-medium">
              {subject?.code} - {subject?.name}
            </span>{" "}
            for {section?.name} ({section?.school_year}).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
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
                          LRN: {student.lrn || "-"}
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
