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
import { Textarea } from "@/components/ui/textarea";
import { GRADE_LEVELS, getGradeLevelLabel } from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import {
  gradedSubjectsByPeriod,
  sectionChangeReason,
  subjectsOnlyIn,
} from "@/lib/utils/sectionChange";
import { getGradingPeriodLabel } from "@/lib/utils/schoolYear";
import { AlertTriangle, ArrowRightLeft, Loader2, Wrench } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

const SENIOR_HIGH_GRADE_MIN = 11;
const SENIOR_HIGH_GRADE_MAX = 12;

export interface CorrectedSection {
  id: string;
  name: string;
  section_type?: string | null;
}

interface SectionRow {
  id: string;
  name: string;
  grade_level: number;
  school_year: string;
  section_type: string | null;
}

/** Shape returned by the `correct_enrollment` RPC. */
interface CorrectionResult {
  to_grade_level: number;
  to_section_id: string;
  to_section_name: string;
  semester: number | null;
  student_record_synced: boolean;
  stranded_grades: number;
  stranded_attendance: number;
}

interface CorrectEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  enrollmentId: string | null;
  /** The enrollment's own school, which is what scopes the section picker. */
  schoolId: string | number | null;
  schoolYear: string | null;
  currentGradeLevel: number | null;
  currentSemester: number | null;
  currentSectionId: string | null;
  studentName: string;
  /**
   * `change_section` is the mid-year move (Enrollment → Change section): same
   * grade level, another section, a required reason. The earlier section's
   * grades and attendance stay there and still print on the card
   * (lib/utils/learnerYearRecords.ts). `correct` is the repair for a
   * mis-clicked Promote. Both call 183's `correct_enrollment`.
   */
  mode?: "correct" | "change_section";
  /** Needed in `change_section` mode to show what is already encoded. */
  studentId?: string | null;
  onCorrected: (result: {
    grade_level: number;
    semester: number | null;
    section_id: string;
    section: CorrectedSection;
  }) => void;
}

/**
 * Move one enrollment to the grade level and section it should have had.
 *
 * This is the repair for a mis-clicked Promote, and it is deliberately not the
 * enrollment wizard's Edit mode: that screen also exposes School Year and
 * Semester, both of which sit in `uq_enrollments_student_school_year_semester`,
 * so rolling the year back to reach "retained" collides with the learner's own
 * previous row and surfaces a raw duplicate-key error. Here the school year is
 * shown but never sent — `correct_enrollment` reads it off the row.
 */
