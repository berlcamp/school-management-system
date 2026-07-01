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
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabase/client";
import { getGradingPeriods } from "@/lib/utils/schoolYear";
import { Subject } from "@/types";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

type PeriodMap = Record<number, number | null>;

interface ViewStudentGradesModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  sectionId: string;
  schoolYear: string;
  subjects: Subject[];
}

interface SubjectMeta {
  id: string;
  code: string;
  name: string;
}

interface GradeFetchRow {
  grading_period: number;
  grade: number;
  subject_id: string;
  subject: SubjectMeta | SubjectMeta[] | null;
}

function emptyPeriods(periodValues: number[]): PeriodMap {
  const map: PeriodMap = {};
  periodValues.forEach((v) => (map[v] = null));
  return map;
}

function normalizeSubject(
  raw: SubjectMeta | SubjectMeta[] | null,
): SubjectMeta | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

/** Final grade = average of all periods (3 terms or 4 quarters) when complete. */
function computeFinalGrade(periods: PeriodMap, periodValues: number[]): number | null {
  const values = periodValues.map((v) => periods[v]);
  if (values.every((v) => v !== null && v !== undefined)) {
    const sum = values.reduce((acc, v) => acc + (v as number), 0);
    return Math.round(sum / periodValues.length);
  }
  return null;
}

function hasAnyPeriod(periods: PeriodMap, periodValues: number[]): boolean {
  return periodValues.some((v) => periods[v] !== null && periods[v] !== undefined);
}

function formatScore(value: number | null): string {
  if (value === null) return "—";
  return String(Math.round(value));
}

export function ViewStudentGradesModal({
  isOpen,
  onClose,
  studentId,
  studentName,
  sectionId,
  schoolYear,
  subjects,
}: ViewStudentGradesModalProps) {
  const [loading, setLoading] = useState(false);
  const [periodBySubjectId, setPeriodBySubjectId] = useState<
    Map<string, PeriodMap>
  >(new Map());
  const [extraSubjects, setExtraSubjects] = useState<SubjectMeta[]>([]);

  // 3 terms for MATATAG (2026-2027+), otherwise 4 quarters.
  const gradingPeriods = useMemo(
    () => getGradingPeriods(schoolYear),
    [schoolYear],
  );
  const periodValues = useMemo(
    () => gradingPeriods.map((p) => p.value),
    [gradingPeriods],
  );

  const subjectIdsKey = useMemo(
    () => subjects.map((s) => String(s.id)).sort().join(","),
    [subjects],
  );

  useEffect(() => {
    if (!isOpen || !studentId || !sectionId || !schoolYear) return;

    let isMounted = true;
    setLoading(true);
    setPeriodBySubjectId(new Map());
    setExtraSubjects([]);

    void (async () => {
      const { data, error } = await supabase
        .from("sms_grades")
        .select(
          "grading_period, grade, subject_id, subject:sms_subjects!sms_grades_subject_id_fkey(id, code, name)",
        )
        .eq("student_id", studentId)
        .eq("section_id", sectionId)
        .eq("school_year", schoolYear);

      if (!isMounted) return;

      if (error) {
        console.error("ViewStudentGradesModal:", error);
        toast.error("Could not load grades");
        setLoading(false);
        return;
      }

      const map = new Map<string, PeriodMap>();
      const subjectIdsFromProps = new Set(
        subjectIdsKey.split(",").filter(Boolean),
      );
      const extras: SubjectMeta[] = [];

      for (const raw of (data ?? []) as GradeFetchRow[]) {
        const sid = String(raw.subject_id);
        if (!map.has(sid)) {
          map.set(sid, emptyPeriods(periodValues));
        }
        const periods = map.get(sid)!;
        const p = raw.grading_period;
        if (periodValues.includes(p)) {
          periods[p] = Number(raw.grade);
        }

        const sub = normalizeSubject(raw.subject);
        if (sub && !subjectIdsFromProps.has(sid)) {
          if (!extras.some((e) => e.id === sid)) {
            extras.push({
              id: sid,
              code: sub.code,
              name: sub.name,
            });
          }
        }
      }

      extras.sort((a, b) => a.code.localeCompare(b.code));
      setPeriodBySubjectId(map);
      setExtraSubjects(extras);
      setLoading(false);
    })();

    return () => {
      isMounted = false;
    };
  }, [isOpen, studentId, sectionId, schoolYear, subjectIdsKey, periodValues]);

  const rows = useMemo(() => {
    const fromCatalog = subjects.map((s) => ({
      id: String(s.id),
      code: s.code,
      name: s.name,
    }));
    const seen = new Set(fromCatalog.map((r) => r.id));
    const merged = [
      ...fromCatalog,
      ...extraSubjects.filter((e) => !seen.has(e.id)),
    ];
    return merged.sort((a, b) => a.code.localeCompare(b.code));
  }, [subjects, extraSubjects]);

  const gpa = useMemo(() => {
    const finalsList: number[] = [];
    for (const row of rows) {
      const periods = periodBySubjectId.get(row.id) ?? emptyPeriods(periodValues);
      const final = computeFinalGrade(periods, periodValues);
      if (final !== null) finalsList.push(final);
    }
    if (finalsList.length === 0) return null;
    return Math.round(finalsList.reduce((a, b) => a + b, 0) / finalsList.length);
  }, [rows, periodBySubjectId, periodValues]);

  const hasAnyGrade = useMemo(() => {
    for (const m of periodBySubjectId.values()) {
      if (hasAnyPeriod(m, periodValues)) return true;
    }
    return false;
  }, [periodBySubjectId, periodValues]);

  const visibleRows = useMemo(() => {
    return rows.filter((subj) => {
      const periods = periodBySubjectId.get(subj.id) ?? emptyPeriods(periodValues);
      return hasAnyPeriod(periods, periodValues);
    });
  }, [rows, periodBySubjectId, periodValues]);

  const periodNoun = gradingPeriods.length === 3 ? "term" : "quarter";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Grades — {studentName}</DialogTitle>
          <DialogDescription>
            School year {schoolYear}. Per-{periodNoun} scores, final grade per
            subject (average of {gradingPeriods.length} {periodNoun}s when all
            are recorded), and overall GPA (general average of final grades).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Loading grades…
          </div>
        ) : !hasAnyGrade ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No grades recorded for this learner in this section for this school
            year.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[140px]">Subject</TableHead>
                {gradingPeriods.map((p) => (
                  <TableHead key={p.value} className="text-center w-[72px]">
                    {p.short}
                  </TableHead>
                ))}
                <TableHead className="text-center w-[88px]">Final</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((subj) => {
                const periods =
                  periodBySubjectId.get(subj.id) ?? emptyPeriods(periodValues);
                const final = computeFinalGrade(periods, periodValues);
                return (
                  <TableRow key={subj.id}>
                    <TableCell className="font-medium">
                      <span className="text-muted-foreground">{subj.code}</span>{" "}
                      {subj.name}
                    </TableCell>
                    {periodValues.map((v) => (
                      <TableCell
                        key={v}
                        className="text-center tabular-nums"
                      >
                        {formatScore(periods[v] ?? null)}
                      </TableCell>
                    ))}
                    <TableCell className="text-center tabular-nums font-medium">
                      {formatScore(final)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell
                  colSpan={periodValues.length + 1}
                  className="text-right font-semibold"
                >
                  GPA (general average)
                </TableCell>
                <TableCell className="text-center tabular-nums font-semibold">
                  {gpa !== null ? formatScore(gpa) : "—"}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
