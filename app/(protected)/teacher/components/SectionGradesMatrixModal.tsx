"use client";

import { LearnerSexGroupRow } from "@/components/LearnerSexGroupHeader";
import { Badge } from "@/components/ui/badge";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  computeGeneralAverage,
  PASSING_GRADE,
  periodGeneralAverage,
  type CardSubjectRow,
} from "@/lib/utils/mapeh";
import {
  fetchSectionGrades,
  learnerCardRows,
  learnerTakesSubject,
  sectionGradeColumns,
  sectionGradeKey,
  type PeriodMap,
  type SectionGradeSubject,
  type SectionGrades,
} from "@/lib/utils/sectionGrades";
import { getGradingPeriodsForSection } from "@/lib/utils/schoolYear";
import {
  groupLearnersBySex,
  sortLearnersBySex,
} from "@/lib/utils/learnerSex";
import { Download } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";

/** One learner row of the matrix, in the order the section page lists them. */
export interface MatrixStudent {
  id: string;
  name: string;
  enrollmentStatus: string;
  /** sms_students.gender — the grid lists MALE, then FEMALE. */
  gender?: string | null;
}

/** A matrix column — the shared shape in lib/utils/sectionGrades.ts. */
export type MatrixSubject = SectionGradeSubject;

interface SectionGradesMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
  sectionId: string;
  sectionLabel: string;
  schoolYear: string;
  gradeLevel: number | null;
  students: MatrixStudent[];
  subjects: MatrixSubject[];
  /** Subject id → the teacher(s) scheduled on it, for the column tooltip. */
  teachersBySubjectId: Record<string, string[]>;
  /** Migration 189 — an old-curriculum SHS section has four semestral quarters. */
  shsCurriculum?: string | null;
}

/** Which period the grid is showing; "final" is the per-subject final grade. */
type PeriodView = number | "final";

const EMPTY_GRADES: SectionGrades = {
  periodsByCell: new Map(),
  extraSubjects: [],
  rosterBySubjectId: new Map(),
};

function formatScore(value: number | null): string {
  return value == null ? "—" : String(Math.round(value));
}

const mean = (values: number[]): number | null =>
  values.length === 0
    ? null
    : Math.round(values.reduce((a, b) => a + b, 0) / values.length);

