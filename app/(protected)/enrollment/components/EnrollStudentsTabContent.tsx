"use client";

import { Button } from "@/components/ui/button";
import { formatLrn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getGradeLevelLabel, GRADE_LEVELS } from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import { getSuggestedSectionType } from "@/lib/utils/gpaThresholds";
import type { GpaThresholds } from "@/lib/utils/gpaThresholds";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import {
  batchAutoAssignSections,
  classifyGpaBucket,
  GpaDistribution,
  SectionCandidate,
} from "@/lib/utils/sectionAssignment";
import { SectionType, Student } from "@/types";
import type { RootState } from "@/lib/redux";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CheckCircle2,
  HelpCircle,
  Loader2,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

export type EnrollMode = "promoted" | "retained";

interface EnrollCandidate {
  studentId: string;
  enrollmentId: string;
  student: Student;
  previousGradeLevel: number;
  currentGradeLevel: number;
  gpa: number | null;
  gender: "male" | "female" | null;
  schoolYear: string;
}

interface EnrollStudentsTabContentProps {
  mode: EnrollMode;
  isOpen: boolean;
  onClose: () => void;
  onEnrolled: () => void;
  user: RootState["user"]["user"];
  thresholds: GpaThresholds;
  onSubmittingChange: (submitting: boolean) => void;
}

const MODE_CONFIG = {
  promoted: {
    gradeLabel: "Promoted From (Grade Level)",
    statusLabel: "Promoted",
    emptyPrompt: "promoted",
  },
  retained: {
    gradeLabel: "Retained from (Grade Level)",
    statusLabel: "Retained",
    emptyPrompt: "retained",
  },
};

