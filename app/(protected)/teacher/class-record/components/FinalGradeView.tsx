"use client";

import {
  ClassRecordGradingScheme,
  DEFAULT_GRADING_SCHEME,
} from "@/lib/constants/classRecord";
import { isOldShsCurriculum } from "@/lib/constants/shs";
import { supabase } from "@/lib/supabase/client";
import {
  getGradingPeriodsForSection,
  gradingPeriodsOfSemester,
  SEMESTER_LABELS,
} from "@/lib/utils/schoolYear";
import { Student } from "@/types";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { descriptor, learnerName } from "./classRecordUtils";
import { DescriptorSummary } from "./DescriptorSummary";

interface FinalGradeViewProps {
  subjectId: string;
  sectionId: string;
  schoolYear: string;
  students: Student[];
  /** Migration 189 — "old" makes this two semesters of two quarters. */
  shsCurriculum?: string | null;
}

type TermGrades = Record<string, Record<number, number>>; // studentId -> period -> grade

/**
 * The grade the form actually reports, and the periods it is averaged from.
 *
 * On the MATATAG terms that is one Final Grade over all three. On the old SHS
 * curriculum it is a **Semester Final Grade per semester** — the two semesters
 * carry different subjects, so there is no annual figure to report and SF9 and
 * SF10 both print the semester as the final column.
 */
interface FinalColumn {
  label: string;
  periods: number[];
}

