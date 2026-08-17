"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { getGradeLevelLabel } from "@/lib/constants";
import {
  fetchPublicEnrollmentCounts,
  gradeBand,
  PUBLIC_GRADE_LEVELS,
} from "@/lib/utils/publicEnrollment";
import {
  ArrowRight,
  BookOpen,
  FileText,
  GraduationCap,
  School,
  TrendingUp,
  UserCircle,
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
    <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-6 h-48">
      <Skeleton className="h-10 w-10 rounded-xl bg-gray-100" />
      <Skeleton className="h-4 w-24 mt-4 bg-gray-100" />
      <Skeleton className="h-3 w-16 mt-2 bg-gray-50" />
      <div className="flex gap-4 mt-5">
        <Skeleton className="h-8 w-16 bg-gray-50" />
        <Skeleton className="h-8 w-16 bg-gray-50" />
      </div>
    </div>
  );
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) {
      setDisplay(0);
      return;
    }
    const duration = 800;
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      current = Math.min(Math.round(increment * step), value);
      setDisplay(current);
      if (step >= steps) clearInterval(timer);
    }, duration / steps);
    return () => clearInterval(timer);
  }, [value]);

  return <>{display.toLocaleString()}</>;
}

export default function LandingHomePage() {
  const [schoolYear, setSchoolYear] = useState(getDefaultSchoolYear);
  const [stats, setStats] = useState<EnrollmentStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const counts = await fetchPublicEnrollmentCounts(schoolYear);

      let male = 0;
      let female = 0;
      const elem = { male: 0, female: 0, total: 0 };
      const jhs = { male: 0, female: 0, total: 0 };
      const shs = { male: 0, female: 0, total: 0 };
      const byGrade = PUBLIC_GRADE_LEVELS.map((grade) => ({ grade, count: 0 }));
      const byGradeIndex = new Map(byGrade.map((g) => [g.grade, g]));

      for (const c of counts) {
        const learners = c.male + c.female;

        male += c.male;
        female += c.female;

        // Elementary here is labelled "SNED / Kinder – Grade 6", so it takes
        // both the kinder and elementary bands.
        const band = gradeBand(c.grade_level);
        const bucket =
          band === "kinder" || band === "elementary"
            ? elem
            : band === "juniorHigh"
              ? jhs
              : band === "seniorHigh"
                ? shs
                : null;

        if (bucket) {
          bucket.male += c.male;
          bucket.female += c.female;
          bucket.total += learners;
        }

        const gradeEntry = byGradeIndex.get(c.grade_level);
        if (gradeEntry) gradeEntry.count += learners;
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

  const statCards = [
    {
      key: "total",
      icon: Users,
      label: "Total Enrollment",
      sub: "All grade levels",
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      data: stats
        ? { male: stats.male, female: stats.female, total: stats.total }
        : null,
    },
    {
      key: "elementary",
      icon: BookOpen,
      label: "Elementary",
      sub: "SNED / Kinder – Grade 6",
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
      data: stats ? stats.elementary : null,
    },
    {
      key: "juniorHigh",
      icon: School,
      label: "Junior High",
      sub: "Grades 7 – 10",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      data: stats ? stats.juniorHigh : null,
    },
    {
      key: "seniorHigh",
      icon: GraduationCap,
      label: "Senior High",
      sub: "Grades 11 – 12",
      iconBg: "bg-violet-50",
      iconColor: "text-violet-600",
      data: stats ? stats.seniorHigh : null,
    },
  ];

  const quickLinks = [
    {
      href: "/schools",
      icon: School,
      title: "Public Schools",
      desc: "View all schools in the division",
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      href: "/learners",
      icon: GraduationCap,
      title: "Learners",
      desc: "Enrollment data by school",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
    },
    {
      href: "/requests",
      icon: FileText,
      title: "Document Requests",
      desc: "Request school records online",
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
    },
    {
      href: "/student-portal",
      icon: UserCircle,
      title: "Student Portal",
      desc: "Access your grades and info",
      iconBg: "bg-violet-50",
      iconColor: "text-violet-600",
    },
  ];

  const gradeBarColor = (grade: number) => {
    if (grade <= 6) return "from-amber-400 to-orange-400";
    if (grade <= 10) return "from-emerald-400 to-teal-400";
    return "from-violet-400 to-purple-400";
  };

  const gradeAxisLabel = (grade: number) => {
    if (grade === -1) return "S";
    if (grade === 0) return "K";
    return String(grade);
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Hero Section — dark background image spanning header + hero */}
      <div className="relative pt-28 sm:pt-32 pb-20 sm:pb-28">
        {/* Background image + overlay */}
        <div className="absolute inset-0" aria-hidden>
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
            style={{ backgroundImage: "url(/home.jpg)" }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/80 via-slate-900/70 to-slate-900/90" />
        </div>
        {/* Fade-to-white at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-slate-50 to-transparent z-[1]" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl animate-fade-up">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 backdrop-blur-sm mb-6">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-medium text-white/80">
                Schools Division of Bayugan City
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight text-white leading-[1.1]">
              Empowering
              <span className="block text-white/90">Quality Education</span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-white/70 max-w-xl leading-relaxed">
              Enrollment statistics, school information, and public services for
              the Schools Division of Bayugan City.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/schools"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-slate-900 font-semibold text-sm hover:bg-white/90 transition-all duration-200 shadow-lg shadow-black/10 hover:shadow-black/20 hover:translate-y-[-1px]"
              >
                Explore Schools
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/requests"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 text-white font-semibold text-sm border border-white/20 hover:bg-white/15 hover:border-white/30 transition-all duration-200 backdrop-blur-sm"
              >
                <UserCircle className="h-4 w-4" />
                Requests Record
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Section — white background (overlap hero fade to remove gap) */}
      <div className="bg-slate-50 -mt-24 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Section header with school year selector */}
          <div
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 animate-fade-up"
            style={{ animationDelay: "0.15s" }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-white border border-gray-200 shadow-sm">
                <TrendingUp className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Enrollment Overview
                </h2>
                <p className="text-sm text-gray-500">
                  Division-wide statistics
                </p>
              </div>
            </div>
            <select
              value={schoolYear}
              onChange={(e) => setSchoolYear(e.target.value)}
              className="text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 cursor-pointer transition-all shadow-sm"
            >
              {getSchoolYearOptions().map((sy) => (
                <option key={sy} value={sy}>
                  SY {sy}
                </option>
              ))}
            </select>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {loading ? (
              <>
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
              </>
            ) : (
              statCards.map((card, i) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.key}
                    className="group rounded-2xl bg-white border border-gray-100 shadow-sm p-6 transition-all duration-300 hover:shadow-md hover:translate-y-[-2px] animate-scale-in"
                    style={{ animationDelay: `${0.2 + i * 0.1}s` }}
                  >
                    <div
                      className={`inline-flex p-2.5 rounded-xl ${card.iconBg} mb-4`}
                    >
                      <Icon className={`h-5 w-5 ${card.iconColor}`} />
                    </div>

                    <h3 className="text-sm font-semibold text-gray-900 mb-0.5">
                      {card.label}
                    </h3>
                    <p className="text-xs text-gray-400 mb-4">{card.sub}</p>

                    {card.data ? (
                      <div>
                        <div className="text-3xl font-bold text-gray-900 mb-3 tabular-nums">
                          <AnimatedNumber value={card.data.total} />
                        </div>
                        <div className="flex gap-4 text-xs">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                            <span className="text-gray-500">Male</span>
                            <span className="font-semibold text-gray-700">
                              {card.data.male.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-pink-500" />
                            <span className="text-gray-500">Female</span>
                            <span className="font-semibold text-gray-700">
                              {card.data.female.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-400 text-sm">No data</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Chart Section — white background */}
      <div className="bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <div
            className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6 sm:p-8 animate-fade-up"
            style={{ animationDelay: "0.4s" }}
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Enrollment by Grade Level
                </h2>
                <p className="text-sm text-gray-400 mt-1">SY {schoolYear}</p>
              </div>
              {/* Legend */}
              <div className="hidden sm:flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-gradient-to-r from-amber-400 to-orange-400" />
                  <span className="text-gray-500">Elementary</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-gradient-to-r from-emerald-400 to-teal-400" />
                  <span className="text-gray-500">Junior High</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-gradient-to-r from-violet-400 to-purple-400" />
                  <span className="text-gray-500">Senior High</span>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-12 gap-2 sm:gap-3 items-end h-56">
                {[70, 55, 80, 45, 90, 65, 75, 50, 85, 60, 70, 55].map(
                  (pct, i) => (
                    <div
                      key={i}
                      className="flex flex-col items-center gap-2 h-full justify-end"
                    >
                      <Skeleton
                        className="w-full rounded-lg min-h-[16px] bg-gray-100"
                        style={{ height: `${pct}%` }}
                      />
                      <Skeleton className="h-3 w-6 bg-gray-100" />
                    </div>
                  ),
                )}
              </div>
            ) : stats && stats.byGradeLevel.some((g) => g.count > 0) ? (
              <div className="grid gap-2 sm:gap-3 items-end h-56 sm:h-64 [grid-template-columns:repeat(14,minmax(0,1fr))]">
                {stats.byGradeLevel.map((g, i) => {
                  const max = Math.max(
                    ...stats.byGradeLevel.map((x) => x.count),
                    1,
                  );
                  const pct = (g.count / max) * 100;
                  return (
                    <div
                      key={g.grade}
                      className="flex flex-col items-center gap-1.5 h-full justify-end group"
                    >
                      {/* Count label */}
                      <span className="text-xs font-bold text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        {g.count}
                      </span>
                      {/* Bar */}
                      <div
                        className={`w-full rounded-lg bg-gradient-to-t ${gradeBarColor(g.grade)} transition-all duration-300 group-hover:brightness-110 group-hover:shadow-md min-h-[4px] animate-bar-grow`}
                        style={{
                          height: `${Math.max(pct, 3)}%`,
                          animationDelay: `${0.5 + i * 0.05}s`,
                        }}
                        title={`${getGradeLevelLabel(g.grade)}: ${g.count} students`}
                      />
                      {/* Grade label */}
                      <span className="text-[10px] sm:text-xs font-semibold text-gray-400 group-hover:text-gray-700 transition-colors">
                        {gradeAxisLabel(g.grade)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 text-gray-400 text-sm rounded-xl bg-gray-50">
                No enrollment data for this school year
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Links Section — white background */}
      <div className="bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <h2
            className="text-xl font-bold text-gray-900 mb-6 animate-fade-up"
            style={{ animationDelay: "0.5s" }}
          >
            Quick Access
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickLinks.map((link, i) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group rounded-2xl bg-white border border-gray-100 shadow-sm p-6 transition-all duration-300 hover:shadow-md hover:translate-y-[-2px] animate-fade-up"
                  style={{ animationDelay: `${0.55 + i * 0.08}s` }}
                >
                  <div
                    className={`inline-flex p-2.5 rounded-xl ${link.iconBg} mb-4`}
                  >
                    <Icon className={`h-5 w-5 ${link.iconColor}`} />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                    {link.title}
                    <ArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-1 transition-all duration-200" />
                  </h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {link.desc}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer — light gray */}
      <footer className="bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-gray-400">
              Department of Education &mdash; Schools Division of Bayugan City
            </p>
            <div className="flex items-center gap-6 text-xs text-gray-400">
              <Link
                href="/schools"
                className="hover:text-gray-600 transition-colors"
              >
                Schools
              </Link>
              <Link
                href="/learners"
                className="hover:text-gray-600 transition-colors"
              >
                Learners
              </Link>
              <Link
                href="/requests"
                className="hover:text-gray-600 transition-colors"
              >
                Requests
              </Link>
              <Link
                href="/login"
                className="hover:text-gray-600 transition-colors"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
