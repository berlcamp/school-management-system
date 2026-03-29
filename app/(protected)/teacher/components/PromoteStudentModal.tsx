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
import { useGpaThresholds } from "@/hooks/useGpaThresholds";
import { getGradeLevelLabel } from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  getSuggestedSectionType,
  sectionTypeMatchesGpa,
} from "@/lib/utils/gpaThresholds";
import { SectionType, Student } from "@/types";
import { ArrowRight, GraduationCap, Loader2, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

const SECTION_TYPE_LABELS: Record<string, string> = {
  heterogeneous: "Heterogeneous",
  homogeneous_fast_learner: "Homogeneous - Fast learner",
  homogeneous_crack_section: "Homogeneous - Crack section",
  homogeneous_random: "Homogeneous - Random",
};

const TERMINAL_GRADES = [6, 10, 12];

interface SubjectGrade {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  quarters: Record<number, number>;
  finalAverage: number;
}

interface SectionOption {
  id: string;
  name: string;
  sectionType: SectionType | null;
  maxStudents: number | null;
  enrolledCount: number;
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
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");

  // SNED (-1) and Kindergarten (0) both promote to Grade 1
  const nextGradeLevel = gradeLevel <= 0 ? 1 : gradeLevel + 1;

  // Parse next school year from current: "2025-2026" → "2026-2027"
  const getNextSchoolYear = useCallback((currentYear: string): string => {
    const parts = currentYear.split("-");
    const startYear = parseInt(parts[1]);
    return `${startYear}-${startYear + 1}`;
  }, []);

  const nextSchoolYear = getNextSchoolYear(schoolYear);

  const fetchData = useCallback(async () => {
    if (!isOpen) return;

    setLoading(true);
    try {
      // 1. Fetch grades for this student in current section + school year, joined with subjects
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

      // 2. Fetch sections for next grade level + next school year
      let sectionsQuery = supabase
        .from("sms_sections")
        .select("id, name, section_type, max_students")
        .eq("is_active", true)
        .eq("grade_level", nextGradeLevel)
        .eq("school_year", nextSchoolYear)
        .order("name");

      if (schoolId != null) {
        sectionsQuery = sectionsQuery.eq("school_id", schoolId);
      }

      const { data: sectionsData } = await sectionsQuery;

      if (sectionsData && sectionsData.length > 0) {
        // 3. Fetch enrollment counts for each section
        const sectionIds = sectionsData.map((s) => s.id);
        const { data: enrollmentCounts } = await supabase
          .from("sms_enrollments")
          .select("section_id")
          .in("section_id", sectionIds)
          .eq("status", "approved")
          .eq("school_year", nextSchoolYear);

        const countMap = new Map<string, number>();
        if (enrollmentCounts) {
          for (const e of enrollmentCounts) {
            countMap.set(e.section_id, (countMap.get(e.section_id) || 0) + 1);
          }
        }

        const sectionOptions: SectionOption[] = sectionsData.map((s) => ({
          id: s.id,
          name: s.name,
          sectionType: s.section_type as SectionType | null,
          maxStudents: s.max_students,
          enrolledCount: countMap.get(s.id) || 0,
        }));

        setSections(sectionOptions);

        // Auto-suggest: filter by GPA match, then pick least-full section
        const matchingSections = sectionOptions
          .filter((s) =>
            sectionTypeMatchesGpa(s.sectionType, calculatedGpa, thresholds)
          )
          .filter(
            (s) => s.maxStudents == null || s.enrolledCount < s.maxStudents
          )
          .sort((a, b) => a.enrolledCount - b.enrolledCount);

        if (matchingSections.length > 0) {
          setSelectedSectionId(matchingSections[0].id);
        } else if (sectionOptions.length > 0) {
          // Fallback: pick least-full section that isn't full
          const available = sectionOptions
            .filter(
              (s) => s.maxStudents == null || s.enrolledCount < s.maxStudents
            )
            .sort((a, b) => a.enrolledCount - b.enrolledCount);
          if (available.length > 0) {
            setSelectedSectionId(available[0].id);
          }
        }
      } else {
        setSections([]);
        setSelectedSectionId("");
      }
    } catch (error) {
      console.error("Error fetching promotion data:", error);
      toast.error("Failed to load student data");
    } finally {
      setLoading(false);
    }
  }, [
    isOpen,
    student.id,
    sectionId,
    schoolYear,
    nextGradeLevel,
    nextSchoolYear,
    schoolId,
    thresholds,
  ]);

  useEffect(() => {
    if (isOpen) {
      setSelectedSectionId("");
      fetchData();
    }
  }, [isOpen, fetchData]);

  const handlePromote = async () => {
    if (!user?.system_user_id || !selectedSectionId) return;

    setSubmitting(true);
    try {
      // Check for duplicate enrollment
      const isSeniorHigh = nextGradeLevel >= 11 && nextGradeLevel <= 12;
      let existingQuery = supabase
        .from("sms_enrollments")
        .select("id")
        .eq("student_id", student.id)
        .eq("school_year", nextSchoolYear);

      if (schoolId != null) {
        existingQuery = existingQuery.eq("school_id", schoolId);
      }

      if (isSeniorHigh) {
        existingQuery = existingQuery.eq("semester", 1);
      } else {
        existingQuery = existingQuery.is("semester", null);
      }

      const { data: existing } = await existingQuery.maybeSingle();

      if (existing) {
        toast.error(
          `Student is already enrolled for school year ${nextSchoolYear}`
        );
        setSubmitting(false);
        return;
      }

      // Insert new enrollment
      const enrollmentData = {
        student_id: student.id,
        section_id: selectedSectionId,
        school_year: nextSchoolYear,
        grade_level: nextGradeLevel,
        ...(isSeniorHigh ? { semester: 1 } : { semester: null }),
        enrollment_date: new Date().toISOString().split("T")[0],
        status: "approved" as const,
        enrolled_by: user.system_user_id,
        approved_by: user.system_user_id,
        ...(schoolId != null && { school_id: schoolId }),
      };

      const { error: insertError } = await supabase
        .from("sms_enrollments")
        .insert([enrollmentData]);

      if (insertError) {
        if (
          insertError.code === "23505" &&
          insertError.message?.includes("uq_enrollments_student_school_year")
        ) {
          toast.error(
            `Student is already enrolled for school year ${nextSchoolYear}`
          );
          setSubmitting(false);
          return;
        }
        throw new Error(insertError.message);
      }

      // Mark current enrollment as completed
      const { error: completeError } = await supabase
        .from("sms_enrollments")
        .update({ enrollment_status: "completed" })
        .eq("id", enrollmentId);

      if (completeError) throw new Error(completeError.message);

      // Update student record
      const { error: updateError } = await supabase
        .from("sms_students")
        .update({
          grade_level: nextGradeLevel,
          current_section_id: selectedSectionId,
        })
        .eq("id", student.id);

      if (updateError) throw new Error(updateError.message);

      toast.success(
        `${student.last_name}, ${student.first_name} promoted to ${getGradeLevelLabel(nextGradeLevel)}!`
      );
      onPromoted();
      onClose();
    } catch (error) {
      console.error("Promotion error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to promote student"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const suggestedType = getSuggestedSectionType(gpa, thresholds);
  const selectedSection = sections.find((s) => s.id === selectedSectionId);

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
                Promote Student
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                {student.last_name}, {student.first_name}
                {student.middle_name && ` ${student.middle_name}`} &mdash;{" "}
                {getGradeLevelLabel(gradeLevel)}{" "}
                <ArrowRight className="inline h-3 w-3 mx-1" />{" "}
                {getGradeLevelLabel(nextGradeLevel)} (SY {nextSchoolYear})
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
                                : "—"}
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
                              : "—"}
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

            {/* Section Selection */}
            <div>
              <label className="text-sm font-medium flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Assign to Section ({getGradeLevelLabel(nextGradeLevel)} — SY{" "}
                {nextSchoolYear})
              </label>
              {sections.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground border rounded-md">
                  No sections available for {getGradeLevelLabel(nextGradeLevel)}{" "}
                  in SY {nextSchoolYear}. Please create sections first.
                </div>
              ) : (
                <>
                  <Select
                    value={selectedSectionId}
                    onValueChange={setSelectedSectionId}
                    disabled={submitting}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Select a section" />
                    </SelectTrigger>
                    <SelectContent>
                      {sections.map((s) => {
                        const isFull =
                          s.maxStudents != null &&
                          s.enrolledCount >= s.maxStudents;
                        return (
                          <SelectItem
                            key={s.id}
                            value={s.id}
                            disabled={isFull}
                          >
                            {s.name}
                            {s.sectionType &&
                              ` (${SECTION_TYPE_LABELS[s.sectionType] ?? s.sectionType})`}{" "}
                            — {s.enrolledCount}
                            {s.maxStudents != null
                              ? `/${s.maxStudents}`
                              : ""}{" "}
                            students
                            {isFull ? " (Full)" : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {selectedSection && (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Current enrollment: {selectedSection.enrolledCount}
                      {selectedSection.maxStudents != null
                        ? ` / ${selectedSection.maxStudents}`
                        : ""}{" "}
                      students
                    </p>
                  )}
                </>
              )}
            </div>
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
            disabled={
              submitting || loading || !selectedSectionId || sections.length === 0
            }
            className="h-11 min-w-[140px]"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Promoting...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />
                Promote Student
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
