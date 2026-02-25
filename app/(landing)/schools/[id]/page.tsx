"use client";

import { getGradeLevelLabel } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase/client";
import {
  BookOpen,
  Building2,
  GraduationCap,
  School,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface EnrollmentStats {
  male: number;
  female: number;
  total: number;
  elementary: { male: number; female: number; total: number };
  juniorHigh: { male: number; female: number; total: number };
  seniorHigh: { male: number; female: number; total: number };
  byGradeLevel: { grade: number; count: number }[];
}

interface SchoolInfo {
  id: string;
  school_id: string;
  name: string;
  school_type: string | null;
  address: string | null;
  district: string | null;
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
    <div className="rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 p-6 h-44">
      <Skeleton className="h-4 w-24 bg-white/20" />
      <Skeleton className="h-3 w-16 mt-3 bg-white/20" />
      <div className="space-y-2 mt-4">
        <Skeleton className="h-4 w-full bg-white/20" />
        <Skeleton className="h-4 w-3/4 bg-white/20" />
        <Skeleton className="h-6 w-12 mt-3 bg-white/20" />
      </div>
    </div>
  );
}

export default function SchoolDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [schoolYear, setSchoolYear] = useState(getDefaultSchoolYear);
  const [stats, setStats] = useState<EnrollmentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchSchool = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase
      .from("sms_schools")
      .select("id, school_id, name, school_type, address, district")
      .eq("id", id)
      .eq("is_active", true)
      .single();

    if (error || !data) {
      setSchool(null);
      setNotFound(true);
      return;
    }
    setSchool(data as SchoolInfo);
  }, [id]);

  const fetchStats = useCallback(async () => {
    if (!id) return;
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
        .eq("school_id", id)
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
  }, [id, schoolYear]);

  useEffect(() => {
    fetchSchool();
  }, [fetchSchool]);

  useEffect(() => {
    if (school) {
      fetchStats();
    } else if (!id) {
      setLoading(false);
    }
  }, [school, fetchStats, id]);

  const statCards = [
    {
      key: "total",
      icon: Users,
      label: "Total Enrollment",
      sub: "All grade levels",
      color: "from-blue-500/10 to-indigo-500/10",
      accent: "text-blue-300",
      data: stats
        ? { male: stats.male, female: stats.female, total: stats.total }
        : null,
    },
    {
      key: "elementary",
      icon: BookOpen,
      label: "Elementary",
      sub: "Grades 1–6",
      color: "from-amber-500/10 to-orange-500/10",
      accent: "text-amber-300",
      data: stats ? stats.elementary : null,
    },
    {
      key: "juniorHigh",
      icon: School,
      label: "Junior High",
      sub: "Grades 7–10",
      color: "from-emerald-500/10 to-teal-500/10",
      accent: "text-emerald-300",
      data: stats ? stats.juniorHigh : null,
    },
    {
      key: "seniorHigh",
      icon: GraduationCap,
      label: "Senior High",
      sub: "Grades 11–12",
      color: "from-violet-500/10 to-purple-500/10",
      accent: "text-violet-300",
      data: stats ? stats.seniorHigh : null,
    },
  ];

  if (!id || notFound) {
    return (
      <div className="relative max-w-7xl mx-auto px-6 sm:px-8 lg:px-8 py-16 sm:py-20">
        <Link
          href="/schools"
          className="text-sm font-medium text-white/80 hover:text-white transition-colors"
        >
          ← Back to Schools
        </Link>
        <div className="mt-12 rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 p-12 text-center">
          <p className="text-white/80 text-lg">School not found.</p>
        </div>
      </div>
    );
  }

  if (!school) {
    return (
      <div className="relative max-w-7xl mx-auto px-6 sm:px-8 lg:px-8 py-16 sm:py-20">
        <Link
          href="/schools"
          className="text-sm font-medium text-white/80 hover:text-white transition-colors"
        >
          ← Back to Schools
        </Link>
        <div className="mt-12 flex justify-center py-20">
          <Skeleton className="h-12 w-64 rounded-xl bg-white/20" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="relative max-w-6xl mx-auto px-6 sm:px-8 lg:px-12 pt-16 sm:pt-20 pb-24">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/schools"
            className="text-sm font-medium text-white/80 hover:text-white transition-colors"
          >
            ← Back to Schools
          </Link>
          <select
            value={schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            className="text-sm font-medium text-white bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 outline-none focus:ring-2 focus:ring-white/30 cursor-pointer [&>option]:bg-stone-900 [&>option]:text-white"
          >
            {getSchoolYearOptions().map((sy) => (
              <option key={sy} value={sy}>
                SY {sy}
              </option>
            ))}
          </select>
        </div>

        {/* Hero - School info */}
        <header className="mb-12">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20">
              <Building2 className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-semibold text-white tracking-tight">
                {school.name}
              </h1>
              <p className="mt-1 text-lg text-white/80">
                School ID {school.school_id}
                {school.district ? ` · ${school.district}` : ""}
              </p>
              {school.address && (
                <p className="mt-0.5 text-sm text-white/60">{school.address}</p>
              )}
            </div>
          </div>
        </header>

        {/* Stat cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-16">
          {loading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : (
            statCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.key}
                  className={`rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 p-6 transition-all duration-300 hover:bg-white/15 hover:border-white/30 hover:shadow-xl hover:shadow-black/20 bg-gradient-to-br ${card.color}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`h-5 w-5 ${card.accent}`} />
                    <span className="text-sm font-semibold text-white">
                      {card.label}
                    </span>
                  </div>
                  <p className="text-xs text-white/60 mb-4">
                    {card.sub}
                  </p>
                  {card.data ? (
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-white/60">Male</span>
                        <span className="font-medium text-white">
                          {card.data.male}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/60">Female</span>
                        <span className="font-medium text-white">
                          {card.data.female}
                        </span>
                      </div>
                      <div className="flex justify-between pt-2 mt-2 border-t border-white/20">
                        <span className="font-medium text-white/80">
                          Total
                        </span>
                        <span className="text-lg font-semibold text-white">
                          {card.data.total}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-white/60 text-sm">
                      No data
                    </p>
                  )}
                </div>
              );
            })
          )}
        </section>

        {/* Chart */}
        <section>
          <div className="rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 p-6 sm:p-8 transition-all duration-300 hover:bg-white/15 hover:border-white/30">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white">
                Enrollment by grade
              </h2>
              <p className="text-sm text-white/60 mt-1">
                School year {schoolYear}
              </p>
            </div>
            {loading ? (
              <div className="grid grid-cols-12 gap-2 items-end h-48">
                {[70, 55, 80, 45, 90, 65, 75, 50, 85, 60, 70, 55].map(
                  (pct, i) => (
                    <div
                      key={i}
                      className="flex flex-col items-center gap-2 h-full justify-end"
                    >
                      <Skeleton
                        className="w-full rounded-t-md min-h-[16px] bg-white/20"
                        style={{ height: `${pct}%` }}
                      />
                      <Skeleton className="h-3 w-8 bg-white/20" />
                    </div>
                  ),
                )}
              </div>
            ) : stats && stats.byGradeLevel.some((g) => g.count > 0) ? (
              <div className="grid gap-2 items-end h-48 [grid-template-columns:repeat(13,minmax(0,1fr))]">
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
                        className="w-full rounded-t-lg bg-gradient-to-t from-white/50 to-white/80 transition-all duration-300 hover:from-white/60 hover:to-white min-h-[4px]"
                        style={{ height: `${Math.max(pct, 4)}%` }}
                        title={`${getGradeLevelLabel(g.grade)}: ${g.count} students`}
                      />
                      <span className="text-xs font-medium text-white/60">
                        {g.grade === 0 ? "K" : `${g.grade}`}
                      </span>
                      <span className="text-xs font-semibold text-white">
                        {g.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center py-12 text-white/60 text-sm rounded-2xl bg-white/5">
                No enrollment data for this school year
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
