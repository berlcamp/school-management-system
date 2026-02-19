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
import { Enrollment, Section, Student } from "@/types";
import { useEffect, useState } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  section: Section | null;
}

export const ViewStudentsModal = ({ isOpen, onClose, section }: ModalProps) => {
  const [loading, setLoading] = useState(false);
  const [enrollments, setEnrollments] = useState<
    (Enrollment & { student: Student })[]
  >([]);

  useEffect(() => {
    if (isOpen && section) {
      fetchEnrollments();
    }
  }, [isOpen, section]);

  const fetchEnrollments = async () => {
    if (!section) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sms_enrollments")
        .select(
          `
          *,
          student:sms_students!sms_enrollments_student_id_fkey(*)
        `
        )
        .eq("section_id", section.id)
        .eq("status", "approved")
        .eq("school_year", section.school_year)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setEnrollments(data || []);
    } catch (err) {
      console.error("Error fetching enrollments:", err);
    } finally {
      setLoading(false);
    }
  };

  const getStudentName = (student: Student) => {
    if (!student) return "-";
    return `${student.last_name}, ${student.first_name}${
      student.middle_name ? ` ${student.middle_name.charAt(0)}.` : ""
    }`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            View Students - {section?.name}
          </DialogTitle>
          <DialogDescription>
            Students enrolled in this section for {section?.school_year}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Students List */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Enrolled Students ({enrollments.length})
            </label>
            <div className="border rounded-md">
              {loading ? (
                <div className="p-8 text-center text-muted-foreground">
                  Loading...
                </div>
              ) : enrollments.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No students enrolled in this section
                </div>
              ) : (
                <div className="divide-y">
                  {enrollments.map((enrollment) => (
                    <div
                      key={enrollment.id}
                      className="p-3 flex items-center justify-between hover:bg-muted/50"
                    >
                      <div className="flex-1">
                        <div className="font-medium">
                          {getStudentName(enrollment.student)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          LRN: {enrollment.student?.lrn || "-"} | Grade Level:{" "}
                          {getGradeLevelLabel(enrollment.grade_level)} | Enrolled:{" "}
                          {new Date(
                            enrollment.enrollment_date
                          ).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
