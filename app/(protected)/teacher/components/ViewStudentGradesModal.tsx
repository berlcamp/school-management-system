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
import { Subject } from "@/types";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

type QuarterKey = 1 | 2 | 3 | 4;

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

function emptyPeriods(): Record<QuarterKey, number | null> {
  return { 1: null, 2: null, 3: null, 4: null };
}

function normalizeSubject(
  raw: SubjectMeta | SubjectMeta[] | null,
): SubjectMeta | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

function computeFinalGrade(periods: Record<QuarterKey, number | null>): number | null {
  const q = [periods[1], periods[2], periods[3], periods[4]];
  if (q.every((v) => v !== null)) {
    const sum = q.reduce((acc, v) => acc + (v as number), 0);
    return Math.round((sum / 4) * 100) / 100;
  }
  return null;
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
    Map<string, Record<QuarterKey, number | null>>
  >(new Map());
  const [extraSubjects, setExtraSubjects] = useState<SubjectMeta[]>([]);

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

      const map = new Map<string, Record<QuarterKey, number | null>>();
      const subjectIdsFromProps = new Set(
        subjectIdsKey.split(",").filter(Boolean),
      );
      const extras: SubjectMeta[] = [];

      for (const raw of (data ?? []) as GradeFetchRow[]) {
        const sid = String(raw.subject_id);
        if (!map.has(sid)) {
          map.set(sid, emptyPeriods());
        }
        const periods = map.get(sid)!;
        const p = raw.grading_period as QuarterKey;
        if (p >= 1 && p <= 4) {
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
  }, [isOpen, studentId, sectionId, schoolYear, subjectIdsKey]);

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
      const periods = periodBySubjectId.get(row.id) ?? emptyPeriods();
      const final = computeFinalGrade(periods);
      if (final !== null) finalsList.push(final);
    }
    if (finalsList.length === 0) return null;
    return (
      Math.round(
        (finalsList.reduce((a, b) => a + b, 0) / finalsList.length) * 100,
      ) / 100
    );
  }, [rows, periodBySubjectId]);

  const hasAnyGrade = useMemo(() => {
    for (const m of periodBySubjectId.values()) {
      if (m[1] !== null || m[2] !== null || m[3] !== null || m[4] !== null) {
        return true;
      }
    }
    return false;
  }, [periodBySubjectId]);

  const visibleRows = useMemo(() => {
    return rows.filter((subj) => {
      const periods = periodBySubjectId.get(subj.id) ?? emptyPeriods();
      return (
        periods[1] !== null ||
        periods[2] !== null ||
        periods[3] !== null ||
        periods[4] !== null
      );
    });
  }, [rows, periodBySubjectId]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Grades — {studentName}</DialogTitle>
          <DialogDescription>
            School year {schoolYear}. Per-quarter scores, final grade per subject
            (average of four quarters when all are recorded), and overall GPA
            (general average of final grades).
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
                <TableHead className="text-center w-[72px]">Q1</TableHead>
                <TableHead className="text-center w-[72px]">Q2</TableHead>
                <TableHead className="text-center w-[72px]">Q3</TableHead>
                <TableHead className="text-center w-[72px]">Q4</TableHead>
                <TableHead className="text-center w-[88px]">Final</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((subj) => {
                const periods =
                  periodBySubjectId.get(subj.id) ?? emptyPeriods();
                const final = computeFinalGrade(periods);
                return (
                  <TableRow key={subj.id}>
                    <TableCell className="font-medium">
                      <span className="text-muted-foreground">{subj.code}</span>{" "}
                      {subj.name}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {formatScore(periods[1])}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {formatScore(periods[2])}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {formatScore(periods[3])}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {formatScore(periods[4])}
                    </TableCell>
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
                  colSpan={5}
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
