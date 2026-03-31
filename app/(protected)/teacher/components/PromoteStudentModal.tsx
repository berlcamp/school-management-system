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
import { useGpaThresholds } from "@/hooks/useGpaThresholds";
import { getGradeLevelLabel } from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { getSuggestedSectionType } from "@/lib/utils/gpaThresholds";
import { Student } from "@/types";
import { ArrowRight, ArrowUpRight, GraduationCap, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

const TERMINAL_GRADES = [6, 10, 12];

interface SubjectGrade {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  quarters: Record<number, number>;
  finalAverage: number;
}

interface PromoteStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  enrollmentId: string;
  gradeLevel: number;
  sectionId: string;
  schoolYear: string;
  schoolId: string | null;
  onPromoted: () => void;
}

export function PromoteStudentModal({
  isOpen,
  onClose,
  student,
  enrollmentId,
  gradeLevel,
  sectionId,
  schoolYear,
  schoolId,
  onPromoted,
}: PromoteStudentModalProps) {
  const user = useAppSelector((state) => state.user.user);
  const { thresholds } = useGpaThresholds(isOpen);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [subjectGrades, setSubjectGrades] = useState<SubjectGrade[]>([]);
  const [gpa, setGpa] = useState<number | null>(null);

  const isTerminal = TERMINAL_GRADES.includes(gradeLevel);
  // SNED (-1) and Kindergarten (0) both promote to Grade 1
  const nextGradeLevel = gradeLevel <= 0 ? 1 : gradeLevel + 1;

  const fetchData = useCallback(async () => {
    if (!isOpen) return;

    setLoading(true);
    try {
      // Fetch grades for this student in current section + school year
      const { data: gradesData } = await supabase
        .from("sms_grades")
        .select(
          `
          grade,
          grading_period,
          subject_id,
          subject:sms_subjects!sms_grades_subject_id_fkey(id, name, code)
        `
        )
        .eq("student_id", student.id)
        .eq("section_id", sectionId)
        .eq("school_year", schoolYear);

      // Build subject grades map
      const subjectMap = new Map<string, SubjectGrade>();

      if (gradesData) {
        for (const g of gradesData) {
          const subject = Array.isArray(g.subject)
            ? g.subject[0]
            : (g.subject as { id: string; name: string; code: string } | null);
          if (!subject) continue;

          if (!subjectMap.has(subject.id)) {
            subjectMap.set(subject.id, {
              subjectId: subject.id,
              subjectName: subject.name,
              subjectCode: subject.code,
              quarters: {},
              finalAverage: 0,
            });
          }

          const entry = subjectMap.get(subject.id)!;
          entry.quarters[g.grading_period] = g.grade;
        }
      }

      // Calculate final averages per subject
      const subjectGradesList = Array.from(subjectMap.values()).map((sg) => {
        const quarterValues = Object.values(sg.quarters).filter((v) => v > 0);
        sg.finalAverage =
          quarterValues.length > 0
            ? Math.round(
                (quarterValues.reduce((s, v) => s + v, 0) /
                  quarterValues.length) *
                  100
              ) / 100
            : 0;
        return sg;
      });

      subjectGradesList.sort((a, b) =>
        a.subjectName.localeCompare(b.subjectName)
      );
      setSubjectGrades(subjectGradesList);

      // Calculate overall GPA
      const allGradeValues = gradesData
        ? gradesData.map((g) => g.grade).filter((v) => v > 0)
        : [];
      const calculatedGpa =
        allGradeValues.length > 0
          ? Math.round(
              (allGradeValues.reduce((s, v) => s + v, 0) /
                allGradeValues.length) *
                100
            ) / 100
          : null;
      setGpa(calculatedGpa);
    } catch (error) {
      console.error("Error fetching promotion data:", error);
      toast.error("Failed to load student data");
    } finally {
      setLoading(false);
    }
  }, [isOpen, student.id, sectionId, schoolYear]);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, fetchData]);

  const handlePromote = async () => {
    if (!user?.system_user_id) return;

    setSubmitting(true);
    try {
      const newStatus = isTerminal ? "graduated" : "promoted";

      // Mark current enrollment as promoted/graduated
      const { error: statusError } = await supabase
        .from("sms_enrollments")
        .update({ enrollment_status: newStatus })
        .eq("id", enrollmentId);

      if (statusError) throw new Error(statusError.message);

      // Update student record
      if (isTerminal) {
        // Graduated: update enrollment_status on student, clear section
        const { error: updateError } = await supabase
          .from("sms_students")
          .update({
            enrollment_status: "graduated",
            current_section_id: null,
          })
          .eq("id", student.id);

        if (updateError) throw new Error(updateError.message);
      } else {
        // Promoted: bump grade level, clear section (will be assigned during enrollment)
        const { error: updateError } = await supabase
          .from("sms_students")
          .update({
            grade_level: nextGradeLevel,
            current_section_id: null,
          })
          .eq("id", student.id);

        if (updateError) throw new Error(updateError.message);
      }

      const actionLabel = isTerminal ? "graduated" : "promoted";
      toast.success(
        `${student.last_name}, ${student.first_name} ${actionLabel}${
          !isTerminal ? ` to ${getGradeLevelLabel(nextGradeLevel)}` : ""
        }!`
      );
      onPromoted();
      onClose();
    } catch (error) {
      console.error("Promotion error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to process student"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const suggestedType = getSuggestedSectionType(gpa, thresholds);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-3 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <GraduationCap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold">
                {isTerminal ? "Graduate Student" : "Promote Student"}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                {student.last_name}, {student.first_name}
                {student.middle_name && ` ${student.middle_name}`} &mdash;{" "}
                {getGradeLevelLabel(gradeLevel)}
                {!isTerminal && (
                  <>
                    {" "}
                    <ArrowRight className="inline h-3 w-3 mx-1" />{" "}
                    {getGradeLevelLabel(nextGradeLevel)}
                  </>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">
              Loading student grades...
            </span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Grades Table */}
            <div>
              <h3 className="text-sm font-medium mb-3">
                Grades — {getGradeLevelLabel(gradeLevel)} (SY {schoolYear})
              </h3>
              {subjectGrades.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground border rounded-md">
                  No grades recorded for this student
                </div>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">
                          Subject
                        </th>
                        <th className="px-3 py-2 text-center font-medium w-16">
                          Q1
                        </th>
                        <th className="px-3 py-2 text-center font-medium w-16">
                          Q2
                        </th>
                        <th className="px-3 py-2 text-center font-medium w-16">
                          Q3
                        </th>
                        <th className="px-3 py-2 text-center font-medium w-16">
                          Q4
                        </th>
                        <th className="px-3 py-2 text-center font-medium w-20">
                          Final
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {subjectGrades.map((sg) => (
                        <tr key={sg.subjectId}>
                          <td className="px-3 py-2">
                            <span className="font-medium">
                              {sg.subjectName}
                            </span>
                            <span className="text-muted-foreground ml-1 text-xs">
                              ({sg.subjectCode})
                            </span>
                          </td>
                          {[1, 2, 3, 4].map((q) => (
                            <td
                              key={q}
                              className={`px-3 py-2 text-center ${
                                sg.quarters[q] != null && sg.quarters[q] < 75
                                  ? "text-destructive font-medium"
                                  : ""
                              }`}
                            >
                              {sg.quarters[q] != null
                                ? sg.quarters[q].toFixed(0)
                                : "\u2014"}
                            </td>
                          ))}
                          <td
                            className={`px-3 py-2 text-center font-semibold ${
                              sg.finalAverage > 0 && sg.finalAverage < 75
                                ? "text-destructive"
                                : ""
                            }`}
                          >
                            {sg.finalAverage > 0
                              ? sg.finalAverage.toFixed(2)
                              : "\u2014"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* GPA & Suggested Section Type */}
            <div className="flex flex-wrap gap-4">
              <div className="rounded-lg bg-muted px-4 py-3 flex-1 min-w-[200px]">
                <p className="text-xs text-muted-foreground mb-1">
                  Overall GPA
                </p>
                <p className="text-2xl font-bold">
                  {gpa != null ? gpa.toFixed(2) : "N/A"}
                </p>
              </div>
              {suggestedType && (
                <div className="rounded-lg bg-green-100 dark:bg-green-900/30 px-4 py-3 flex-1 min-w-[200px]">
                  <p className="text-xs text-muted-foreground mb-1">
                    Suggested Section Type
                  </p>
                  <p className="text-lg font-semibold text-green-800 dark:text-green-200">
                    {suggestedType}
                  </p>
                </div>
              )}
            </div>

            {isTerminal && (
              <div className="rounded-lg border border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-900/20 px-4 py-3">
                <p className="text-sm text-purple-800 dark:text-purple-200">
                  This student is in {getGradeLevelLabel(gradeLevel)}, a terminal
                  grade level. They will be marked as <strong>graduated</strong>.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-3 pt-4 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
            className="h-11 min-w-[100px]"
          >
            Cancel
          </Button>
          <Button
            onClick={handlePromote}
            disabled={submitting || loading}
            className="h-11 min-w-[140px]"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {isTerminal ? "Graduating..." : "Promoting..."}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                {isTerminal ? (
                  <GraduationCap className="h-4 w-4" />
                ) : (
                  <ArrowUpRight className="h-4 w-4" />
                )}
                {isTerminal ? "Graduate Student" : "Promote Student"}
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