export function SectionGradesMatrixModal({
  isOpen,
  onClose,
  sectionId,
  sectionLabel,
  schoolYear,
  gradeLevel,
  students,
  subjects,
  teachersBySubjectId,
  shsCurriculum,
}: SectionGradesMatrixModalProps) {
  const [loading, setLoading] = useState(false);
  const [grades, setGrades] = useState<SectionGrades>(EMPTY_GRADES);
  const [view, setView] = useState<PeriodView>(1);

  // 3 terms from SY 2026-2027 (MATATAG), 4 quarters before it.
  const gradingPeriods = useMemo(
    () => getGradingPeriodsForSection(schoolYear, shsCurriculum),
    [schoolYear, shsCurriculum],
  );
  const periodCount = gradingPeriods.length;
  const periodValues = useMemo(
    () => gradingPeriods.map((p) => p.value),
    [gradingPeriods],
  );

  const subjectsKey = useMemo(
    () => subjects.map((s) => String(s.id)).sort().join(","),
    [subjects],
  );

  useEffect(() => {
    if (!isOpen) return;
    // A period the school year does not have (Q4 on a 3-term year) would
    // render an empty grid.
    if (view !== "final" && !periodValues.includes(view)) setView(1);
  }, [isOpen, view, periodValues]);

  useEffect(() => {
    if (!isOpen || !sectionId || !schoolYear) return;

    let isMounted = true;
    setLoading(true);
    setGrades(EMPTY_GRADES);

    void (async () => {
      try {
        // Every grade in the section, whoever encoded it — the point of the
        // grid is the subjects the adviser does NOT teach.
        const fetched = await fetchSectionGrades(
          sectionId,
          schoolYear,
          subjects,
          periodValues,
        );
        if (!isMounted) return;
        setGrades(fetched);
      } catch (error) {
        console.error("SectionGradesMatrixModal:", error);
        if (isMounted) toast.error("Could not load the section's grades");
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isOpen, sectionId, schoolYear, subjectsKey, periodValues, subjects]);

  const columns = useMemo(
    () => sectionGradeColumns(subjects, grades.extraSubjects),
    [subjects, grades.extraSubjects],
  );

  const periodsFor = useCallback(
    (studentId: string, subjectId: string): PeriodMap =>
      grades.periodsByCell.get(sectionGradeKey(studentId, subjectId)) ?? {},
    [grades],
  );

  /** Whether this learner takes this subject at all (migration 179). */
  const takesSubject = useCallback(
    (studentId: string, subject: MatrixSubject): boolean =>
      learnerTakesSubject(grades, studentId, subject),
    [grades],
  );

  /**
   * The card's own rows for one learner, so the General Average column here
   * and the printed report card cannot disagree.
   */
  const cardRowsFor = useCallback(
    (studentId: string): CardSubjectRow[] =>
      learnerCardRows(grades, columns, studentId, gradeLevel, periodCount),
    [grades, columns, gradeLevel, periodCount],
  );

  /** The figure in one cell, for the period on screen. */
  const scoreFor = useCallback(
    (studentId: string, subject: MatrixSubject): number | null => {
      const periods = periodsFor(studentId, subject.id);
      if (view !== "final") return periods[view] ?? null;
      const present = periodValues.map((v) => periods[v] ?? null);
      if (present.some((v) => v == null)) return null;
      return mean(present as number[]);
    },
    [periodsFor, periodValues, view],
  );

  const generalAverageFor = useCallback(
    (studentId: string): number | null => {
      const rows = cardRowsFor(studentId);
      if (view === "final") return computeGeneralAverage(rows).average;
      return periodGeneralAverage(rows, view);
    },
    [cardRowsFor, view],
  );

  /**
   * The learners the column footers are measured against. A learner released
   * to another school is still shown as a record — the section list above does
   * the same — but counting them would understate every subject's encoding.
   */
  const rosterStudents = useMemo(
    () => students.filter((s) => s.enrollmentStatus !== "transferred_out"),
    [students],
  );

  const columnSummary = useCallback(
    (subject: MatrixSubject) => {
      const expected = rosterStudents.filter((s) =>
        takesSubject(s.id, subject),
      );
      const scores = expected
        .map((s) => scoreFor(s.id, subject))
        .filter((v): v is number => v != null);
      return {
        encoded: scores.length,
        expected: expected.length,
        average: mean(scores),
      };
    },
    [rosterStudents, scoreFor, takesSubject],
  );

  const hasAnyGrade = grades.periodsByCell.size > 0;
  const periodNoun = periodCount === 3 ? "term" : "quarter";
  const viewLabel =
    view === "final"
      ? "Final grade"
      : gradingPeriods.find((p) => p.value === view)?.label ?? "";

  const handleExport = () => {
    // Matches the section list's Print / Export: a learner already released to
    // another school is off the sheet, though the grid still shows the row.
    // Boys first, then girls, with a Sex column; no heading rows in a sheet.
    const data = sortLearnersBySex(rosterStudents, (s) => s.gender).map(
      (student, index) => {
        const row: Record<string, string | number> = {
          "#": index + 1,
          Learner: student.name,
          Sex: student.gender
            ? student.gender.charAt(0).toUpperCase() + student.gender.slice(1)
            : "",
        };
        for (const subject of columns) {
          row[subject.code] = !takesSubject(student.id, subject)
            ? "n/a"
            : formatScore(scoreFor(student.id, subject));
        }
        row["Gen. Ave."] = formatScore(generalAverageFor(student.id));
        return row;
      },
    );

    if (data.length === 0) {
      toast.error("Nothing to export");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Grades");
    XLSX.writeFile(
      workbook,
      `Grades - ${sectionLabel} - ${viewLabel} - ${schoolYear}.xlsx`.replace(
        /[\\/:*?"<>|]/g,
        "-",
      ),
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] w-[min(96vw,1400px)] max-w-none overflow-hidden sm:max-w-none">
        <DialogHeader>
          <DialogTitle>Grades Matrix — {sectionLabel}</DialogTitle>
          <DialogDescription>
            Every learner against every subject for school year {schoolYear},
            including the subjects taught by other teachers. Read-only — grades
            are encoded by the teacher assigned to each subject.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border bg-muted p-0.5">
            {gradingPeriods.map((p) => (
              <button
                key={p.value}
                onClick={() => setView(p.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-sm transition-colors ${
                  view === p.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.short}
              </button>
            ))}
            <button
              onClick={() => setView("final")}
              className={`px-3 py-1.5 text-sm font-medium rounded-sm transition-colors ${
                view === "final"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Final
            </button>
          </div>
          <span className="text-sm text-muted-foreground">
            {view === "final"
              ? `Average of all ${periodCount} ${periodNoun}s, blank until every one is encoded`
              : viewLabel}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={handleExport}
            disabled={loading || columns.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Loading grades…
          </div>
        ) : columns.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            This section has no graded subjects scheduled yet.
          </div>
        ) : students.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No learners enrolled in this section.
          </div>
        ) : (
          <TooltipProvider>
            <div className="overflow-auto rounded-md border max-h-[60vh]">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-20 bg-muted">
                  <tr>
                    <th className="sticky left-0 z-30 bg-muted px-3 py-2 text-left font-medium w-10">
                      #
                    </th>
                    <th className="sticky left-10 z-30 bg-muted px-3 py-2 text-left font-medium min-w-[200px]">
                      Learner
                    </th>
                    {columns.map((subject) => {
                      const teachers = teachersBySubjectId[subject.id] ?? [];
                      return (
                        <th
                          key={subject.id}
                          className="px-2 py-2 text-center font-medium w-[64px]"
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">{subject.code}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="font-medium">{subject.name}</div>
                              <div className="text-xs">
                                {teachers.length > 0
                                  ? teachers.join(", ")
                                  : "No teacher assigned"}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </th>
                      );
                    })}
                    <th className="px-2 py-2 text-center font-medium w-[84px]">
                      Gen. Ave.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groupLearnersBySex(students, (s) => s.gender)
                    .filter((group) => group.rows.length > 0)
                    .map((group) => (
                      <Fragment key={group.key}>
                        <LearnerSexGroupRow
                          label={group.label}
                          count={group.rows.length}
                          colSpan={columns.length + 3}
                        />
                        {group.rows.map((student, index) => {
                          const departed =
                            student.enrollmentStatus === "transferred_out";
                          return (
                            <tr
                              key={student.id}
                              className={`border-t ${departed ? "opacity-60" : ""}`}
                            >
                              <td className="sticky left-0 z-10 bg-background px-3 py-2 text-muted-foreground tabular-nums">
                                {index + 1}
                              </td>
                              <td className="sticky left-10 z-10 bg-background px-3 py-2 whitespace-nowrap">
                                {student.name}
                                {departed && (
                                  <Badge
                                    variant="outline"
                                    className="ml-2 text-xs font-normal"
                                  >
                                    Transferred out
                                  </Badge>
                                )}
                              </td>
                              {columns.map((subject) => {
                                if (!takesSubject(student.id, subject)) {
                                  return (
                                    <td
                                      key={subject.id}
                                      className="px-2 py-2 text-center text-muted-foreground"
                                    >
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="cursor-help">·</span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          Not on this subject&apos;s roster
                                        </TooltipContent>
                                      </Tooltip>
                                    </td>
                                  );
                                }
                                const score = scoreFor(student.id, subject);
                                return (
                                  <td
                                    key={subject.id}
                                    className={`px-2 py-2 text-center tabular-nums ${
                                      score == null
                                        ? "text-muted-foreground"
                                        : score < PASSING_GRADE
                                          ? "text-red-600 font-medium"
                                          : ""
                                    }`}
                                  >
                                    {formatScore(score)}
                                  </td>
                                );
                              })}
                              <td className="px-2 py-2 text-center tabular-nums font-medium">
                                {formatScore(generalAverageFor(student.id))}
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                </tbody>
                <tfoot className="sticky bottom-0 z-20 bg-muted">
                  <tr className="border-t">
                    <td
                      colSpan={2}
                      className="sticky left-0 z-30 bg-muted px-3 py-2 text-right font-medium"
                    >
                      Encoded
                    </td>
                    {columns.map((subject) => {
                      const { encoded, expected } = columnSummary(subject);
                      const complete = expected > 0 && encoded >= expected;
                      return (
                        <td
                          key={subject.id}
                          className={`px-2 py-2 text-center text-xs tabular-nums ${
                            expected === 0
                              ? "text-muted-foreground"
                              : complete
                                ? "text-green-700"
                                : encoded === 0
                                  ? "text-red-600"
                                  : "text-amber-700"
                          }`}
                        >
                          {expected === 0 ? "—" : `${encoded}/${expected}`}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2" />
                  </tr>
                  <tr className="border-t">
                    <td
                      colSpan={2}
                      className="sticky left-0 z-30 bg-muted px-3 py-2 text-right font-medium"
                    >
                      Class average
                    </td>
                    {columns.map((subject) => (
                      <td
                        key={subject.id}
                        className="px-2 py-2 text-center tabular-nums font-medium"
                      >
                        {formatScore(columnSummary(subject).average)}
                      </td>
                    ))}
                    <td className="px-2 py-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </TooltipProvider>
        )}

        {!loading && !hasAnyGrade && columns.length > 0 && (
          <p className="text-sm text-muted-foreground">
            No grades have been encoded for this section yet.
          </p>
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
