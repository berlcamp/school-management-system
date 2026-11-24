"use client";

import { pointsFor, withPoints } from "@/lib/utils/finalPoints";
import { fetchApprovedAdjustments } from "@/lib/utils/gradeAdjustments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getGradeLevelLabel, isTerminalGrade } from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { fetchYearGradesForLearners } from "@/lib/utils/learnerYearRecords";
import { Student } from "@/types";
import { ArrowRight, ArrowUpRight, GraduationCap, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

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

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [subjectGrades, setSubjectGrades] = useState<SubjectGrade[]>([]);
  const [gpa, setGpa] = useState<number | null>(null);

  const isTerminal = isTerminalGrade(gradeLevel);
  // SNED (-1) and Kindergarten (0) both promote to Grade 1
  const nextGradeLevel = gradeLevel <= 0 ? 1 : gradeLevel + 1;

  const fetchData = useCallback(async () => {
    if (!isOpen) return;

    setLoading(true);
    try {
      // The learner's grades for the year — including quarters encoded in an
      // earlier section of this grade if they changed section mid-year, so the
      // decision is made on the whole year (lib/utils/learnerYearRecords.ts).
      const gradesData = await fetchYearGradesForLearners({
        sectionId,
        schoolYear,
        learnerIds: [String(student.id)],
      });
      const subjectIds = [...new Set(gradesData.map((g) => g.subject_id))];
      const { data: subjectRows } = subjectIds.length
        ? await supabase
            .from("sms_subjects")
            .select("id, name, code")
            .in("id", subjectIds.map(Number))
        : { data: [] as Array<{ id: string; name: string; code: string }> };
      const subjectById = new Map(
        (subjectRows ?? []).map((s) => [String(s.id), s]),
      );

      // Build subject grades map
      const subjectMap = new Map<string, SubjectGrade>();

      if (gradesData) {
        for (const g of gradesData) {
          const found = subjectById.get(g.subject_id);
          if (!found) continue;
          const subject = {
            id: String(found.id),
            name: found.name as string,
            code: found.code as string,
          };

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

      const adjustments = await fetchApprovedAdjustments([student.id], schoolYear);

      // Calculate final averages per subject (rounded to integer)
      const subjectGradesList = Array.from(subjectMap.values()).map((sg) => {
        const quarterValues = Object.values(sg.quarters).filter((v) => v > 0);
        sg.finalAverage =
          quarterValues.length > 0
            ? withPoints(
                Math.round(quarterValues.reduce((s, v) => s + v, 0) / quarterValues.length),
                Math.round(
                  pointsFor(
                    adjustments,
                    student.id,
                    sg.subjectId,
                    schoolYear,
                    Object.entries(sg.quarters)
                      .filter(([, v]) => v > 0)
                      .map(([p]) => Number(p)),
                  ),
                ),
              )
            : 0;
        return sg;
      });

      subjectGradesList.sort((a, b) =>
        a.subjectName.localeCompare(b.subjectName)
      );
      setSubjectGrades(subjectGradesList);

      // Calculate overall GPA from per-subject rounded finals
      const subjectFinals = subjectGradesList
        .map((sg) => sg.finalAverage)
        .filter((v) => v > 0);
      const calculatedGpa =
        subjectFinals.length > 0
          ? Math.round(subjectFinals.reduce((s, v) => s + v, 0) / subjectFinals.length)
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

      // Mark current enrollment as promoted/graduated. school_id guard
      // prevents cross-tenant updates if RLS is ever weakened.
      let statusUpdate = supabase
        .from("sms_enrollments")
        .update({ enrollment_status: newStatus })
        .eq("id", Number(enrollmentId));
      if (schoolId != null) {
        statusUpdate = statusUpdate.eq("school_id", Number(schoolId));
      }
      const { error: statusError } = await statusUpdate;

      if (statusError) throw new Error(statusError.message);

      // Update student record. enrollment_status is synced automatically by
      // the trg_sync_student_enrollment_status trigger (migration 056).
      const studentPatch: Record<string, unknown> = {
        current_section_id: null,
      };
      if (!isTerminal) {
        studentPatch.grade_level = nextGradeLevel;
      }
      let studentUpdate = supabase
        .from("sms_students")
        .update(studentPatch)
        .eq("id", student.id);
      if (schoolId != null) {
        studentUpdate = studentUpdate.eq("school_id", Number(schoolId));
      }
      const { error: updateError } = await studentUpdate;
      if (updateError) throw new Error(updateError.message);

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
                    <thead className="app__table_thead">
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
                                ? Math.round(sg.quarters[q])
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
                              ? Math.round(sg.finalAverage)
                              : "\u2014"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Overall GPA */}
            <div className="flex flex-wrap gap-4">
              <div className="rounded-lg bg-muted px-4 py-3 flex-1 min-w-[200px]">
                <p className="text-xs text-muted-foreground mb-1">
                  Overall GPA
                </p>
                <p className="text-2xl font-bold">
                  {gpa != null ? Math.round(gpa) : "N/A"}
                </p>
              </div>
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
