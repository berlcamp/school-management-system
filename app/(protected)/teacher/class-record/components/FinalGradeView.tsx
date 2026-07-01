"use client";

import { formatLrn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";
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

export function FinalGradeView({
  subjectId,
  sectionId,
  schoolYear,
  students,
}: FinalGradeViewProps) {
  const [grades, setGrades] = useState<TermGrades>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("sms_grades")
        .select("student_id, grading_period, grade")
        .eq("subject_id", subjectId)
        .eq("section_id", sectionId)
        .eq("school_year", schoolYear)
        .in("grading_period", [1, 2, 3]);
      if (!mounted) return;
      const map: TermGrades = {};
      (data || []).forEach((row) => {
        const sid = String(row.student_id);
        if (!map[sid]) map[sid] = {};
        map[sid][row.grading_period] = Number(row.grade);
      });
      setGrades(map);
      setLoading(false);
    };
    load();
    return () => {
      mounted = false;
    };
  }, [subjectId, sectionId, schoolYear]);

  /** Final grade = average of the available term grades, rounded. */
  const finalOf = (studentId: string): number | null => {
    const terms = grades[studentId];
    if (!terms) return null;
    const values = [1, 2, 3].map((p) => terms[p]).filter((g): g is number => g != null);
    if (values.length === 0) return null;
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
    <div className="overflow-x-auto border rounded-md">
      <table className="text-sm border-collapse min-w-full">
        <thead>
          <tr className="bg-muted/60">
            <th className="border px-3 py-2 text-left min-w-56">Learners&apos; Names</th>
            <th className="border px-3 py-2 text-center w-24">1st Term</th>
            <th className="border px-3 py-2 text-center w-24">2nd Term</th>
            <th className="border px-3 py-2 text-center w-24">3rd Term</th>
            <th className="border px-3 py-2 text-center w-24 text-green-700">Final Grade</th>
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
                <td className="border px-3 py-1.5 text-center">{t[1] ?? "-"}</td>
                <td className="border px-3 py-1.5 text-center">{t[2] ?? "-"}</td>
                <td className="border px-3 py-1.5 text-center">{t[3] ?? "-"}</td>
                <td className="border px-3 py-1.5 text-center font-semibold text-green-700">
                  {fin ?? "-"}
                </td>
                <td className="border px-3 py-1.5 text-center text-xs">
                  {fin === null ? "-" : descriptor(fin)}
                </td>
              </tr>
            );
          })}
          {students.length === 0 && (
            <tr>
              <td colSpan={6} className="border px-3 py-6 text-center text-muted-foreground">
                No enrolled learners found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
