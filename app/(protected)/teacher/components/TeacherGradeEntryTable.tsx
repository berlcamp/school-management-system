"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { Student } from "@/types";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface TeacherGradeEntryTableProps {
  sectionId: string;
  subjectId: string;
  gradingPeriod: number;
  schoolYear: string;
  teacherId: number;
}

export function TeacherGradeEntryTable({
  sectionId,
  subjectId,
  gradingPeriod,
  schoolYear,
  teacherId,
}: TeacherGradeEntryTableProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isValidAssignment, setIsValidAssignment] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const user = useAppSelector((state) => state.user.user);

  // Validate assignment and fetch data when props change
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      if (!sectionId || !subjectId || !teacherId || !schoolYear) {
        setIsValidAssignment(false);
        setIsValidating(false);
        return;
      }

      setIsValidating(true);
      setIsValidAssignment(false);
      setStudents([]);
      setGrades({});

      // Validate assignment
      const isValid = await validateAssignment();
      if (!isMounted) return;

      setIsValidAssignment(isValid);
      setIsValidating(false);

      if (isValid) {
        await fetchStudents();
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [sectionId, subjectId, schoolYear, teacherId]);

  // Fetch grades when grading period changes and students are already loaded
  useEffect(() => {
    if (
      students.length > 0 &&
      sectionId &&
      subjectId &&
      schoolYear &&
      isValidAssignment
    ) {
      const studentIds = students.map((s) => s.id);
      fetchGrades(studentIds);
    }
  }, [gradingPeriod]);

  const validateAssignment = async (): Promise<boolean> => {
    if (!sectionId || !subjectId || !teacherId || !schoolYear) {
      return false;
    }

    // Check if teacher has a schedule for this subject-section combination
    const { data, error } = await supabase
      .from("sms_subject_schedules")
      .select("id")
      .eq("teacher_id", teacherId)
      .eq("subject_id", subjectId)
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear)
      .maybeSingle();

    if (error || !data) {
      // Also check if teacher is section adviser
      const { data: sectionData } = await supabase
        .from("sms_sections")
        .select("section_adviser_id")
        .eq("id", sectionId)
        .eq("section_adviser_id", teacherId)
        .eq("school_year", schoolYear)
        .single();

      return !!sectionData;
    }

    return true;
  };

  const fetchStudents = async () => {
    if (!sectionId || !schoolYear) return;

    setLoading(true);
    try {
      // Fetch students from enrollments table based on section and school year
      const { data: enrollments, error: enrollmentError } = await supabase
        .from("sms_enrollments")
        .select("student_id")
        .eq("section_id", sectionId)
        .eq("school_year", schoolYear)
        .eq("status", "approved");

      if (enrollmentError) {
        console.error("Error fetching enrollments:", enrollmentError);
        toast.error("Failed to load enrollments");
        setStudents([]);
        setGrades({});
        return;
      }

      if (enrollments && enrollments.length > 0) {
        const studentIds = enrollments.map(
          (enrollment) => enrollment.student_id
        );
        const { data, error: studentsError } = await supabase
          .from("sms_students")
          .select("*")
          .in("id", studentIds)
          .is("deleted_at", null)
          .order("last_name")
          .order("first_name");

        if (studentsError) {
          console.error("Error fetching students:", studentsError);
          toast.error("Failed to load students");
          setStudents([]);
          setGrades({});
          return;
        }

        if (data) {
          setStudents(data);
          // Initialize grades object
          const initialGrades: Record<string, number> = {};
          data.forEach((student) => {
            initialGrades[student.id] = 0;
          });
          setGrades(initialGrades);

          // Fetch grades using the freshly fetched student data
          const studentIds = data.map((s) => s.id);
          await fetchGrades(studentIds);
        }
      } else {
        setStudents([]);
        setGrades({});
      }
    } catch (error) {
      console.error("Error fetching students:", error);
      toast.error("Failed to load students");
      setStudents([]);
      setGrades({});
    } finally {
      setLoading(false);
    }
  };

  const fetchGrades = async (studentIdsToFetch?: string[]) => {
    const idsToUse = studentIdsToFetch || students.map((s) => s.id);

    if (!sectionId || !subjectId || !idsToUse.length) return;

    try {
      const { data, error } = await supabase
        .from("sms_grades")
        .select("*")
        .eq("section_id", sectionId)
        .eq("subject_id", subjectId)
        .eq("grading_period", gradingPeriod)
        .eq("school_year", schoolYear)
        .in("student_id", idsToUse);

      if (error) {
        console.error("Error fetching grades:", error);
        return;
      }

      if (data && data.length > 0) {
        const gradesMap: Record<string, number> = {};
        data.forEach((grade) => {
          gradesMap[grade.student_id] = grade.grade;
        });
        setGrades((prev) => ({ ...prev, ...gradesMap }));
      }
    } catch (error) {
      console.error("Error fetching grades:", error);
    }
  };

  const handleGradeChange = (studentId: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    if (numValue >= 0 && numValue <= 100) {
      setGrades((prev) => ({ ...prev, [studentId]: numValue }));
    }
  };

  const handleSave = async () => {
    if (!user?.system_user_id) {
      toast.error("User not authenticated");
      return;
    }

    if (!isValidAssignment) {
      toast.error("You are not assigned to this subject-section combination");
      return;
    }

    setSaving(true);
    try {
      const gradeEntries = students.map((student) => {
        const grade = grades[student.id] || 0;
        const remarks = grade >= 75 ? "Passed" : "Failed";
        return {
          student_id: student.id,
          subject_id: subjectId,
          section_id: sectionId,
          grading_period: gradingPeriod,
          school_year: schoolYear,
          grade: grade,
          remarks: remarks,
          teacher_id: user.system_user_id,
        };
      });

      // Delete existing grades first
      await supabase
        .from("sms_grades")
        .delete()
        .eq("section_id", sectionId)
        .eq("subject_id", subjectId)
        .eq("grading_period", gradingPeriod)
        .eq("school_year", schoolYear);

      // Insert new grades
      const { error } = await supabase.from("sms_grades").insert(gradeEntries);

      if (error) throw error;

      toast.success("Grades saved successfully!");
    } catch (err) {
      console.error("Error saving grades:", err);
      toast.error("Failed to save grades");
    } finally {
      setSaving(false);
    }
  };

  if (isValidating) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Validating assignment...
      </div>
    );
  }

  if (!isValidAssignment) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        You are not assigned to this subject-section combination for the
        selected school year.
      </div>
    );
  }

  if (loading) {
    return <div className="text-center py-8">Loading students...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-md">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium">
                Student
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium">LRN</th>
              <th className="px-4 py-3 text-left text-sm font-medium w-32">
                Grade (0-100)
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium">
                Remarks
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {students.map((student) => {
              const grade = grades[student.id] || 0;
              const remarks =
                grade >= 75 ? "Passed" : grade > 0 ? "Failed" : "";
              return (
                <tr key={student.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3">
                    {student.last_name}, {student.first_name}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">{student.lrn}</td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={grade || ""}
                      onChange={(e) =>
                        handleGradeChange(student.id, e.target.value)
                      }
                      className="w-full"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-sm ${
                        remarks === "Passed"
                          ? "text-green-600"
                          : remarks === "Failed"
                          ? "text-red-600"
                          : "text-muted-foreground"
                      }`}
                    >
                      {remarks || "-"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Grades"}
        </Button>
      </div>
    </div>
  );
}
