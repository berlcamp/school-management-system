"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";
import { useCallback, useEffect, useState } from "react";

interface EnrollmentStats {
  male: number;
  female: number;
  total: number;
  elementary: { male: number; female: number; total: number };
  juniorHigh: { male: number; female: number; total: number };
  seniorHigh: { male: number; female: number; total: number };
  byGradeLevel: { grade: number; count: number }[];
}

function getDefaultSchoolYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startYear = month >= 6 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

function getSchoolYearOptions(): string[] {
  const now = new Date();
  const year = now.getFullYear();
  const options: string[] = [];
  for (let i = -2; i <= 2; i++) {
    const startYear = year + i;
    options.push(`${startYear}-${startYear + 1}`);
  }
  return options;
}

export default function LandingHomePage() {
  const [schoolYear, setSchoolYear] = useState(getDefaultSchoolYear);
  const [stats, setStats] = useState<EnrollmentStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data: enrollments, error } = await supabase
        .from("sms_enrollments")
        .select(
          `
          grade_level,
          student:sms_students!sms_enrollments_student_id_fkey(gender)
        `,
        )
        .eq("status", "approved")
        .eq("school_year", schoolYear);

      if (error) {
        console.error("Enrollment fetch error:", error);
        setStats(null);
        return;
      }

      type EnrollmentRecord = {
        grade_level: number;
        student: { gender: string } | null;
      };
      const records = ((enrollments || []) as unknown[]).filter(
        (e): e is EnrollmentRecord =>
          e != null &&
          typeof (e as { grade_level?: unknown }).grade_level === "number",
      );

      let male = 0;
      let female = 0;
      const elem = { male: 0, female: 0, total: 0 };
      const jhs = { male: 0, female: 0, total: 0 };
      const shs = { male: 0, female: 0, total: 0 };
      const byGrade = Array.from({ length: 12 }, (_, i) => ({
        grade: i + 1,
        count: 0,
      }));

      for (const r of records) {
        const g = r.student?.gender?.toLowerCase() ?? "";
        const gl = r.grade_level;

        if (g === "male") {
          male++;
        } else if (g === "female") {
          female++;
        }

        if (gl >= 1 && gl <= 6) {
          if (g === "male") elem.male++;
          else if (g === "female") elem.female++;
          elem.total++;
        } else if (gl >= 7 && gl <= 10) {
          if (g === "male") jhs.male++;
          else if (g === "female") jhs.female++;
          jhs.total++;
        } else if (gl >= 11 && gl <= 12) {
          if (g === "male") shs.male++;
          else if (g === "female") shs.female++;
          shs.total++;
        }

        if (gl >= 1 && gl <= 12) {
          const idx = gl - 1;
          byGrade[idx]!.count++;
        }
      }

      setStats({
        male,
        female,
        total: male + female,
        elementary: elem,
        juniorHigh: jhs,
        seniorHigh: shs,
        byGradeLevel: byGrade,
      });
    } catch (err) {
      console.error("Stats fetch error:", err);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [schoolYear]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        Dashboard
      </h2>

      {/* School Year Selector */}
      <div className="flex justify-end mb-6">
        <select
          value={schoolYear}
          onChange={(e) => setSchoolYear(e.target.value)}
          className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm"
        >
          {getSchoolYearOptions().map((sy) => (
            <option key={sy} value={sy}>
              {sy}
            </option>
          ))}
        </select>
      </div>

      {/* Enrollment Widgets */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Enrollment</CardTitle>
            <CardDescription>All grade levels</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : stats ? (
              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-blue-600 font-medium">Male:</span>{" "}
                  {stats.male}
                </p>
                <p>
                  <span className="text-pink-600 font-medium">Female:</span>{" "}
                  {stats.female}
                </p>
                <p>
                  <span className="font-semibold">Total:</span> {stats.total}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Elementary</CardTitle>
            <CardDescription>Grades 1-6</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : stats ? (
              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-blue-600 font-medium">Male:</span>{" "}
                  {stats.elementary.male}
                </p>
                <p>
                  <span className="text-pink-600 font-medium">Female:</span>{" "}
                  {stats.elementary.female}
                </p>
                <p>
                  <span className="font-semibold">Total:</span>{" "}
                  {stats.elementary.total}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Junior High</CardTitle>
            <CardDescription>Grades 7-10</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : stats ? (
              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-blue-600 font-medium">Male:</span>{" "}
                  {stats.juniorHigh.male}
                </p>
                <p>
                  <span className="text-pink-600 font-medium">Female:</span>{" "}
                  {stats.juniorHigh.female}
                </p>
                <p>
                  <span className="font-semibold">Total:</span>{" "}
                  {stats.juniorHigh.total}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Senior High</CardTitle>
            <CardDescription>Grades 11-12</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : stats ? (
              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-blue-600 font-medium">Male:</span>{" "}
                  {stats.seniorHigh.male}
                </p>
                <p>
                  <span className="text-pink-600 font-medium">Female:</span>{" "}
                  {stats.seniorHigh.female}
                </p>
                <p>
                  <span className="font-semibold">Total:</span>{" "}
                  {stats.seniorHigh.total}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No data</p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Bar Chart */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Enrollment per Grade Level</CardTitle>
            <CardDescription>
              Total enrollment by grade for school year {schoolYear}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : stats && stats.byGradeLevel.some((g) => g.count > 0) ? (
              <div className="space-y-3">
                <div className="grid grid-cols-12 gap-2 items-end h-48">
                  {stats.byGradeLevel.map((g) => {
                    const max = Math.max(
                      ...stats!.byGradeLevel.map((x) => x.count),
                      1,
                    );
                    const pct = (g.count / max) * 100;
                    return (
                      <div
                        key={g.grade}
                        className="flex flex-col items-center gap-1 h-full justify-end"
                      >
                        <div
                          className="w-full bg-[hsl(var(--chart-1))] rounded-t transition-all flex-shrink-0"
                          style={{
                            height: `${Math.max(pct, 2)}%`,
                            minHeight: g.count > 0 ? "8px" : "2px",
                          }}
                          title={`Grade ${g.grade}: ${g.count} students`}
                        />
                        <span className="text-xs font-medium">
                          Gr.{g.grade}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {g.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm py-8 text-center">
                No enrollment data for this school year
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
