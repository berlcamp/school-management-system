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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGpaThresholds } from "@/hooks/useGpaThresholds";
import { getGradeLevelLabel, GRADE_LEVELS } from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { getSuggestedSectionType } from "@/lib/utils/gpaThresholds";
import {
  batchAutoAssignSections,
  SectionCandidate,
} from "@/lib/utils/sectionAssignment";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { SectionType, Student } from "@/types";
import {
  CheckCircle2,
  ClipboardList,
  Loader2,
  Shuffle,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

interface PromotedStudent {
  studentId: string;
  enrollmentId: string;
  student: Student;
  previousGradeLevel: number;
  currentGradeLevel: number;
  gpa: number | null;
  schoolYear: string;
}

interface EnrollExistingStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEnrolled: () => void;
}

const SECTION_TYPE_LABELS: Record<string, string> = {
  heterogeneous: "Heterogeneous",
  homogeneous_fast_learner: "Fast Learner",
  homogeneous_crack_section: "Crack Section",
  homogeneous_random: "Random",
};

export function EnrollExistingStudentsModal({
  isOpen,
  onClose,
  onEnrolled,
}: EnrollExistingStudentsModalProps) {
  const user = useAppSelector((state) => state.user.user);
  const { thresholds } = useGpaThresholds(isOpen, user?.school_id);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [students, setStudents] = useState<PromotedStudent[]>([]);
  const [sections, setSections] = useState<SectionCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignments, setAssignments] = useState<Map<string, string>>(
    new Map()
  );

  // Filters
  const [filterGradeLevel, setFilterGradeLevel] = useState<string>("");
  const [targetSchoolYear, setTargetSchoolYear] = useState<string>(
    getCurrentSchoolYear()
  );

  const schoolYearOptions = useMemo(() => getSchoolYearOptions(1, 2), []);

  // Derive the target grade level from the filter
  // filterGradeLevel = the grade students WERE in when promoted
  // target grade = filterGradeLevel + 1 (or 1 for SNED/Kinder)
  const targetGradeLevel = useMemo(() => {
    if (!filterGradeLevel) return null;
    const gl = parseInt(filterGradeLevel);
    return gl <= 0 ? 1 : gl + 1;
  }, [filterGradeLevel]);

  const fetchPromotedStudents = useCallback(async () => {
    if (!filterGradeLevel || !user) return;

    setLoading(true);
    setStudents([]);
    setSections([]);
    setSelectedIds(new Set());
    setAssignments(new Map());

    try {
      const gradeLevel = parseInt(filterGradeLevel);

      // 1. Fetch promoted enrollments for the selected grade level
      let enrollmentQuery = supabase
        .from("sms_enrollments")
        .select(
          `
          id,
          student_id,
          grade_level,
          section_id,
          school_year,
          student:sms_students!sms_enrollments_student_id_fkey(*)
        `
        )
        .eq("enrollment_status", "promoted")
        .eq("status", "approved")
        .eq("grade_level", gradeLevel);

      if (user.school_id != null) {
        enrollmentQuery = enrollmentQuery.eq("school_id", user.school_id);
      }

      const { data: enrollmentsData, error: enrollError } =
        await enrollmentQuery.order("created_at", { ascending: false });

      if (enrollError) throw new Error(enrollError.message);
      if (!enrollmentsData || enrollmentsData.length === 0) {
        setStudents([]);
        setLoading(false);
        return;
      }

      // Filter out students that already have enrollment in the target school year
      const studentIds = enrollmentsData.map((e) => e.student_id);
      let existingQuery = supabase
        .from("sms_enrollments")
        .select("student_id")
        .in("student_id", studentIds)
        .eq("school_year", targetSchoolYear)
        .eq("status", "approved");

      if (user.school_id != null) {
        existingQuery = existingQuery.eq("school_id", user.school_id);
      }

      const { data: existingEnrollments } = await existingQuery;
      const alreadyEnrolledIds = new Set(
        (existingEnrollments || []).map((e) => e.student_id)
      );

      // Filter to only students not yet enrolled in target SY
      const eligibleEnrollments = enrollmentsData.filter(
        (e) => !alreadyEnrolledIds.has(e.student_id)
      );

      if (eligibleEnrollments.length === 0) {
        setStudents([]);
        setLoading(false);
        return;
      }

      // 2. Batch fetch grades for GPA calculation
      const eligibleStudentIds = eligibleEnrollments.map((e) => e.student_id);
      const sectionIds = [
        ...new Set(eligibleEnrollments.map((e) => e.section_id)),
      ];

      const { data: gradesData } = await supabase
        .from("sms_grades")
        .select("student_id, grade")
        .in("student_id", eligibleStudentIds)
        .in("section_id", sectionIds);

      // Compute GPA per student
      const gpaMap = new Map<string, number>();
      if (gradesData) {
        const studentGrades = new Map<string, number[]>();
        for (const g of gradesData) {
          if (g.grade > 0) {
            if (!studentGrades.has(g.student_id)) {
              studentGrades.set(g.student_id, []);
            }
            studentGrades.get(g.student_id)!.push(g.grade);
          }
        }
        for (const [sid, grades] of studentGrades) {
          const avg =
            Math.round(
              (grades.reduce((s, v) => s + v, 0) / grades.length) * 100
            ) / 100;
          gpaMap.set(sid, avg);
        }
      }

      // Build promoted students list
      const promoted: PromotedStudent[] = eligibleEnrollments
        .map((e) => {
          const student = Array.isArray(e.student)
            ? e.student[0]
            : (e.student as Student);
          if (!student) return null;

          const nextGrade = e.grade_level <= 0 ? 1 : e.grade_level + 1;
          return {
            studentId: e.student_id,
            enrollmentId: e.id,
            student,
            previousGradeLevel: e.grade_level,
            currentGradeLevel: nextGrade,
            gpa: gpaMap.get(e.student_id) ?? null,
            schoolYear: e.school_year,
          };
        })
        .filter((s): s is PromotedStudent => s !== null)
        .sort((a, b) => {
          const nameA = `${a.student.last_name}, ${a.student.first_name}`;
          const nameB = `${b.student.last_name}, ${b.student.first_name}`;
          return nameA.localeCompare(nameB);
        });

      setStudents(promoted);

      // 3. Fetch sections for the target grade level + school year
      if (targetGradeLevel != null) {
        let sectionsQuery = supabase
          .from("sms_sections")
          .select("id, name, section_type, max_students")
          .eq("is_active", true)
          .eq("grade_level", targetGradeLevel)
          .eq("school_year", targetSchoolYear)
          .order("name");

        if (user.school_id != null) {
          sectionsQuery = sectionsQuery.eq("school_id", user.school_id);
        }

        const { data: sectionsData } = await sectionsQuery;

        if (sectionsData && sectionsData.length > 0) {
          const secIds = sectionsData.map((s) => s.id);
          const { data: enrollmentCounts } = await supabase
            .from("sms_enrollments")
            .select("section_id")
            .in("section_id", secIds)
            .eq("status", "approved")
            .eq("enrollment_status", "active")
            .eq("school_year", targetSchoolYear);

          const countMap = new Map<string, number>();
          if (enrollmentCounts) {
            for (const e of enrollmentCounts) {
              countMap.set(
                e.section_id,
                (countMap.get(e.section_id) || 0) + 1
              );
            }
          }

          const sectionOptions: SectionCandidate[] = sectionsData.map((s) => ({
            id: s.id,
            name: s.name,
            sectionType: s.section_type as SectionType | null,
            maxStudents: s.max_students,
            enrolledCount: countMap.get(s.id) || 0,
          }));

          setSections(sectionOptions);
        } else {
          setSections([]);
        }
      }
    } catch (error) {
      console.error("Error fetching promoted students:", error);
      toast.error("Failed to load promoted students");
    } finally {
      setLoading(false);
    }
  }, [filterGradeLevel, targetSchoolYear, targetGradeLevel, user]);

  useEffect(() => {
    if (isOpen && filterGradeLevel) {
      fetchPromotedStudents();
    }
  }, [isOpen, fetchPromotedStudents, filterGradeLevel]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStudents([]);
      setSections([]);
      setSelectedIds(new Set());
      setAssignments(new Map());
      setFilterGradeLevel("");
    }
  }, [isOpen]);

  // Toggle select all
  const handleSelectAll = () => {
    if (selectedIds.size === students.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(students.map((s) => s.studentId)));
    }
  };

  // Toggle individual student
  const handleToggleStudent = (studentId: string) => {
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

  // Auto-assign sections for selected students
  const handleAutoAssign = () => {
    if (sections.length === 0) {
      toast.error("No sections available for this grade level and school year");
      return;
    }

    const selectedStudents = students
      .filter((s) => selectedIds.has(s.studentId))
      .map((s) => ({ studentId: s.studentId, gpa: s.gpa }));

    if (selectedStudents.length === 0) {
      toast.error("Please select at least one student");
      return;
    }

    const newAssignments = batchAutoAssignSections(
      selectedStudents,
      sections,
      thresholds
    );

    setAssignments((prev) => {
      const merged = new Map(prev);
      for (const [sid, secId] of newAssignments) {
        merged.set(sid, secId);
      }
      return merged;
    });

    const assignedCount = newAssignments.size;
    const failedCount = selectedStudents.length - assignedCount;

    if (failedCount > 0) {
      toast.error(
        `Assigned ${assignedCount} students. ${failedCount} could not be assigned (sections may be full).`
      );
    } else {
      toast.success(`Auto-assigned ${assignedCount} students to sections`);
    }
  };

  // Mark selected students as enrolled
  const handleEnroll = async () => {
    if (!user?.system_user_id) return;

    // Validate all selected students have assignments
    const selectedStudents = students.filter((s) =>
      selectedIds.has(s.studentId)
    );
    const unassigned = selectedStudents.filter(
      (s) => !assignments.has(s.studentId)
    );

    if (unassigned.length > 0) {
      toast.error(
        `${unassigned.length} selected student(s) have no section assigned. Use "Auto Assign" first.`
      );
      return;
    }

    if (selectedStudents.length === 0) {
      toast.error("Please select at least one student");
      return;
    }

    setSubmitting(true);
    try {
      const BATCH_SIZE = 500;
      let successCount = 0;
      let skipCount = 0;

      // Build enrollment records
      const records = selectedStudents.map((s) => ({
        student_id: s.studentId,
        section_id: assignments.get(s.studentId)!,
        school_year: targetSchoolYear,
        grade_level: s.currentGradeLevel,
        semester:
          s.currentGradeLevel >= 11 && s.currentGradeLevel <= 12 ? 1 : null,
        enrollment_date: new Date().toISOString().split("T")[0],
        status: "approved" as const,
        enrollment_status: "active" as const,
        enrolled_by: user.system_user_id,
        approved_by: user.system_user_id,
        ...(user.school_id != null && { school_id: user.school_id }),
      }));

      // Insert in batches
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        const { error: insertError } = await supabase
          .from("sms_enrollments")
          .insert(batch);

        if (insertError) {
          if (
            insertError.code === "23505" &&
            insertError.message?.includes("uq_enrollments_student_school_year")
          ) {
            skipCount += batch.length;
            continue;
          }
          throw new Error(insertError.message);
        }
        successCount += batch.length;
      }

      // Update student records: set current_section_id and enrollment_status
      for (const s of selectedStudents) {
        const sectionId = assignments.get(s.studentId);
        if (!sectionId) continue;

        await supabase
          .from("sms_students")
          .update({
            current_section_id: sectionId,
            enrollment_status: "enrolled",
          })
          .eq("id", s.studentId);
      }

      // Mark old promoted enrollments as completed
      const enrollmentIds = selectedStudents.map((s) => s.enrollmentId);
      for (let i = 0; i < enrollmentIds.length; i += BATCH_SIZE) {
        const batch = enrollmentIds.slice(i, i + BATCH_SIZE);
        await supabase
          .from("sms_enrollments")
          .update({ enrollment_status: "completed" })
          .in("id", batch);
      }

      if (skipCount > 0) {
        toast.success(
          `Enrolled ${successCount} students. ${skipCount} were already enrolled and skipped.`
        );
      } else {
        toast.success(`Successfully enrolled ${successCount} students!`);
      }

      onEnrolled();
      onClose();
    } catch (error) {
      console.error("Enrollment error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to enroll students"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const getSectionName = (sectionId: string) => {
    return sections.find((s) => s.id === sectionId)?.name ?? "—";
  };

  const assignedCount = [...selectedIds].filter((id) =>
    assignments.has(id)
  ).length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-[1100px] max-h-[90vh] overflow-hidden flex flex-col p-0"
        onEscapeKeyDown={(e) => submitting && e.preventDefault()}
        onInteractOutside={(e) => submitting && e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <ClipboardList className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold">
                Enroll Existing Students
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                Select promoted students and assign them to sections for
                enrollment.
              </DialogDescription>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 pt-2">
            <div className="w-[200px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Promoted From (Grade Level)
              </label>
              <Select
                value={filterGradeLevel}
                onValueChange={setFilterGradeLevel}
                disabled={submitting}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select grade" />
                </SelectTrigger>
                <SelectContent>
                  {GRADE_LEVELS.map((gl) => (
                    <SelectItem key={gl} value={String(gl)}>
                      {getGradeLevelLabel(gl)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[180px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Target School Year
              </label>
              <Select
                value={targetSchoolYear}
                onValueChange={setTargetSchoolYear}
                disabled={submitting}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {schoolYearOptions.map((sy) => (
                    <SelectItem key={sy} value={sy}>
                      {sy}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {targetGradeLevel != null && (
              <div className="flex items-end">
                <span className="text-sm text-muted-foreground pb-2">
                  Enrolling into: <strong>{getGradeLevelLabel(targetGradeLevel)}</strong>
                </span>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!filterGradeLevel ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Users className="h-12 w-12 mb-3" />
              <p className="text-sm">
                Select a grade level to view promoted students
              </p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">
                Loading promoted students...
              </span>
            </div>
          ) : students.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Users className="h-12 w-12 mb-3" />
              <p className="text-sm font-medium">No promoted students found</p>
              <p className="text-xs mt-1">
                No students with &quot;Promoted&quot; status in{" "}
                {getGradeLevelLabel(parseInt(filterGradeLevel))} are available
                for enrollment in SY {targetSchoolYear}.
              </p>
            </div>
          ) : (
            <>
              {/* Info bar */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {selectedIds.size}
                  </span>{" "}
                  of {students.length} selected
                  {assignedCount > 0 && (
                    <span className="ml-2">
                      ({assignedCount} with sections assigned)
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAutoAssign}
                    disabled={
                      selectedIds.size === 0 ||
                      sections.length === 0 ||
                      submitting
                    }
                  >
                    <Shuffle className="h-3.5 w-3.5 mr-1.5" />
                    Auto Assign Sections
                  </Button>
                </div>
              </div>

              {sections.length === 0 && targetGradeLevel != null && (
                <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 px-4 py-3">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    No sections found for{" "}
                    {getGradeLevelLabel(targetGradeLevel)} in SY{" "}
                    {targetSchoolYear}. Please create sections first before
                    enrolling students.
                  </p>
                </div>
              )}

              {/* Student Table */}
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-3 py-2.5 text-left w-10">
                        <Checkbox
                          checked={
                            students.length > 0 &&
                            selectedIds.size === students.length
                          }
                          onChange={handleSelectAll}
                          disabled={submitting}
                        />
                      </th>
                      <th className="px-3 py-2.5 text-left font-medium">
                        Student Name
                      </th>
                      <th className="px-3 py-2.5 text-left font-medium">
                        LRN
                      </th>
                      <th className="px-3 py-2.5 text-center font-medium w-20">
                        GPA
                      </th>
                      <th className="px-3 py-2.5 text-left font-medium">
                        Suggested Section
                      </th>
                      <th className="px-3 py-2.5 text-left font-medium">
                        Assigned Section
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {students.map((s) => {
                      const suggested = getSuggestedSectionType(
                        s.gpa,
                        thresholds
                      );
                      const assignedSectionId = assignments.get(s.studentId);

                      return (
                        <tr
                          key={s.studentId}
                          className={`hover:bg-muted/50 transition-colors ${
                            selectedIds.has(s.studentId) ? "bg-muted/30" : ""
                          }`}
                        >
                          <td className="px-3 py-2.5">
                            <Checkbox
                              checked={selectedIds.has(s.studentId)}
                              onChange={() =>
                                handleToggleStudent(s.studentId)
                              }
                              disabled={submitting}
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-medium">
                              {s.student.last_name}, {s.student.first_name}
                              {s.student.middle_name &&
                                ` ${s.student.middle_name.charAt(0)}.`}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                            {s.student.lrn}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {s.gpa != null ? (
                              <span className="font-semibold">
                                {s.gpa.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">N/A</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {suggested ? (
                              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                {suggested}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {assignedSectionId ? (
                              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                {getSectionName(assignedSectionId)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Not assigned
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t gap-3 sm:gap-2">
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
            onClick={handleEnroll}
            disabled={
              submitting ||
              loading ||
              selectedIds.size === 0 ||
              sections.length === 0
            }
            className="h-11 min-w-[160px]"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Enrolling...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Mark as Enrolled ({selectedIds.size})
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
