"use client";

import {
  ClassRecordGradingScheme,
  DEFAULT_GRADING_SCHEME,
} from "@/lib/constants/classRecord";
import { supabase } from "@/lib/supabase/client";
import { formatLrn } from "@/lib/utils";
import { Student } from "@/types";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { descriptor } from "./classRecordUtils";

interface FinalGradeViewProps {
  subjectId: string;
  sectionId: string;
  schoolYear: string;
  students: Student[];
}

type TermGrades = Record<string, Record<number, number>>; // studentId -> period -> grade

const TERMS = [1, 2, 3] as const;

export function FinalGradeView({
  subjectId,
  sectionId,
  schoolYear,
  students,
}: FinalGradeViewProps) {
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
          .in("grading_period", [1, 2, 3]),
        // The descriptor band depends on which grading scheme the terms were
        // graded under, which is pinned on the class record (migration 173).
        supabase
          .from("sms_class_records")
          .select("grading_period, grading_scheme")
          .eq("subject_id", subjectId)
          .eq("section_id", sectionId)
          .eq("school_year", schoolYear)
          .in("grading_period", [1, 2, 3])
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
  }, [subjectId, sectionId, schoolYear]);

  /**
   * Final Grade = the average of the three term grades, rounded.
   *
   * All three terms must be posted. The DepEd form is explicit about this
   * (`IF(COUNT(TERM 1, TERM 2, TERM 3) < 3, "", ROUND(AVERAGE(...), 0))`):
   * averaging whatever terms happen to exist reports a mid-year figure as if
   * it were the year's final grade.
   */
  const finalOf = (studentId: string): number | null => {
    const terms = grades[studentId];
    if (!terms) return null;
    const values = TERMS.map((p) => terms[p]).filter(
      (g): g is number => g != null
    );
    if (values.length < TERMS.length) return null;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading final grades…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {mixedSchemes && (
        <p className="text-xs text-amber-600">
          The three terms were not all graded under the same DepEd grading
          scheme. The descriptor below follows the latest term&apos;s scheme.
        </p>
      )}
      <div className="overflow-x-auto border rounded-md">
        <table className="text-sm border-collapse min-w-full">
          <thead>
            <tr className="bg-muted/60">
              <th className="border px-3 py-2 text-left min-w-56">
                Learners&apos; Names
              </th>
              <th className="border px-3 py-2 text-center w-24">1st Term</th>
              <th className="border px-3 py-2 text-center w-24">2nd Term</th>
              <th className="border px-3 py-2 text-center w-24">3rd Term</th>
              <th className="border px-3 py-2 text-center w-24 text-green-700">
                Final Grade
              </th>
              <th className="border px-3 py-2 text-center w-36">Descriptor</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const t = grades[s.id] || {};
              const fin = finalOf(s.id);
              return (
                <tr key={s.id} className="hover:bg-muted/30">
                  <td className="border px-3 py-1.5 whitespace-nowrap">
                    {s.last_name}, {s.first_name}
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                      {formatLrn(s.lrn)}
                    </span>
                  </td>
                  <td className="border px-3 py-1.5 text-center">
                    {t[1] ?? "-"}
                  </td>
                  <td className="border px-3 py-1.5 text-center">
                    {t[2] ?? "-"}
                  </td>
                  <td className="border px-3 py-1.5 text-center">
                    {t[3] ?? "-"}
                  </td>
                  <td className="border px-3 py-1.5 text-center font-semibold text-green-700">
                    {fin ?? "-"}
                  </td>
                  <td className="border px-3 py-1.5 text-center text-xs">
                    {fin === null ? "-" : descriptor(fin, scheme)}
                  </td>
                </tr>
              );
            })}
            {students.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="border px-3 py-6 text-center text-muted-foreground"
                >
                  No enrolled learners found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        The Final Grade is the average of the three term grades, and appears
        only once all three terms have been posted.
      </p>
    </div>
  );
}
