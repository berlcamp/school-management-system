"use client";

import { Skeleton } from "@/components/ui/skeleton";
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
  return String(Math.round(grade));
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
  const syOptions =
    data.length > 0
      ? data.map((d) => d.schoolYear)
      : getSchoolYearOptions(4, 1);

  return (
    <div className="space-y-6">
      <div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-up"
        style={{ animationDelay: "0.1s" }}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-white border border-gray-200 shadow-sm">
            <Award className="h-5 w-5 text-gray-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Grade Records</h2>
            <p className="text-sm text-gray-500">
              View your grades by school year and subject
            </p>
          </div>
        </div>
        <div className="w-48">
          <label className="text-sm font-medium text-gray-700 mb-2 block">
            School Year
          </label>
          <Select
            value={selectedSy}
            onValueChange={setSelectedSy}
            disabled={data.length === 0}
          >
            <SelectTrigger className="bg-white border-gray-200 text-gray-900">
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
      </div>

      <div
        className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6 sm:p-8 animate-fade-up"
        style={{ animationDelay: "0.2s" }}
      >
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-48 bg-gray-100" />
            <div className="rounded-lg border border-gray-100 overflow-hidden">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton
                  key={i}
                  className="h-12 w-full rounded-none bg-gray-50"
                />
              ))}
            </div>
          </div>
        ) : selectedData && selectedData.subjects.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-gray-900">
                    Subject
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700 w-24">
                    Q1
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700 w-24">
                    Q2
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700 w-24">
                    Q3
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700 w-24">
                    Q4
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700 w-24">
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
                      className="border-b border-gray-100 hover:bg-gray-50/50"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {subj.subjectName}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700">
                        {formatGrade(subj.q1)}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700">
                        {formatGrade(subj.q2)}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700">
                        {formatGrade(subj.q3)}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700">
                        {formatGrade(subj.q4)}
                      </td>
                      <td className="px-4 py-3 text-center font-medium text-gray-900">
                        {avg !== null ? formatGrade(avg) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center text-gray-500 rounded-xl bg-gray-50">
            No grade records found for the selected school year.
          </div>
        )}
      </div>
    </div>
  );
}
