"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { Student } from "@/types";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface GradeEntryTableProps {
  sectionId: string;
  subjectId: string;
  gradingPeriod: number;
  schoolYear: string;
}

export const GradeEntryTable = ({
  sectionId,
  subjectId,
  gradingPeriod,
  schoolYear,
}: GradeEntryTableProps) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const user = useAppSelector((state) => state.user.user);

  useEffect(() => {
    fetchStudents();
    fetchGrades();
  }, [sectionId, subjectId, gradingPeriod, schoolYear]);

  const fetchStudents = async () => {
    const { data: sectionStudents } = await supabase
      .from("sms_section_students")
      .select("student_id")
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear)
      .is("transferred_at", null);

    if (sectionStudents) {
      const studentIds = sectionStudents.map((ss) => ss.student_id);
      const { data } = await supabase
        .from("sms_students")
        .select("*")
        .in("id", studentIds)
        .order("last_name")
        .order("first_name");

      if (data) {
        setStudents(data);
        // Initialize grades object
        const initialGrades: Record<string, number> = {};
        data.forEach((student) => {
          initialGrades[student.id] = 0;
        });
        setGrades(initialGrades);
      }
    }
  };

  const fetchGrades = async () => {
    if (!students.length) return;

    const studentIds = students.map((s) => s.id);
    const { data } = await supabase
      .from("sms_grades")
      .select("*")
      .eq("section_id", sectionId)
      .eq("subject_id", subjectId)
      .eq("grading_period", gradingPeriod)
      .eq("school_year", schoolYear)
      .in("student_id", studentIds);

    if (data) {
      const gradesMap: Record<string, number> = {};
      data.forEach((grade) => {
        gradesMap[grade.student_id] = grade.grade;
      });
      setGrades((prev) => ({ ...prev, ...gradesMap }));
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
};