export function FinalGradeView({
  subjectId,
  sectionId,
  schoolYear,
  students,
  shsCurriculum,
}: FinalGradeViewProps) {
  const oldShs = isOldShsCurriculum(shsCurriculum);
  const periods = getGradingPeriodsForSection(schoolYear, shsCurriculum);
  const periodValues = periods.map((p) => p.value);
  const finalColumns: FinalColumn[] = oldShs
    ? ([1, 2] as const).map((sem) => ({
        label: `${SEMESTER_LABELS[sem]} Final`,
        periods: gradingPeriodsOfSemester(sem),
      }))
    : [{ label: "Final Grade", periods: periodValues }];
  const [grades, setGrades] = useState<TermGrades>({});
  const [scheme, setScheme] = useState<ClassRecordGradingScheme>(
    DEFAULT_GRADING_SCHEME
  );
  const [mixedSchemes, setMixedSchemes] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const [gradeRes, recordRes] = await Promise.all([
        supabase
          .from("sms_grades")
          .select("student_id, grading_period, grade")
          .eq("subject_id", subjectId)
          .eq("section_id", sectionId)
          .eq("school_year", schoolYear)
          .in("grading_period", periodValues),
        // The descriptor band depends on which grading scheme the terms were
        // graded under, which is pinned on the class record (migration 173).
        supabase
          .from("sms_class_records")
          .select("grading_period, grading_scheme")
          .eq("subject_id", subjectId)
          .eq("section_id", sectionId)
          .eq("school_year", schoolYear)
          .in("grading_period", periodValues)
          .order("grading_period"),
      ]);
      if (!mounted) return;

      const map: TermGrades = {};
      (gradeRes.data || []).forEach((row) => {
        const sid = String(row.student_id);
        if (!map[sid]) map[sid] = {};
        map[sid][row.grading_period] = Number(row.grade);
      });
      setGrades(map);

      // Before migration 173 the column does not exist and the select errors;
      // fall back to the old descriptors rather than relabelling old grades.
      const schemes = recordRes.error
        ? (["legacy"] as ClassRecordGradingScheme[])
        : ((recordRes.data || []).map((r) =>
            r.grading_scheme === "matatag" ? "matatag" : "legacy"
          ) as ClassRecordGradingScheme[]);
      // The latest term wins — a school that moved mid-year reports the year
      // under the scheme it finished on rather than the one it started on.
      setScheme(schemes.length ? schemes[schemes.length - 1] : DEFAULT_GRADING_SCHEME);
      setMixedSchemes(new Set(schemes).size > 1);

      setLoading(false);
    };
    load();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, sectionId, schoolYear, shsCurriculum]);

  /**
   * The average of the column's periods, rounded — and only once every one of
   * them is posted.
   *
   * The DepEd form is explicit about the completeness rule
   * (`IF(COUNT(TERM 1, TERM 2, TERM 3) < 3, "", ROUND(AVERAGE(...), 0))`):
   * averaging whatever periods happen to exist reports a mid-year figure as if
   * it were final. It holds a semester at a time on the old SHS curriculum,
   * where a first-semester grade is final in December and owes nothing to a
   * second semester that has not started.
   */
  const finalOf = (studentId: string, column: FinalColumn): number | null => {
    const terms = grades[studentId];
    if (!terms) return null;
    const values = column.periods
      .map((p) => terms[p])
      .filter((g): g is number => g != null);
    if (values.length < column.periods.length) return null;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading final grades…
      </div>
    );
  }

  // Only the learners whose three terms are all posted have a Final Grade at
  // all, so those are the ones the summary counts — the same rule the column
  // above follows.
  const finalsOfColumn = (column: FinalColumn) =>
    students
      .map((s) => finalOf(s.id, column))
      .filter((g): g is number => g !== null);

  return (
    <div className="space-y-2">
      {mixedSchemes && (
        <p className="text-xs text-amber-600">
          The {oldShs ? "quarters" : "three terms"} were not all graded under
          the same DepEd grading scheme. The descriptor below follows the
          latest one&apos;s scheme.
        </p>
      )}
      <div className="overflow-x-auto border rounded-md">
        <table className="text-sm border-collapse min-w-full">
          <thead>
            <tr className="bg-muted/60">
              <th className="border px-3 py-2 text-left min-w-56">
                Learners&apos; Names
              </th>
              {periods.map((p) => (
                <th
                  key={p.value}
                  className="border px-3 py-2 text-center w-24"
                >
                  {p.label}
                </th>
              ))}
              {finalColumns.map((c) => (
                <th
                  key={c.label}
                  className="border px-3 py-2 text-center w-28 text-green-700"
                >
                  {c.label}
                </th>
              ))}
              <th className="border px-3 py-2 text-center w-36">Descriptor</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const t = grades[s.id] || {};
              const finals = finalColumns.map((c) => finalOf(s.id, c));
              // The descriptor names the latest figure the learner actually
              // has — on a semestral record that is the semester just closed,
              // not a year nobody has finished.
              const latest = [...finals].reverse().find((g) => g !== null) ?? null;
              return (
                <tr key={s.id} className="hover:bg-muted/30">
                  <td className="border px-3 py-1.5 whitespace-nowrap">
                    {learnerName(s)}
                  </td>
                  {periods.map((p) => (
                    <td
                      key={p.value}
                      className="border px-3 py-1.5 text-center"
                    >
                      {t[p.value] ?? "-"}
                    </td>
                  ))}
                  {finals.map((fin, i) => (
                    <td
                      key={finalColumns[i].label}
                      className="border px-3 py-1.5 text-center font-semibold text-green-700"
                    >
                      {fin ?? "-"}
                    </td>
                  ))}
                  <td className="border px-3 py-1.5 text-center text-xs">
                    {latest === null ? "-" : descriptor(latest, scheme)}
                  </td>
                </tr>
              );
            })}
            {students.length === 0 && (
              <tr>
                <td
                  colSpan={periods.length + finalColumns.length + 2}
                  className="border px-3 py-6 text-center text-muted-foreground"
                >
                  No enrolled learners found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {students.length > 0 &&
        finalColumns.map((c) => (
          <DescriptorSummary
            key={c.label}
            grades={finalsOfColumn(c)}
            scheme={scheme}
            learnerCount={students.length}
            label={`${c.label} descriptors`}
          />
        ))}

      <p className="text-xs text-muted-foreground">
        {oldShs
          ? "Each Semester Final Grade is the average of that semester's two quarters, and appears only once both are posted. The old SHS curriculum reports a grade per semester — the two semesters carry different subjects, so there is no annual final."
          : "The Final Grade is the average of the three term grades, and appears only once all three terms have been posted."}
      </p>
    </div>
  );
}