export function EnrollStudentsTabContent({
  mode,
  isOpen,
  onClose,
  onEnrolled,
  user,
  thresholds,
  onSubmittingChange,
}: EnrollStudentsTabContentProps) {
  const config = MODE_CONFIG[mode];

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [students, setStudents] = useState<EnrollCandidate[]>([]);
  const [sections, setSections] = useState<SectionCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignments, setAssignments] = useState<Map<string, string>>(
    new Map(),
  );

  // Filters
  const [filterGradeLevel, setFilterGradeLevel] = useState<string>("");
  const [targetSchoolYear, setTargetSchoolYear] = useState<string>(
    getCurrentSchoolYear(),
  );

  const schoolYearOptions = useMemo(() => getSchoolYearOptions(1, 2), []);

  // Derive the target grade level from the filter
  const targetGradeLevel = useMemo(() => {
    if (!filterGradeLevel) return null;
    const gl = parseInt(filterGradeLevel);
    if (mode === "retained") return gl;
    return gl <= 0 ? 1 : gl + 1;
  }, [filterGradeLevel, mode]);

  const computeTargetGrade = useCallback(
    (gradeLevel: number) => {
      if (mode === "retained") return gradeLevel;
      return gradeLevel <= 0 ? 1 : gradeLevel + 1;
    },
    [mode],
  );

  const fetchStudents = useCallback(async () => {
    if (!filterGradeLevel || !user) return;

    setLoading(true);
    setStudents([]);
    setSections([]);
    setSelectedIds(new Set());
    setAssignments(new Map());

    try {
      const gradeLevel = parseInt(filterGradeLevel);

      // Compute the source school year (one year before the target)
      const [targetStart] = targetSchoolYear.split("-");
      const sourceSchoolYear = `${parseInt(targetStart) - 1}-${targetStart}`;

      // 1. Fetch enrollments for the selected grade level and mode
      // Filter to source school year only — prevents cross-year grade contamination
      // when a student was retained across years in sections of different types.
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
        `,
        )
        .eq("enrollment_status", mode)
        .eq("status", "approved")
        .eq("grade_level", gradeLevel)
        .eq("school_year", sourceSchoolYear);

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
        (existingEnrollments || []).map((e) => e.student_id),
      );

      // Filter to only students not yet enrolled in target SY
      const eligibleEnrollments = enrollmentsData.filter(
        (e) => !alreadyEnrolledIds.has(e.student_id),
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
        .in("section_id", sectionIds)
        .eq("school_year", sourceSchoolYear);

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
          const avg = Math.round(
            grades.reduce((s, v) => s + v, 0) / grades.length,
          );
          gpaMap.set(sid, avg);
        }
      }

      // Build student list
      const candidates: EnrollCandidate[] = eligibleEnrollments
        .map((e) => {
          const student = Array.isArray(e.student)
            ? e.student[0]
            : (e.student as Student);
          if (!student) return null;

          const studentGender =
            student.gender === "male" || student.gender === "female"
              ? student.gender
              : null;
          return {
            studentId: e.student_id,
            enrollmentId: e.id,
            student,
            previousGradeLevel: e.grade_level,
            currentGradeLevel: computeTargetGrade(e.grade_level),
            gpa: gpaMap.get(e.student_id) ?? null,
            gender: studentGender,
            schoolYear: e.school_year,
          };
        })
        .filter((s): s is EnrollCandidate => s !== null)
        .sort((a, b) => {
          const nameA = `${a.student.last_name}, ${a.student.first_name}`;
          const nameB = `${b.student.last_name}, ${b.student.first_name}`;
          return nameA.localeCompare(nameB);
        });

      setStudents(candidates);

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

          // Fetch enrollments with student gender for count + gender breakdown
          const { data: enrollmentRows } = await supabase
            .from("sms_enrollments")
            .select(
              "section_id, student:sms_students!sms_enrollments_student_id_fkey(gender)",
            )
            .in("section_id", secIds)
            .eq("status", "approved")
            .eq("enrollment_status", "active")
            .eq("school_year", targetSchoolYear);

          const countMap = new Map<string, number>();
          const genderMap = new Map<
            string,
            { male: number; female: number }
          >();
          if (enrollmentRows) {
            for (const row of enrollmentRows) {
              countMap.set(
                row.section_id,
                (countMap.get(row.section_id) || 0) + 1,
              );

              const g = genderMap.get(row.section_id) ?? {
                male: 0,
                female: 0,
              };
              const studentData = Array.isArray(row.student)
                ? row.student[0]
                : row.student;
              if (studentData?.gender === "male") g.male++;
              else if (studentData?.gender === "female") g.female++;
              genderMap.set(row.section_id, g);
            }
          }

          // Fetch per-section GPA distributions from grades
          const gpaDistMap = new Map<string, GpaDistribution>();
          const { data: gradeRows } = await supabase
            .from("sms_grades")
            .select("student_id, section_id, grade")
            .in("section_id", secIds)
            .eq("school_year", targetSchoolYear);

          if (gradeRows) {
            // Compute average grade per student-section, then bucket
            const studentSectionGrades = new Map<string, number[]>();
            for (const g of gradeRows) {
              const key = `${g.student_id}__${g.section_id}`;
              if (!studentSectionGrades.has(key))
                studentSectionGrades.set(key, []);
              studentSectionGrades.get(key)!.push(g.grade);
            }

            for (const [key, grades] of studentSectionGrades) {
              const sectionId = key.split("__")[1];
              const avg = grades.reduce((a, b) => a + b, 0) / grades.length;
              const bucket = classifyGpaBucket(avg, thresholds);
              const dist = gpaDistMap.get(sectionId) ?? {
                high: 0,
                mid: 0,
                low: 0,
                unknown: 0,
              };
              dist[bucket]++;
              gpaDistMap.set(sectionId, dist);
            }
          }

          const sectionOptions: SectionCandidate[] = sectionsData.map((s) => ({
            id: s.id,
            name: s.name,
            sectionType: s.section_type as SectionType | null,
            maxStudents: s.max_students,
            enrolledCount: countMap.get(s.id) || 0,
            maleCount: genderMap.get(s.id)?.male ?? 0,
            femaleCount: genderMap.get(s.id)?.female ?? 0,
            gpaDistribution: gpaDistMap.get(s.id) ?? {
              high: 0,
              mid: 0,
              low: 0,
              unknown: 0,
            },
          }));

          setSections(sectionOptions);
        } else {
          setSections([]);
        }
      }
    } catch (error) {
      console.error(`Error fetching ${mode} students:`, error);
      toast.error(`Failed to load ${mode} students`);
    } finally {
      setLoading(false);
    }
  }, [filterGradeLevel, targetSchoolYear, targetGradeLevel, user, mode, computeTargetGrade, thresholds]);

  useEffect(() => {
    if (isOpen && filterGradeLevel) {
      fetchStudents();
    }
  }, [isOpen, fetchStudents, filterGradeLevel]);

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

  // Auto-assign sections for all students when data loads
  useEffect(() => {
    if (students.length === 0 || sections.length === 0) return;

    const allStudents = students.map((s) => ({
      studentId: s.studentId,
      gpa: s.gpa,
      gender: s.gender,
    }));

    const newAssignments = batchAutoAssignSections(
      allStudents,
      sections,
      thresholds,
    );

    setAssignments(newAssignments);
  }, [students, sections, thresholds]);

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

  // Mark selected students as enrolled
  const handleEnroll = async () => {
    if (!user?.system_user_id) return;

    // Validate all selected students have assignments
    const selectedStudents = students.filter((s) =>
      selectedIds.has(s.studentId),
    );
    const unassigned = selectedStudents.filter(
      (s) => !assignments.has(s.studentId),
    );

    if (unassigned.length > 0) {
      toast.error(
        `${unassigned.length} selected student(s) could not be auto-assigned a section. Sections may be full.`,
      );
      return;
    }

    if (selectedStudents.length === 0) {
      toast.error("Please select at least one student");
      return;
    }

    setSubmitting(true);
    onSubmittingChange(true);
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

      // Always pass source enrollment ids — the RPC will mark both
      // 'promoted' and 'retained' prior rows as 'completed' so re-enrolling
      // a retained student doesn't leave a duplicate retained row behind.
      const sourceEnrollmentIds = selectedStudents.map((s) => s.enrollmentId);

      // Insert + complete-old in a single transaction (atomic).
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        const sourceBatch = sourceEnrollmentIds.slice(i, i + BATCH_SIZE);
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          "enroll_students_atomic",
          {
            p_records: batch,
            p_source_ids: sourceBatch,
            p_school_id: user.school_id ?? null,
          },
        );
        if (rpcError) throw new Error(rpcError.message);
        successCount += (rpcData as { inserted?: number })?.inserted ?? 0;
        skipCount += (rpcData as { skipped?: number })?.skipped ?? 0;
      }

      // Update student records: set current_section_id. The enrollment_status
      // is synced automatically by the trg_sync_student_enrollment_status
      // trigger (migration 056).
      for (const s of selectedStudents) {
        const sectionId = assignments.get(s.studentId);
        if (!sectionId) continue;

        let studentUpdate = supabase
          .from("sms_students")
          .update({ current_section_id: sectionId })
          .eq("id", s.studentId);
        if (user.school_id != null) {
          studentUpdate = studentUpdate.eq("school_id", user.school_id);
        }
        await studentUpdate;
      }

      if (skipCount > 0) {
        toast.success(
          `Enrolled ${successCount} students. ${skipCount} were already enrolled and skipped.`,
        );
      } else {
        toast.success(`Successfully enrolled ${successCount} students!`);
      }

      onEnrolled();
      onClose();
    } catch (error) {
      console.error("Enrollment error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to enroll students",
      );
    } finally {
      setSubmitting(false);
      onSubmittingChange(false);
    }
  };

  const getSectionName = (sectionId: string) => {
    return sections.find((s) => s.id === sectionId)?.name ?? "—";
  };

  const assignedCount = [...selectedIds].filter((id) =>
    assignments.has(id),
  ).length;

  const hasUnassignedSelected =
    selectedIds.size > 0 &&
    [...selectedIds].some((id) => !assignments.has(id));

  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 px-6 pt-4 pb-2">
        <div className="w-[200px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            {config.gradeLabel}
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
              Enrolling into:{" "}
              <strong>{getGradeLevelLabel(targetGradeLevel)}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {!filterGradeLevel ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Users className="h-12 w-12 mb-3" />
            <p className="text-sm">
              Select a grade level to view {config.emptyPrompt} students
            </p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">
              Loading {config.emptyPrompt} students...
            </span>
          </div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Users className="h-12 w-12 mb-3" />
            <p className="text-sm font-medium">
              No {config.emptyPrompt} students found
            </p>
            <p className="text-xs mt-1">
              No students with &quot;{config.statusLabel}&quot; status in{" "}
              {getGradeLevelLabel(parseInt(filterGradeLevel))} are available for
              enrollment in SY {targetSchoolYear}.
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
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <HelpCircle className="h-3 w-3" />
                    How does auto-assign work?
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[420px] p-0 text-sm"
                  align="end"
                  side="bottom"
                  collisionPadding={12}
                >
                  <div className="rounded-md overflow-hidden">
                    <div className="bg-primary/10 px-3 py-2.5 border-b">
                      <p className="font-semibold text-xs text-foreground">
                        Auto Section Assignment Algorithm
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Sections are ranked by a weighted composite score
                        across 4 factors.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-px bg-border">
                      <div className="bg-background px-3 py-2.5 flex items-start gap-2">
                        <span className="mt-0.5 shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary leading-none">
                          40%
                        </span>
                        <div>
                          <p className="font-medium text-[11px]">
                            Section Type Match
                          </p>
                          <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                            Section type (Fast Learner, Crack, etc.) aligns
                            with the student&apos;s GPA. Full score if
                            matched, zero if not.
                          </p>
                        </div>
                      </div>
                      <div className="bg-background px-3 py-2.5 flex items-start gap-2">
                        <span className="mt-0.5 shrink-0 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 leading-none">
                          25%
                        </span>
                        <div>
                          <p className="font-medium text-[11px]">
                            Gender Balance
                          </p>
                          <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                            Favors sections where adding this student keeps
                            the M/F ratio closest to 50/50.
                          </p>
                        </div>
                      </div>
                      <div className="bg-background px-3 py-2.5 flex items-start gap-2">
                        <span className="mt-0.5 shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 leading-none">
                          20%
                        </span>
                        <div>
                          <p className="font-medium text-[11px]">
                            GPA Distribution
                          </p>
                          <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                            Heterogeneous: even mix of GPA bands. Homogeneous:
                            clusters similar GPAs together.
                          </p>
                        </div>
                      </div>
                      <div className="bg-background px-3 py-2.5 flex items-start gap-2">
                        <span className="mt-0.5 shrink-0 rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] font-bold text-green-600 dark:text-green-400 leading-none">
                          15%
                        </span>
                        <div>
                          <p className="font-medium text-[11px]">Capacity</p>
                          <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                            More open slots = higher score. Full sections are
                            excluded entirely.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="border-t bg-muted/40 px-3 py-2">
                      <p className="text-[10px] text-muted-foreground leading-snug">
                        Assigned in batch — each placement updates projected
                        counts so subsequent students account for newly
                        assigned peers.
                      </p>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
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
                    <th className="px-3 py-2.5 text-left font-medium">LRN</th>
                    <th className="px-3 py-2.5 text-center font-medium w-20">
                      GPA
                    </th>
                    <th className="px-3 py-2.5 text-left font-medium">
                      Enrolling to
                    </th>
                    <th className="px-3 py-2.5 text-left font-medium">
                      Suggested Section
                    </th>
                    <th className="px-3 py-2.5 text-left font-medium">
                      Auto Assigned Section
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {students.map((s) => {
                    const suggested = getSuggestedSectionType(
                      s.gpa,
                      thresholds,
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
                            onChange={() => handleToggleStudent(s.studentId)}
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
                          {formatLrn(s.student.lrn)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {s.gpa != null ? (
                            <span className="font-semibold">
                              {Math.round(s.gpa)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">N/A</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-sm">
                          {getGradeLevelLabel(s.currentGradeLevel)}
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
        {hasUnassignedSelected && (
          <p className="text-sm text-destructive mr-auto self-center">
            Some selected students have no assigned section. Please assign
            sections to all selected students before enrolling.
          </p>
        )}
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
            sections.length === 0 ||
            hasUnassignedSelected
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
              Enroll to Assigned Section ({selectedIds.size})
            </span>
          )}
        </Button>
      </DialogFooter>
    </>
  );
}
