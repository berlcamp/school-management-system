"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getStudentGrades,
  type SchoolYearGrades,
  type SubjectGrades,
} from "@/lib/student-portal/actions";
import { getSchoolYearOptions } from "@/lib/utils/schoolYear";
import { useStudentSession } from "@/lib/student-portal/context";
import { Award } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

function formatGrade(grade: number | null): string {
  if (grade === null) return "—";
  return String(Math.round(grade * 100) / 100);
}

function computeAverage(subj: SubjectGrades): number | null {
  const grades = [subj.q1, subj.q2, subj.q3, subj.q4].filter(
    (g): g is number => g !== null,
  );
  if (grades.length === 0) return null;
  return grades.reduce((a, b) => a + b, 0) / grades.length;
}

export default function StudentGradesPage() {
  const { session } = useStudentSession();
  const [data, setData] = useState<SchoolYearGrades[]>([]);
  const [selectedSy, setSelectedSy] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const fetchGrades = useCallback(async () => {
    if (!session?.studentId) return;
    setLoading(true);
    try {
      const result = await getStudentGrades(session.studentId);
      setData(result);
      setSelectedSy((prev) => {
        if (prev) return prev;
        if (result.length > 0) return result[0]!.schoolYear;
        return getSchoolYearOptions(4, 1)[0] ?? "";
      });
    } finally {
      setLoading(false);
    }
  }, [session?.studentId]);

  useEffect(() => {
    fetchGrades();
  }, [fetchGrades]);

  const selectedData = data.find((d) => d.schoolYear === selectedSy);
  const syOptions = data.length > 0 ? data.map((d) => d.schoolYear) : getSchoolYearOptions(4, 1);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Award className="h-6 w-6" />
          Grade Records
        </h1>
        <div className="rounded-2xl bg-white/10 border border-white/20 p-8 text-center text-white/70">
          Loading grades...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Award className="h-6 w-6" />
          Grade Records
        </h1>
        <p className="text-white/70 mt-1">
          View your grades by school year and subject
        </p>
      </div>

      <Card className="rounded-2xl bg-white/15 backdrop-blur-xl border-white/25">
        <CardHeader>
          <CardTitle className="text-white">Grades by School Year</CardTitle>
          <CardDescription className="text-white/80">
            Select a school year to view your grades for all quarters
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="w-48">
            <label className="text-sm font-medium text-white/90 mb-2 block">
              School Year
            </label>
            <Select
              value={selectedSy}
              onValueChange={setSelectedSy}
              disabled={data.length === 0}
            >
              <SelectTrigger className="bg-white/15 border-white/30 text-white">
                <SelectValue placeholder="Select school year" />
              </SelectTrigger>
              <SelectContent>
                {syOptions.map((sy) => (
                  <SelectItem key={sy} value={sy}>
                    {sy}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedData && selectedData.subjects.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-white/20">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/20 bg-white/10">
                    <th className="px-4 py-3 text-left font-medium text-white">
                      Subject
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-white w-24">
                      Q1
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-white w-24">
                      Q2
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-white w-24">
                      Q3
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-white w-24">
                      Q4
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-white w-24">
                      Average
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selectedData.subjects.map((subj) => {
                    const avg = computeAverage(subj);
                    return (
                      <tr
                        key={subj.subjectId}
                        className="border-b border-white/10 hover:bg-white/5"
                      >
                        <td className="px-4 py-3 font-medium text-white">
                          {subj.subjectName}
                        </td>
                        <td className="px-4 py-3 text-center text-white/90">
                          {formatGrade(subj.q1)}
                        </td>
                        <td className="px-4 py-3 text-center text-white/90">
                          {formatGrade(subj.q2)}
                        </td>
                        <td className="px-4 py-3 text-center text-white/90">
                          {formatGrade(subj.q3)}
                        </td>
                        <td className="px-4 py-3 text-center text-white/90">
                          {formatGrade(subj.q4)}
                        </td>
                        <td className="px-4 py-3 text-center font-medium text-white">
                          {avg !== null ? formatGrade(avg) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-8 text-center text-white/60 rounded-lg bg-white/5">
              No grade records found for the selected school year.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
