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
  getStudentClassRecordBreakdown,
  type ClassRecordBreakdown,
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

const PERIOD_FIELDS: { period: number; field: keyof SubjectGrades }[] = [
  { period: 1, field: "q1" },
  { period: 2, field: "q2" },
  { period: 3, field: "q3" },
  { period: 4, field: "q4" },
];

interface BreakdownState {
  loading: boolean;
  data: ClassRecordBreakdown | null;
}

export default function StudentGradesPage() {
  const { session } = useStudentSession();
  const [data, setData] = useState<SchoolYearGrades[]>([]);
  const [selectedSy, setSelectedSy] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Which subject+period cell is expanded, e.g. "12:2" (subjectId:period)
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  // Cache of fetched breakdowns keyed by "subjectId:period:schoolYear"
  const [breakdowns, setBreakdowns] = useState<
    Record<string, BreakdownState>
  >({});

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

  const toggleCell = useCallback(
    (subjectId: string, period: number) => {
      if (!session?.studentId || !selectedSy) return;
      const cellKey = `${subjectId}:${period}`;
      const cacheKey = `${subjectId}:${period}:${selectedSy}`;

      setExpandedKey((prev) => (prev === cellKey ? null : cellKey));

      // Lazy-fetch once per cell
      if (breakdowns[cacheKey]) return;
      setBreakdowns((prev) => ({
        ...prev,
        [cacheKey]: { loading: true, data: null },
      }));
      getStudentClassRecordBreakdown(
        session.studentId,
        subjectId,
        selectedSy,
        period,
      )
        .then((result) => {
          setBreakdowns((prev) => ({
            ...prev,
            [cacheKey]: { loading: false, data: result },
          }));
        })
        .catch(() => {
          setBreakdowns((prev) => ({
            ...prev,
            [cacheKey]: { loading: false, data: null },
          }));
        });
    },
    [session?.studentId, selectedSy, breakdowns],
  );

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
              Tap a grade to see how it was computed
            </p>
          </div>
        </div>
        <div className="w-48">
          <label className="text-sm font-medium text-gray-700 mb-2 block">
            School Year
          </label>
          <Select
            value={selectedSy}
            onValueChange={(v) => {
              setSelectedSy(v);
              setExpandedKey(null);
            }}
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
                  const cacheSuffix = selectedSy;
                  return (
                    <FragmentRow key={subj.subjectId}>
                      <tr className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {subj.subjectName}
                        </td>
                        {PERIOD_FIELDS.map(({ period, field }) => {
                          const value = subj[field] as number | null;
                          const cellKey = `${subj.subjectId}:${period}`;
                          const isExpanded = expandedKey === cellKey;
                          if (value === null) {
                            return (
                              <td
                                key={period}
                                className="px-4 py-3 text-center text-gray-400"
                              >
                                —
                              </td>
                            );
                          }
                          return (
                            <td key={period} className="px-2 py-2 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  toggleCell(subj.subjectId, period)
                                }
                                className={`min-w-[2.75rem] rounded-md px-2 py-1 font-medium transition-colors ${
                                  isExpanded
                                    ? "bg-blue-600 text-white"
                                    : "text-gray-700 hover:bg-blue-50 hover:text-blue-700"
                                }`}
                              >
                                {formatGrade(value)}
                              </button>
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-center font-medium text-gray-900">
                          {avg !== null ? formatGrade(avg) : "—"}
                        </td>
                      </tr>
                      {PERIOD_FIELDS.map(({ period }) => {
                        const cellKey = `${subj.subjectId}:${period}`;
                        if (expandedKey !== cellKey) return null;
                        const state =
                          breakdowns[
                            `${subj.subjectId}:${period}:${cacheSuffix}`
                          ];
                        return (
                          <tr key={`bd-${period}`} className="bg-gray-50/70">
                            <td colSpan={6} className="px-4 py-4">
                              <BreakdownPanel
                                loading={state?.loading ?? true}
                                data={state?.data ?? null}
                                period={period}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </FragmentRow>
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

/** <tbody> can't take a keyed fragment directly with rows; this groups rows. */
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function BreakdownPanel({
  loading,
  data,
  period,
}: {
  loading: boolean;
  data: ClassRecordBreakdown | null;
  period: number;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-5 w-40 bg-gray-200" />
        <Skeleton className="h-24 w-full bg-gray-100" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
        A detailed breakdown isn&apos;t available for this grade.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">
          Grading Period {period} — {data.subjectName}
        </h3>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full bg-gray-900 px-3 py-1 font-semibold text-white">
            Grade: {formatGrade(data.termGrade)}
          </span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {data.components.map((c) => (
          <div
            key={c.key}
            className="rounded-xl border border-gray-200 bg-white p-4"
          >
            <div className="mb-3 flex items-baseline justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">{c.title}</p>
                <p className="text-xs text-gray-500">Weight {c.weight}%</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-gray-900">
                  {c.ps === null ? "—" : c.ps}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-gray-400">
                  PS
                </p>
              </div>
            </div>

            {c.items.length === 0 ? (
              <p className="text-xs text-gray-400">No items.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400">
                    <th className="pb-1 text-left font-medium">Item</th>
                    <th className="pb-1 text-right font-medium">Score</th>
                    <th className="pb-1 text-right font-medium">Max</th>
                    {c.key === "ST" && (
                      <th className="pb-1 text-right font-medium">Wt%</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {c.items.map((it, idx) => (
                    <tr
                      key={idx}
                      className="border-t border-gray-100 text-gray-700"
                    >
                      <td className="py-1 pr-2 text-left">{it.label}</td>
                      <td className="py-1 text-right tabular-nums">
                        {it.rawScore === null ? "—" : it.rawScore}
                      </td>
                      <td className="py-1 text-right tabular-nums text-gray-400">
                        {it.maxScore}
                      </td>
                      {c.key === "ST" && (
                        <td className="py-1 text-right tabular-nums text-gray-400">
                          {it.weight ?? "—"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2 text-xs">
              <span className="text-gray-500">Weighted Score</span>
              <span className="font-semibold text-gray-900">
                {c.ws === null ? "—" : c.ws}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-white px-4 py-3 text-xs text-gray-600">
        <span>
          Initial Grade:{" "}
          <span className="font-semibold text-gray-900">
            {data.initialGrade}
          </span>
        </span>
        {data.useTransmutation && (
          <span className="text-gray-500">
            {data.gradingScheme === "matatag"
              ? "Transmuted (K to 10 ECR, updated)"
              : "Transmuted (DO 8, s.2015)"}
          </span>
        )}
        <span>
          Final Term Grade:{" "}
          <span className="font-semibold text-gray-900">
            {formatGrade(data.termGrade)}
          </span>
        </span>
      </div>
    </div>
  );
}
