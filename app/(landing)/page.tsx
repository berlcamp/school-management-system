"use client";

import {
  EnrollmentStatCards,
  GradeLevelChart,
  type EnrollmentStats,
} from "@/components/landing/EnrollmentFigures";
import {
  fetchPublicEnrollmentCounts,
  gradeBand,
  PUBLIC_GRADE_LEVELS,
} from "@/lib/utils/publicEnrollment";
import {
  ArrowRight,
  FileText,
  GraduationCap,
  School,
  TrendingUp,
  UserCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";

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

        <EnrollmentStatCards stats={stats} loading={loading} />

        <div className="mt-6 sm:mt-8">
          <GradeLevelChart stats={stats} loading={loading} schoolYear={schoolYear} />
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
