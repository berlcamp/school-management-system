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
import { supabase } from "@/lib/supabase/client";
import { Section, SectionStudent, Student } from "@/types";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  section: Section | null;
}

export const ManageStudentsModal = ({
  isOpen,
  onClose,
  section,
}: ModalProps) => {
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [sectionStudents, setSectionStudents] = useState<SectionStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [availableStudents, setAvailableStudents] = useState<Student[]>([]);

  useEffect(() => {
    if (isOpen && section) {
      fetchStudents();
      fetchSectionStudents();
    }
  }, [isOpen, section]);

  const fetchStudents = async () => {
    const { data, error } = await supabase
      .from("sms_students")
      .select("*")
      .eq("enrollment_status", "enrolled")
      .is("deleted_at", null)
      .order("last_name")
      .order("first_name");

    if (!error && data) {
      setStudents(data);
    }
  };

  const fetchSectionStudents = async () => {
    if (!section) return;

    const { data, error } = await supabase
      .from("sms_section_students")
      .select("*")
      .eq("section_id", section.id)
      .eq("school_year", section.school_year)
      .is("transferred_at", null);

    if (!error && data) {
      setSectionStudents(data);
    }
  };

  useEffect(() => {
    if (students.length > 0 && sectionStudents.length > 0) {
      const enrolledStudentIds = new Set(
        sectionStudents.map((ss) => ss.student_id),
      );
      const available = students.filter((s) => !enrolledStudentIds.has(s.id));
      setAvailableStudents(available);
    } else if (students.length > 0) {
      setAvailableStudents(students);
    }
  }, [students, sectionStudents]);

  const handleAddStudent = async () => {
    if (!selectedStudentId || !section) return;

    setLoading(true);
    try {
      // Check if student is already in this section
      const existing = sectionStudents.find(
        (ss) => ss.student_id === selectedStudentId,
      );

      if (existing) {
        toast.error("Student is already in this section");
        setLoading(false);
        return;
      }

      // Add student to section
      const { error } = await supabase.from("sms_section_students").insert({
        section_id: section.id,
        student_id: selectedStudentId,
        school_year: section.school_year,
        enrolled_at: new Date().toISOString(),
      });

      if (error) throw error;

      // Update student's current section
      await supabase
        .from("sms_students")
        .update({ current_section_id: section.id })
        .eq("id", selectedStudentId);

      toast.success("Student added to section successfully!");
      setSelectedStudentId("");
      fetchSectionStudents();
    } catch (err) {
      console.error("Error adding student:", err);
      toast.error("Failed to add student to section");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveStudent = async (
    sectionStudentId: string,
    studentId: string,
  ) => {
    if (!section) return;

    setLoading(true);
    try {
      // Mark as transferred
      const { error } = await supabase
        .from("sms_section_students")
        .update({ transferred_at: new Date().toISOString() })
        .eq("id", sectionStudentId);

      if (error) throw error;

      // Remove current section from student
      await supabase
        .from("sms_students")
        .update({ current_section_id: null })
        .eq("id", studentId);

      toast.success("Student removed from section successfully!");
      fetchSectionStudents();
    } catch (err) {
      console.error("Error removing student:", err);
      toast.error("Failed to remove student from section");
    } finally {
      setLoading(false);
    }
  };

  const getStudentName = (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    if (!student) return "-";
    return `${student.last_name}, ${student.first_name}${
      student.middle_name ? ` ${student.middle_name.charAt(0)}.` : ""
    }`;
  };

  const getStudentLRN = (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    return student?.lrn || "-";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            Manage Students - {section?.name}
          </DialogTitle>
          <DialogDescription>
            Add or remove students from this section.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Add Student */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Add Student</label>
            <div className="flex gap-2">
              <Select
                value={selectedStudentId}
                onValueChange={setSelectedStudentId}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select student to add" />
                </SelectTrigger>
                <SelectContent>
                  {availableStudents.length === 0 ? (
                    <SelectItem value="no-options" disabled>
                      No available students
                    </SelectItem>
                  ) : (
                    availableStudents.map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.lrn} - {student.last_name},{" "}
                        {student.first_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                onClick={handleAddStudent}
                disabled={!selectedStudentId || loading}
                size="sm"
              >
                Add
              </Button>
            </div>
          </div>

          {/* Students List */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Students in Section ({sectionStudents.length})
            </label>
            <div className="border rounded-md">
              {sectionStudents.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No students in this section
                </div>
              ) : (
                <div className="divide-y">
                  {sectionStudents.map((ss) => (
                    <div
                      key={ss.id}
                      className="p-3 flex items-center justify-between hover:bg-muted/50"
                    >
                      <div className="flex-1">
                        <div className="font-medium">
                          {getStudentName(ss.student_id)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          LRN: {getStudentLRN(ss.student_id)}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleRemoveStudent(ss.id, ss.student_id)
                        }
                        disabled={loading}
                        className="text-destructive hover:text-destructive"
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
