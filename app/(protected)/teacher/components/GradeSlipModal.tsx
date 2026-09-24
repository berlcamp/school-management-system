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
import { Label } from "@/components/ui/label";
import { printGradeSlips } from "@/lib/pdf/generateGradeSlips";
import { sortLearnersBySex } from "@/lib/utils/learnerSex";
import { getGradingPeriodsForSection } from "@/lib/utils/schoolYear";
import {
  fetchSectionGrades,
  learnerCardRows,
  sectionGradeColumns,
  type SectionGradeSubject,
} from "@/lib/utils/sectionGrades";
import { Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

export interface GradeSlipStudent {
  id: string;
  name: string;
  lrn: string | null;
  gender: string | null;
  enrollmentStatus: string;
}

interface GradeSlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  sectionId: string;
  sectionLabel: string;
  schoolYear: string;
  schoolName: string;
  adviserName: string | null;
  gradeLevel: number | null;
  /** Migration 189 — an old-curriculum SHS section has four semestral quarters. */
  shsCurriculum?: string | null;
  students: GradeSlipStudent[];
  /** The graded subjects the section sits (the Grades Matrix's columns). */
  subjects: SectionGradeSubject[];
}

export function GradeSlipModal({
  isOpen,
  onClose,
  sectionId,
  sectionLabel,
  schoolYear,
  schoolName,
  adviserName,
  gradeLevel,
  shsCurriculum,
  students,
  subjects,
}: GradeSlipModalProps) {
  // 3 terms from SY 2026-2027 (MATATAG), 4 quarters before it.
  const gradingPeriods = useMemo(
    () => getGradingPeriodsForSection(schoolYear, shsCurriculum),
    [schoolYear, shsCurriculum],
  );
  const periodNoun = gradingPeriods.length === 3 ? "term" : "quarter";

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [includeFinal, setIncludeFinal] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelected(new Set(gradingPeriods.map((p) => p.value)));
    setIncludeFinal(false);
  }, [isOpen, gradingPeriods]);

  // A learner released to another school gets no slip — the section's
  // Print and Export leave them off the same way. Boys first, then girls.
  const printable = useMemo(
    () =>
      sortLearnersBySex(
        students.filter((s) => s.enrollmentStatus !== "transferred_out"),
        (s) => s.gender,
      ),
    [students],
  );

  const togglePeriod = (value: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(value);
      else next.delete(value);
      return next;
    });
  };

  const canGenerate =
    (selected.size > 0 || includeFinal) && printable.length > 0 && !generating;

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const periodValues = gradingPeriods.map((p) => p.value);
      const grades = await fetchSectionGrades(
        sectionId,
        schoolYear,
        subjects,
        periodValues,
      );
      const columns = sectionGradeColumns(subjects, grades.extraSubjects);

      printGradeSlips({
        schoolName,
        schoolYear,
        sectionLabel,
        adviserName,
        periods: gradingPeriods
          .filter((p) => selected.has(p.value))
          .map((p) => ({ value: p.value, short: p.short })),
        includeFinal,
        learners: printable.map((s) => ({
          name: s.name,
          lrn: s.lrn,
          rows: learnerCardRows(
            grades,
            columns,
            s.id,
            gradeLevel,
            gradingPeriods.length,
          ),
        })),
      });
      onClose();
    } catch (error) {
      console.error("GradeSlipModal:", error);
      toast.error("Could not generate the grade slips");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Grade Slip — {sectionLabel}</DialogTitle>
          <DialogDescription>
            One slip per learner, four to a page, boys first then girls. Choose
            which {periodNoun}s to show.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {gradingPeriods.map((p) => (
            <div key={p.value} className="flex items-center gap-2">
              <Checkbox
                id={`slip-period-${p.value}`}
                checked={selected.has(p.value)}
                onChange={(e) => togglePeriod(p.value, e.target.checked)}
              />
              <Label htmlFor={`slip-period-${p.value}`}>{p.label}</Label>
            </div>
          ))}
          <div className="flex items-start gap-2 border-t pt-3">
            <Checkbox
              className="mt-0.5"
              id="slip-final"
              checked={includeFinal}
              onChange={(e) => setIncludeFinal(e.target.checked)}
            />
            <div className="grid gap-0.5">
              <Label htmlFor="slip-final">Final grade and remarks</Label>
              <p className="text-xs text-muted-foreground">
                Prints blank until all {gradingPeriods.length} {periodNoun}s
                are encoded, as on SF9.
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {printable.length} learner{printable.length === 1 ? "" : "s"} ·{" "}
            {Math.ceil(printable.length / 4)} page
            {Math.ceil(printable.length / 4) === 1 ? "" : "s"}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={generating}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={!canGenerate}>
            <Printer className="h-4 w-4 mr-2" />
            {generating ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
