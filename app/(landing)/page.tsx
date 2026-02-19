"use client";

import { getGradeLevelLabel } from "@/lib/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase/client";
import {
  BookOpen,
  GraduationCap,
  School,
  Users,
} from "lucide-react";
import Link from "next/link";
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

function StatCardSkeleton() {
  return (
    <Card className="overflow-hidden border-0 shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-16 mt-2" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-6 w-12" />
      </CardContent>
    </Card>
  );
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
      const byGrade = Array.from({ length: 13 }, (_, i) => ({
        grade: i,
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

        if (gl >= 0 && gl <= 6) {
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

        if (gl >= 0 && gl <= 12) {
          byGrade[gl]!.count++;
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Hero Section */}
      <section className="mb-12">
        <div className=" rounded-3xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-8 sm:p-12 shadow-2xl shadow-blue-500/25 dark:shadow-blue-900/30">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="text-white">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Welcome to Bayugan City
              </h1>
              <p className="mt-3 text-lg text-blue-100 max-w-xl">
                Explore enrollment statistics and public school information for
                the Schools Division of Bayugan City.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/schools"
                  className="inline-flex items-center gap-2 rounded-xl bg-white/20 backdrop-blur-sm px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/30"
                >
                  <School className="h-4 w-4" />
                  View Schools
                </Link>
                <Link
                  href="/learners"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                >
                  <GraduationCap className="h-4 w-4" />
                  View Learners
                </Link>
              </div>
            </div>
            <div className="flex items-center justify-end">
              <select
                value={schoolYear}
                onChange={(e) => setSchoolYear(e.target.value)}
                className="rounded-xl border-0 bg-white/20 backdrop-blur-sm px-4 py-3 text-sm font-semibold text-white outline-none transition hover:bg-white/30 focus:ring-2 focus:ring-white/50 [&>option]:bg-slate-800 [&>option]:text-white"
              >
                {getSchoolYearOptions().map((sy) => (
                  <option key={sy} value={sy}>
                    {sy}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Enrollment Stat Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <Card className="overflow-hidden border-0 shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 bg-white dark:bg-slate-900/50">
              <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-indigo-500" />
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <CardTitle className="text-sm font-semibold">
                    Total Enrollment
                  </CardTitle>
                </div>
                <CardDescription>All grade levels</CardDescription>
              </CardHeader>
              <CardContent>
                {stats ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Male</span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        {stats.male}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Female</span>
                      <span className="font-semibold text-pink-600 dark:text-pink-400">
                        {stats.female}
                      </span>
                    </div>
                    <div className="mt-3 pt-3 border-t flex justify-between">
                      <span className="font-medium">Total</span>
                      <span className="text-lg font-bold text-slate-900 dark:text-white">
                        {stats.total}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No data</p>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-0 shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 bg-white dark:bg-slate-900/50">
              <div className="h-1 w-full bg-gradient-to-r from-amber-500 to-orange-500" />
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <CardTitle className="text-sm font-semibold">
                    Elementary
                  </CardTitle>
                </div>
                <CardDescription>Grades 1-6</CardDescription>
              </CardHeader>
              <CardContent>
                {stats ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Male</span>
                      <span className="font-semibold">{stats.elementary.male}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Female</span>
                      <span className="font-semibold">{stats.elementary.female}</span>
                    </div>
                    <div className="mt-3 pt-3 border-t flex justify-between">
                      <span className="font-medium">Total</span>
                      <span className="text-lg font-bold">{stats.elementary.total}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No data</p>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-0 shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 bg-white dark:bg-slate-900/50">
              <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-teal-500" />
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <School className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <CardTitle className="text-sm font-semibold">
                    Junior High
                  </CardTitle>
                </div>
                <CardDescription>Grades 7-10</CardDescription>
              </CardHeader>
              <CardContent>
                {stats ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Male</span>
                      <span className="font-semibold">{stats.juniorHigh.male}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Female</span>
                      <span className="font-semibold">{stats.juniorHigh.female}</span>
                    </div>
                    <div className="mt-3 pt-3 border-t flex justify-between">
                      <span className="font-medium">Total</span>
                      <span className="text-lg font-bold">{stats.juniorHigh.total}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No data</p>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-0 shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 bg-white dark:bg-slate-900/50">
              <div className="h-1 w-full bg-gradient-to-r from-violet-500 to-purple-500" />
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                  <CardTitle className="text-sm font-semibold">
                    Senior High
                  </CardTitle>
                </div>
                <CardDescription>Grades 11-12</CardDescription>
              </CardHeader>
              <CardContent>
                {stats ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Male</span>
                      <span className="font-semibold">{stats.seniorHigh.male}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Female</span>
                      <span className="font-semibold">{stats.seniorHigh.female}</span>
                    </div>
                    <div className="mt-3 pt-3 border-t flex justify-between">
                      <span className="font-medium">Total</span>
                      <span className="text-lg font-bold">{stats.seniorHigh.total}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No data</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </section>

      {/* Bar Chart */}
      <section>
        <Card className="overflow-hidden border-0 shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 bg-white dark:bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-lg">Enrollment per Grade Level</CardTitle>
            <CardDescription>
              Total enrollment by grade for school year {schoolYear}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4 py-8">
                <div className="grid grid-cols-12 gap-2 items-end h-52">
                  {[70, 55, 80, 45, 90, 65, 75, 50, 85, 60, 70, 55].map(
                    (pct, i) => (
                      <div key={i} className="flex flex-col items-center gap-2 h-full justify-end">
                        <Skeleton
                          className="w-full rounded-t-md min-h-[16px]"
                          style={{ height: `${pct}%` }}
                        />
                        <Skeleton className="h-4 w-8" />
                        <Skeleton className="h-4 w-6" />
                      </div>
                    ),
                  )}
                </div>
              </div>
            ) : stats && stats.byGradeLevel.some((g) => g.count > 0) ? (
              <div className="space-y-3">
                <div className="grid gap-2 items-end h-52" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
                  {stats.byGradeLevel.map((g) => {
                    const max = Math.max(
                      ...stats.byGradeLevel.map((x) => x.count),
                      1,
                    );
                    const pct = (g.count / max) * 100;
                    return (
                      <div
                        key={g.grade}
                        className="flex flex-col items-center gap-2 h-full justify-end group"
                      >
                        <div
                          className="w-full rounded-t-md bg-gradient-to-t from-blue-600 to-blue-400 transition-all duration-300 hover:from-blue-500 hover:to-blue-300 min-h-[4px]"
                          style={{
                            height: `${Math.max(pct, 4)}%`,
                          }}
                          title={`${getGradeLevelLabel(g.grade)}: ${g.count} students`}
                        />
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          {g.grade === 0 ? "K" : `Gr.${g.grade}`}
                        </span>
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">
                          {g.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm py-12 text-center rounded-xl bg-slate-50 dark:bg-slate-800/30">
                No enrollment data for this school year
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