export function CorrectEnrollmentModal({
  isOpen,
  onClose,
  enrollmentId,
  schoolId,
  schoolYear,
  currentGradeLevel,
  currentSemester,
  currentSectionId,
  studentName,
  mode = "correct",
  studentId = null,
  onCorrected,
}: CorrectEnrollmentModalProps) {
  const isChange = mode === "change_section";
  const [gradeLevel, setGradeLevel] = useState<string>("");
  const [sectionId, setSectionId] = useState<string>("");
  const [semester, setSemester] = useState<string>("");
  const [reason, setReason] = useState("");
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [encoded, setEncoded] = useState<Record<string, number> | null>(null);
  const [gradedByPeriod, setGradedByPeriod] = useState<
    Array<{ period: number; subjects: number }>
  >([]);
  const [oldOnlySubjects, setOldOnlySubjects] = useState<string[]>([]);

  const isSeniorHigh = useMemo(() => {
    const level = parseInt(gradeLevel);
    return level >= SENIOR_HIGH_GRADE_MIN && level <= SENIOR_HIGH_GRADE_MAX;
  }, [gradeLevel]);

  useEffect(() => {
    if (!isOpen) return;
    setGradeLevel(currentGradeLevel != null ? String(currentGradeLevel) : "");
    // A change of section starts with nothing picked: the current section is
    // not on offer.
    setSectionId(isChange ? "" : currentSectionId ?? "");
    setSemester(currentSemester != null ? String(currentSemester) : "");
    setReason("");
    setEncoded(null);
    setGradedByPeriod([]);
    setOldOnlySubjects([]);
  }, [isOpen, isChange, currentGradeLevel, currentSectionId, currentSemester]);

  /* Change section: which periods already carry grades in the section being
     left, so the registrar can see whether its teachers have finished posting. */
  useEffect(() => {
    if (!isOpen || !isChange || !studentId || !currentSectionId || !schoolYear) return;
    let isMounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("sms_grades")
        .select("subject_id, grading_period, grade")
        .eq("student_id", Number(studentId))
        .eq("section_id", Number(currentSectionId))
        .eq("school_year", schoolYear);
      if (!isMounted || error) return;
      setGradedByPeriod(gradedSubjectsByPeriod(data ?? []));
    })();
    return () => {
      isMounted = false;
    };
  }, [isOpen, isChange, studentId, currentSectionId, schoolYear]);

  /* Change section: subjects the old section has and the new one does not.
     Their earlier grades print on a line of their own (a school keeping a
     separate subject row per section). */
  useEffect(() => {
    if (!isOpen || !isChange || !currentSectionId || !sectionId || !schoolYear) {
      setOldOnlySubjects([]);
      return;
    }
    let isMounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("sms_subject_schedules")
        .select("section_id, subject_id, subject:sms_subjects(name)")
        .eq("school_year", schoolYear)
        .in("section_id", [Number(currentSectionId), Number(sectionId)]);
      if (!isMounted || error) return;
      const rows = data ?? [];
      const idsIn = (sec: string) =>
        rows.filter((r) => String(r.section_id) === sec).map((r) => String(r.subject_id));
      const onlyOld = subjectsOnlyIn(idsIn(String(currentSectionId)), idsIn(String(sectionId)));
      const nameOf = (id: string) => {
        const rel = rows.find((r) => String(r.subject_id) === id)?.subject;
        const one = Array.isArray(rel) ? rel[0] : rel;
        return (one as { name?: string } | null)?.name ?? `Subject ${id}`;
      };
      setOldOnlySubjects(onlyOld.map(nameOf));
    })();
    return () => {
      isMounted = false;
    };
  }, [isOpen, isChange, currentSectionId, sectionId, schoolYear]);

  /* What is already encoded against the row, so the dialog can warn before the
     section changes rather than after. Same RPC the delete dialog reads. */
  useEffect(() => {
    if (!isOpen || !enrollmentId) return;
    let isMounted = true;
    (async () => {
      const { data, error } = await supabase.rpc("enrollment_dependents", {
        p_enrollment_id: Number(enrollmentId),
      });
      if (!isMounted || error || !data) return;
      const facts = data as { counts?: Record<string, number> };
      setEncoded(facts.counts ?? null);
    })();
    return () => {
      isMounted = false;
    };
  }, [isOpen, enrollmentId]);

  const fetchSections = useCallback(
    async (level: number) => {
      if (!schoolYear) return;
      setLoadingSections(true);
      try {
        // Sections belong to one school year, and `correct_enrollment` refuses a
        // section from another one — so the picker only ever offers this row's.
        let query = supabase
          .from("sms_sections")
          .select("id, name, grade_level, school_year, section_type")
          .eq("is_active", true)
          .eq("grade_level", level)
          .eq("school_year", schoolYear)
          .order("name");
        if (schoolId != null) query = query.eq("school_id", Number(schoolId));

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        setSections((data as SectionRow[]) ?? []);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to load sections",
        );
        setSections([]);
      } finally {
        setLoadingSections(false);
      }
    },
    [schoolId, schoolYear],
  );

  useEffect(() => {
    if (!isOpen || !gradeLevel) return;
    fetchSections(parseInt(gradeLevel));
  }, [isOpen, gradeLevel, fetchSections]);

  const handleGradeLevelChange = (value: string) => {
    setGradeLevel(value);
    setSectionId("");
    const level = parseInt(value);
    if (level >= SENIOR_HIGH_GRADE_MIN && level <= SENIOR_HIGH_GRADE_MAX) {
      setSemester((prev) => prev || "1");
    } else {
      setSemester("");
    }
  };

  const unchanged =
    gradeLevel === String(currentGradeLevel ?? "") &&
    sectionId === (currentSectionId ?? "") &&
    (!isSeniorHigh || semester === String(currentSemester ?? ""));

  const oldSectionName =
    sections.find((s) => String(s.id) === String(currentSectionId))?.name ??
    "the previous section";
  const offeredSections = isChange
    ? sections.filter((s) => String(s.id) !== String(currentSectionId))
    : sections;
  const changeReason = sectionChangeReason(oldSectionName, reason);

  const handleSubmit = async () => {
    if (!enrollmentId || !gradeLevel || !sectionId) return;
    if (isChange && !changeReason) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("correct_enrollment", {
        p_enrollment_id: Number(enrollmentId),
        p_grade_level: parseInt(gradeLevel),
        p_section_id: Number(sectionId),
        p_semester: isSeniorHigh ? parseInt(semester) : null,
        p_reason: isChange ? changeReason : reason.trim() || null,
      });
      if (error) throw new Error(error.message);

      const result = data as CorrectionResult;
      const section = sections.find((s) => String(s.id) === sectionId);

      if (isChange) {
        toast.success(
          `Moved to ${result.to_section_name}. Earlier grades and attendance stay with ${oldSectionName} and print on the card.`,
          { duration: 7000 },
        );
      } else {
        toast.success(
          `Moved to ${getGradeLevelLabel(result.to_grade_level)} — ${result.to_section_name}.`,
        );
      }
      if (!isChange && (result.stranded_grades > 0 || result.stranded_attendance > 0)) {
        // Loud on purpose: those rows are keyed to the section the learner has
        // just left, and nothing moves them.
        toast(
          `${result.stranded_grades} grade row(s) and ${result.stranded_attendance} attendance day(s) stay with the previous section. Re-encode them if they belong to this learner.`,
          { duration: 9000, icon: "⚠️" },
        );
      }

      onCorrected({
        grade_level: result.to_grade_level,
        semester: result.semester,
        section_id: String(result.to_section_id),
        section: {
          id: String(result.to_section_id),
          name: result.to_section_name,
          section_type: section?.section_type ?? null,
        },
      });
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to correct enrollment",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const encodedTotal = encoded
    ? Object.values(encoded).reduce((sum, n) => sum + Number(n ?? 0), 0)
    : 0;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !submitting && !open && onClose()}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isChange ? (
              <ArrowRightLeft className="h-5 w-5 text-primary" />
            ) : (
              <Wrench className="h-5 w-5 text-primary" />
            )}
            {isChange ? "Change Section" : "Correct Enrollment"}
          </DialogTitle>
          <DialogDescription>
            {studentName}
            {schoolYear && (
              <>
                {" "}&mdash; SY {schoolYear}
                {currentGradeLevel != null && (
                  <>, currently {getGradeLevelLabel(currentGradeLevel)}</>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Grade Level</label>
            <Select
              value={gradeLevel}
              onValueChange={handleGradeLevelChange}
              // A change of section keeps the grade level; a different grade
              // is a correction, not a move.
              disabled={submitting || isChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select grade level" />
              </SelectTrigger>
              <SelectContent>
                {GRADE_LEVELS.map((level) => (
                  <SelectItem key={level} value={String(level)}>
                    {getGradeLevelLabel(level)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isSeniorHigh && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Semester</label>
              <Select
                value={semester}
                onValueChange={setSemester}
                disabled={submitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select semester" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Semester 1</SelectItem>
                  <SelectItem value="2">Semester 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Section</label>
            <Select
              value={sectionId}
              onValueChange={setSectionId}
              disabled={submitting || loadingSections || !gradeLevel}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loadingSections ? "Loading sections..." : "Select section"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {offeredSections.map((section) => (
                  <SelectItem key={section.id} value={String(section.id)}>
                    {section.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loadingSections && gradeLevel && offeredSections.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No active {getGradeLevelLabel(parseInt(gradeLevel))} section for
                SY {schoolYear}. Create one first — an enrollment cannot point at
                a section from another school year.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Reason{" "}
              <span className="text-muted-foreground font-normal">
                {isChange
                  ? "(required, appended to remarks)"
                  : "(optional, appended to remarks)"}
              </span>
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                isChange
                  ? "e.g. Parent request — moved to the afternoon shift"
                  : "e.g. Retained — Promote was clicked by mistake"
              }
              rows={2}
              disabled={submitting}
            />
          </div>

          {isChange && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/50 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Grades and attendance already encoded stay with{" "}
                  {oldSectionName} and still print on the learner&apos;s card.
                  Ask its teachers to finish posting every quarter the learner
                  completed there before you move them — once moved, the learner
                  no longer appears on that section&apos;s class lists.
                </span>
              </div>
              {gradedByPeriod.length > 0 ? (
                <ul className="pl-6 list-disc">
                  {gradedByPeriod.map((p) => (
                    <li key={p.period}>
                      {getGradingPeriodLabel(schoolYear ?? "", p.period)}:{" "}
                      {p.subjects} subject{p.subjects === 1 ? "" : "s"} graded in{" "}
                      {oldSectionName}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pl-6">No grades are encoded in {oldSectionName} yet.</p>
              )}
              {oldOnlySubjects.length > 0 && (
                <p className="pl-6">
                  Not scheduled in the new section: {oldOnlySubjects.join(", ")}.
                  Their earlier grades print on their own line.
                </p>
              )}
            </div>
          )}

          {!isChange && encodedTotal > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/50 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                {encodedTotal} record(s) are already encoded against the current
                section. Changing the section leaves them where they are — they
                are keyed by section, not by this enrollment.
              </span>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            The school year stays SY {schoolYear} and the status is not touched.
            A learner repeating a grade is recorded by the grade level, never by
            moving the enrollment back a year.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              submitting ||
              !gradeLevel ||
              !sectionId ||
              unchanged ||
              (isChange && !changeReason)
            }
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              isChange ? "Move Learner" : "Save Correction"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
