"use client";

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
import { isShsGrade } from "@/lib/constants/shs";
import { supabase } from "@/lib/supabase/client";
import {
  buildCardSubjectRows,
  computeGeneralAverage,
  PASSING_GRADE,
  type CardSubjectRow,
  type MapehSourceRow,
} from "@/lib/utils/mapeh";
import { getGradingPeriodsForSection } from "@/lib/utils/schoolYear";
import { Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";

/** One learner row of the matrix, in the order the section page lists them. */
export interface MatrixStudent {
  id: string;
  name: string;
  enrollmentStatus: string;
}

/**
 * A matrix column. A subset of `Subject` — everything `buildCardSubjectRows`
 * needs to fold the tagged learning areas, plus the roster flag (migration
 * 179) that decides this column's denominator.
 */
export interface MatrixSubject {
  id: string;
  code: string;
  name: string;
  is_madrasah?: boolean | null;
  selective_enrolment?: boolean | null;
  mapeh_component?: string | null;
  tle_component?: string | null;
  comm_component?: string | null;
  units?: number | null;
  shs_category?: string | null;
}

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

type PeriodMap = Record<number, number | null>;
/** Which period the grid is showing; "final" is the per-subject final grade. */
type PeriodView = number | "final";

interface GradeFetchRow {
  student_id: string;
  subject_id: string;
  grading_period: number;
  grade: number;
  subject: MatrixSubject | MatrixSubject[] | null;
}

/**
 * PostgREST caps a single response at 1000 rows. A section of 45 learners
 * across a dozen subjects and four quarters is well past that, so the grades
 * are paged rather than fetched in one call — the silent truncation would
 * read on screen as "the teacher has not encoded yet", which is the one
 * conclusion this grid exists to support.
 */
const PAGE_SIZE = 1000;

const cellKey = (studentId: string, subjectId: string) =>
  `${studentId}::${subjectId}`;

function normalizeSubject(
  raw: MatrixSubject | MatrixSubject[] | null,
): MatrixSubject | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

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
  const [periodsByCell, setPeriodsByCell] = useState<Map<string, PeriodMap>>(
    new Map(),
  );
  const [extraSubjects, setExtraSubjects] = useState<MatrixSubject[]>([]);
  const [rosterBySubjectId, setRosterBySubjectId] = useState<
    Map<string, Set<string>>
  >(new Map());
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
    setPeriodsByCell(new Map());
    setExtraSubjects([]);
    setRosterBySubjectId(new Map());

    void (async () => {
      try {
        // Every grade in the section, whoever encoded it — the point of the
        // grid is the subjects the adviser does NOT teach.
        const rows: GradeFetchRow[] = [];
        for (let from = 0; ; from += PAGE_SIZE) {
          const { data, error } = await supabase
            .from("sms_grades")
            .select(
              "student_id, subject_id, grading_period, grade, subject:sms_subjects!sms_grades_subject_id_fkey(id, code, name, is_madrasah, selective_enrolment, mapeh_component, tle_component, comm_component, units, shs_category)",
            )
            .eq("section_id", sectionId)
            .eq("school_year", schoolYear)
            .order("student_id", { ascending: true })
            .order("subject_id", { ascending: true })
            .order("grading_period", { ascending: true })
            .range(from, from + PAGE_SIZE - 1);
          if (error) throw new Error(error.message);
          rows.push(...((data ?? []) as GradeFetchRow[]));
          if (!data || data.length < PAGE_SIZE) break;
        }
        if (!isMounted) return;

        const map = new Map<string, PeriodMap>();
        const known = new Set(subjectsKey.split(",").filter(Boolean));
        const extras: MatrixSubject[] = [];

        for (const raw of rows) {
          const sid = String(raw.subject_id);
          const key = cellKey(String(raw.student_id), sid);
          if (!map.has(key)) map.set(key, {});
          const periods = map.get(key)!;
          if (periodValues.includes(raw.grading_period)) {
            periods[raw.grading_period] = Number(raw.grade);
          }

          // A subject dropped from the timetable after grades were encoded
          // still has to show its column, else the marks vanish from the grid.
          const sub = normalizeSubject(raw.subject);
          if (sub && !known.has(sid) && !extras.some((e) => e.id === sid)) {
            extras.push({ ...sub, id: sid });
          }
        }

        // Selective subjects (migration 179) are measured against their own
        // roster, never the section's: a 12-learner EPP/TLE group counted out
        // of 45 reads as permanently under-encoded, which is the exact bug
        // migration 179 had to repair in the Grade Monitoring RPC.
        const selective = [...subjects, ...extras].filter(
          (s) => s.selective_enrolment === true,
        );
        const rosters = new Map<string, Set<string>>();
        if (selective.length > 0) {
          const { data: rosterRows, error: rosterError } = await supabase
            .from("sms_student_subjects")
            .select("student_id, subject_id")
            .eq("section_id", sectionId)
            .eq("school_year", schoolYear)
            .in(
              "subject_id",
              selective.map((s) => s.id),
            );
          if (rosterError) throw new Error(rosterError.message);
          for (const r of rosterRows ?? []) {
            const sid = String(r.subject_id);
            if (!rosters.has(sid)) rosters.set(sid, new Set());
            rosters.get(sid)!.add(String(r.student_id));
          }
          // An encoded grade is the stronger evidence of enrolment than the
          // roster table — the rule TeacherGradeEntryTable already applies.
          for (const raw of rows) {
            const sid = String(raw.subject_id);
            if (rosters.has(sid)) {
              rosters.get(sid)!.add(String(raw.student_id));
            }
          }
        }

        if (!isMounted) return;
        extras.sort((a, b) => a.code.localeCompare(b.code));
        setPeriodsByCell(map);
        setExtraSubjects(extras);
        setRosterBySubjectId(rosters);
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

  const columns = useMemo(() => {
    const seen = new Set(subjects.map((s) => String(s.id)));
    return [
      ...subjects.map((s) => ({ ...s, id: String(s.id) })),
      ...extraSubjects.filter((e) => !seen.has(e.id)),
    ].sort((a, b) => a.code.localeCompare(b.code));
  }, [subjects, extraSubjects]);

  const periodsFor = useCallback(
    (studentId: string, subjectId: string): PeriodMap =>
      periodsByCell.get(cellKey(studentId, subjectId)) ?? {},
    [periodsByCell],
  );

  /** Whether this learner takes this subject at all (migration 179). */
  const takesSubject = useCallback(
    (studentId: string, subject: MatrixSubject): boolean => {
      if (subject.selective_enrolment !== true) return true;
      return rosterBySubjectId.get(subject.id)?.has(studentId) ?? false;
    },
    [rosterBySubjectId],
  );

  /**
   * The card's own rows for one learner, so the General Average column here
   * and the printed report card cannot disagree: MAPEH (153/155) and EPP/TLE
   * (174) fold into one parent that counts once, and a Madrasah/ALS subject
   * counts not at all (076/128, invariant 15).
   */
  const cardRowsFor = useCallback(
    (studentId: string): CardSubjectRow[] => {
      const sourceRows: MapehSourceRow[] = columns
        .filter((subject) => takesSubject(studentId, subject))
        .map((subject) => {
          const periods = periodsFor(studentId, subject.id);
          return {
            name: subject.name,
            code: subject.code,
            is_madrasah: subject.is_madrasah === true,
            mapeh_component: subject.mapeh_component ?? null,
            tle_component: subject.tle_component ?? null,
            comm_component: subject.comm_component ?? null,
            units: subject.units ?? null,
            shs_category: subject.shs_category ?? null,
            q1: periods[1] ?? null,
            q2: periods[2] ?? null,
            q3: periodCount >= 3 ? periods[3] ?? null : null,
            q4: periodCount >= 4 ? periods[4] ?? null : null,
          };
        });

      return buildCardSubjectRows(sourceRows, {
        gradeLevel,
        groupByShsCategory: isShsGrade(gradeLevel),
        // A final grade is a figure for the whole year, not a running average
        // of the periods encoded so far — the rule generateReportCard applies.
        requirePeriods: periodCount,
      });
    },
    [columns, gradeLevel, periodCount, periodsFor, takesSubject],
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
      const key = `q${view}` as "q1" | "q2" | "q3" | "q4";
      return mean(
        rows
          .filter((r) => r.countsTowardAverage)
          .map((r) => r[key])
          .filter((v): v is number => v != null),
      );
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

  const hasAnyGrade = periodsByCell.size > 0;
  const periodNoun = periodCount === 3 ? "term" : "quarter";
  const viewLabel =
    view === "final"
      ? "Final grade"
      : gradingPeriods.find((p) => p.value === view)?.label ?? "";

  const handleExport = () => {
    // Matches the section list's Print / Export: a learner already released to
    // another school is off the sheet, though the grid still shows the row.
    const data = rosterStudents.map((student, index) => {
      const row: Record<string, string | number> = {
        "#": index + 1,
        Learner: student.name,
      };
      for (const subject of columns) {
        row[subject.code] = !takesSubject(student.id, subject)
          ? "n/a"
          : formatScore(scoreFor(student.id, subject));
      }
      row["Gen. Ave."] = formatScore(generalAverageFor(student.id));
      return row;
    });

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
                  {students.map((student, index) => {
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
