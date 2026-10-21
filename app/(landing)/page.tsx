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
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";

interface EnrollmentStats {
  male: number;
  female: number;
  total: number;
  elementary: { male: number; female: number; total: number };
  juniorHigh: { male: number; female: number; total: number };
  seniorHigh: { male: number; female: number; total: number };
  byGradeLevel: { grade: number; count: number }[];
}

/**
 * The school year both this page and the staff dashboards report against.
 *
 * There were three private copies of this, each rolling over in July while
 * `getCurrentSchoolYear` — which every protected page uses — rolls over in
 * June. Through the whole of June the landing pages therefore named a
 * different school year from /home, and the same learners were counted
 * against different years on the two screens. One definition now.
 */
const getDefaultSchoolYear = getCurrentSchoolYear;

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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6">
      <Skeleton className="h-10 w-10 rounded-xl bg-slate-100" />
      <Skeleton className="mt-4 h-4 w-24 bg-slate-100" />
      <Skeleton className="mt-3 h-8 w-20 bg-slate-100" />
      <Skeleton className="mt-3 h-3 w-28 bg-slate-50" />
    </div>
  );
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (value === 0 || reduceMotion) {
      setDisplay(value);
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
      iconBg: "bg-sky-100",
      iconColor: "text-sky-700",
      data: stats
        ? { male: stats.male, female: stats.female, total: stats.total }
        : null,
    },
    {
      key: "elementary",
      icon: BookOpen,
      label: "Elementary",
      sub: "SNED / Kinder – Grade 6",
      iconBg: "bg-amber-100",
      iconColor: "text-amber-800",
      data: stats ? stats.elementary : null,
    },
    {
      key: "juniorHigh",
      icon: School,
      label: "Junior High",
      sub: "Grades 7 – 10",
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-700",
      data: stats ? stats.juniorHigh : null,
    },
    {
      key: "seniorHigh",
      icon: GraduationCap,
      label: "Senior High",
      sub: "Grades 11 – 12",
      iconBg: "bg-violet-100",
      iconColor: "text-violet-700",
      data: stats ? stats.seniorHigh : null,
    },
  ];

  const quickLinks = [
    {
      href: "/schools",
      icon: School,
      title: "Public Schools",
      desc: "View all schools in the division",
      iconBg: "bg-sky-100",
      iconColor: "text-sky-700",
    },
    {
      href: "/learners",
      icon: GraduationCap,
      title: "Learners",
      desc: "Enrollment data by school",
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-700",
    },
    {
      href: "/requests",
      icon: FileText,
      title: "Document Requests",
      desc: "Request school records online",
      iconBg: "bg-amber-100",
      iconColor: "text-amber-800",
    },
    {
      href: "/student-portal",
      icon: UserCircle,
      title: "Student Portal",
      desc: "Access your grades and info",
      iconBg: "bg-violet-100",
      iconColor: "text-violet-700",
    },
  ];

  const bandBar = (grade: number) => {
    if (grade <= 6) return "bg-amber-500";
    if (grade <= 10) return "bg-emerald-500";
    return "bg-violet-500";
  };

  const gradeAxisLabel = (grade: number) => {
    if (grade === -1) return "S";
    if (grade === 0) return "K";
    return String(grade);
  };

  const maxGrade = stats
    ? Math.max(...stats.byGradeLevel.map((x) => x.count), 1)
    : 1;
  const hasGradeData = !!stats && stats.byGradeLevel.some((g) => g.count > 0);

  const legend = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
      {[
        { cls: "bg-amber-500", label: "Elementary" },
        { cls: "bg-emerald-500", label: "Junior High" },
        { cls: "bg-violet-500", label: "Senior High" },
      ].map((l) => (
        <span key={l.label} className="inline-flex items-center gap-1.5">
          <span className={`size-2.5 rounded-sm ${l.cls}`} aria-hidden="true" />
          {l.label}
        </span>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero — the fixed nav (h-16) sits on top of it */}
      <section className="relative isolate overflow-hidden pt-16">
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: "url(/home.jpg)" }}
          />
          <div className="absolute inset-0 bg-slate-900/80" />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-900/60 to-transparent" />
        </div>

        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
          <div className="max-w-3xl animate-fade-up">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90">
              <span className="size-2 rounded-full bg-emerald-400" aria-hidden="true" />
              Department of Education · Schools Division of Bayugan City
            </p>

            <h1 className="text-balance text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Empowering quality education
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">
              Enrollment statistics, school information, and public services for
              the Schools Division of Bayugan City.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/schools"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              >
                Explore schools
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                href="/requests"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 text-sm font-semibold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              >
                <FileText className="size-4" aria-hidden="true" />
                Request a record
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Enrollment overview */}
      <section
        aria-labelledby="overview-heading"
        className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8"
      >
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-xs">
              <TrendingUp className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="overview-heading"
                className="text-xl font-bold text-slate-900"
              >
                Enrollment overview
              </h2>
              <p className="text-sm text-slate-600">
                Division-wide learners currently enrolled
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="landing-sy"
              className="text-xs font-medium text-slate-600"
            >
              School year
            </label>
            <select
              id="landing-sy"
              value={schoolYear}
              onChange={(e) => setSchoolYear(e.target.value)}
              className="h-11 w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-xs outline-none transition-colors focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500/30 sm:w-48"
            >
              {getSchoolYearOptions().map((sy) => (
                <option key={sy} value={sy}>
                  SY {sy}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
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
                  className="animate-scale-in rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6"
                  style={{ animationDelay: `${0.1 + i * 0.06}s` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-900">
                        {card.label}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-600">{card.sub}</p>
                    </div>
                    <span
                      className={`hidden size-10 shrink-0 items-center justify-center rounded-xl sm:flex ${card.iconBg}`}
                    >
                      <Icon className={`size-5 ${card.iconColor}`} aria-hidden="true" />
                    </span>
                  </div>

                  {card.data ? (
                    <>
                      <div className="mt-3 text-2xl font-bold tabular-nums text-slate-900 sm:mt-4 sm:text-3xl">
                        <AnimatedNumber value={card.data.total} />
                      </div>
                      <dl className="mt-2 flex flex-col gap-1 text-xs sm:flex-row sm:gap-4">
                        <div className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full bg-sky-500" aria-hidden="true" />
                          <dt className="text-slate-600">Male</dt>
                          <dd className="font-semibold tabular-nums text-slate-800">
                            {card.data.male.toLocaleString()}
                          </dd>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full bg-rose-500" aria-hidden="true" />
                          <dt className="text-slate-600">Female</dt>
                          <dd className="font-semibold tabular-nums text-slate-800">
                            {card.data.female.toLocaleString()}
                          </dd>
                        </div>
                      </dl>
                    </>
                  ) : (
                    <p className="mt-4 text-sm text-slate-600">No data</p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Enrollment by grade level */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:mt-8 sm:p-8">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Enrollment by grade level
              </h2>
              <p className="mt-1 text-sm text-slate-600">SY {schoolYear}</p>
            </div>
            {legend}
          </div>

          {loading ? (
            <div className="flex h-56 items-end gap-2">
              {[70, 55, 80, 45, 90, 65, 75, 50, 85, 60, 70, 55].map((pct, i) => (
                <Skeleton
                  key={i}
                  className="flex-1 rounded-md bg-slate-100"
                  style={{ height: `${pct}%` }}
                />
              ))}
            </div>
          ) : hasGradeData && stats ? (
            <>
              {/* Phones: one labelled row per grade, count always visible */}
              <ul className="space-y-2 sm:hidden">
                {stats.byGradeLevel.map((g) => (
                  <li
                    key={g.grade}
                    className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-3 text-sm"
                  >
                    <span className="truncate text-slate-700">
                      {getGradeLevelLabel(g.grade)}
                    </span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                      <span
                        className={`block h-full rounded-full ${bandBar(g.grade)}`}
                        style={{ width: `${(g.count / maxGrade) * 100}%` }}
                      />
                    </span>
                    <span className="text-right font-semibold tabular-nums text-slate-900">
                      {g.count.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Larger screens: column chart with the count above each bar */}
              <div
                className="hidden h-64 items-end gap-2 sm:grid sm:[grid-template-columns:repeat(14,minmax(0,1fr))] lg:gap-3"
                role="img"
                aria-label={`Enrollment by grade level, SY ${schoolYear}: ${stats.byGradeLevel
                  .map((g) => `${getGradeLevelLabel(g.grade)} ${g.count}`)
                  .join("; ")}`}
              >
                {stats.byGradeLevel.map((g, i) => {
                  const pct = (g.count / maxGrade) * 100;
                  return (
                    <div
                      key={g.grade}
                      className="flex h-full flex-col items-center justify-end gap-1.5"
                    >
                      <span className="text-xs font-semibold tabular-nums text-slate-700">
                        {g.count.toLocaleString()}
                      </span>
                      {/* The bar's percentage is of this track alone, so the
                          labels above and below cannot squash tall bars. */}
                      <div className="flex w-full flex-1 items-end">
                        <div
                          className={`animate-bar-grow min-h-[4px] w-full rounded-md ${bandBar(g.grade)}`}
                          style={{
                            height: `${Math.max(pct, 3)}%`,
                            animationDelay: `${0.2 + i * 0.04}s`,
                          }}
                          title={`${getGradeLevelLabel(g.grade)}: ${g.count} learners`}
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-600">
                        {gradeAxisLabel(g.grade)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="rounded-xl bg-slate-50 py-14 text-center text-sm text-slate-600">
              No enrollment data for SY {schoolYear}
            </p>
          )}
        </div>
      </section>

      {/* Quick access */}
      <section
        aria-labelledby="quick-heading"
        className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 sm:pb-16 lg:px-8"
      >
        <h2 id="quick-heading" className="mb-4 text-xl font-bold text-slate-900 sm:mb-6">
          Quick access
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition-colors hover:border-emerald-300 hover:bg-emerald-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:flex-col sm:items-start sm:p-6"
              >
                <span
                  className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${link.iconBg}`}
                >
                  <Icon className={`size-5 ${link.iconColor}`} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {link.title}
                    <ArrowRight
                      className="hidden size-3.5 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-600 motion-reduce:transition-none sm:block"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="mt-0.5 block text-sm text-slate-600">
                    {link.desc}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-slate-400 sm:hidden" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6 lg:px-8">
          <p className="text-center text-sm text-slate-600 sm:text-left">
            Department of Education &mdash; Schools Division of Bayugan City
          </p>
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-2 gap-y-1">
            {[
              { href: "/schools", label: "Schools" },
              { href: "/learners", label: "Learners" },
              { href: "/requests", label: "Requests" },
              { href: "/login", label: "Sign in" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="inline-flex min-h-10 items-center rounded-md px-3 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
