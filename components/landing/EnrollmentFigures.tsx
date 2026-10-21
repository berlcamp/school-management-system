"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { getGradeLevelLabel } from "@/lib/constants";
import { BookOpen, GraduationCap, School, Users, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Public enrollment figures shared by the landing page and each school's page:
 * the four total cards and the by-grade-level chart. Phones get a labelled list
 * with every count visible (no hover); wider screens get a column chart.
 */

interface SexSplit {
  male: number;
  female: number;
  total: number;
}

export interface EnrollmentStats extends SexSplit {
  elementary: SexSplit;
  juniorHigh: SexSplit;
  seniorHigh: SexSplit;
  byGradeLevel: { grade: number; count: number }[];
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
    let step = 0;
    const timer = setInterval(() => {
      step++;
      setDisplay(Math.min(Math.round(increment * step), value));
      if (step >= steps) clearInterval(timer);
    }, duration / steps);
    return () => clearInterval(timer);
  }, [value]);

  return <>{display.toLocaleString()}</>;
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

const CARDS: {
  key: "total" | "elementary" | "juniorHigh" | "seniorHigh";
  icon: LucideIcon;
  label: string;
  sub: string;
  chip: string;
}[] = [
  { key: "total", icon: Users, label: "Total Enrollment", sub: "All grade levels", chip: "bg-sky-100 text-sky-700" },
  { key: "elementary", icon: BookOpen, label: "Elementary", sub: "SNED / Kinder – Grade 6", chip: "bg-amber-100 text-amber-800" },
  { key: "juniorHigh", icon: School, label: "Junior High", sub: "Grades 7 – 10", chip: "bg-emerald-100 text-emerald-700" },
  { key: "seniorHigh", icon: GraduationCap, label: "Senior High", sub: "Grades 11 – 12", chip: "bg-violet-100 text-violet-700" },
];

export function EnrollmentStatCards({
  stats,
  loading,
  hideEmpty = false,
}: {
  stats: EnrollmentStats | null;
  loading: boolean;
  /** Drop a level band with no learners (a school's own page). */
  hideEmpty?: boolean;
}) {
  const cards = CARDS.filter(
    (c) => !hideEmpty || c.key === "total" || !stats || stats[c.key].total > 0,
  );
  return (
    <div
      className={`grid grid-cols-2 gap-3 sm:gap-4 ${
        cards.length === 4 ? "lg:grid-cols-4" : cards.length === 3 ? "lg:grid-cols-3" : ""
      }`}
    >
      {loading
        ? CARDS.map((c) => <StatCardSkeleton key={c.key} />)
        : cards.map((card, i) => {
            const Icon = card.icon;
            const data: SexSplit | null = stats
              ? card.key === "total"
                ? { male: stats.male, female: stats.female, total: stats.total }
                : stats[card.key]
              : null;
            return (
              <div
                key={card.key}
                className="animate-scale-in rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6"
                style={{ animationDelay: `${0.1 + i * 0.06}s` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900">{card.label}</h3>
                    <p className="mt-0.5 text-xs text-slate-600">{card.sub}</p>
                  </div>
                  <span
                    className={`hidden size-10 shrink-0 items-center justify-center rounded-xl sm:flex ${card.chip}`}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                </div>
                {data ? (
                  <>
                    <div className="mt-3 text-2xl font-bold tabular-nums text-slate-900 sm:mt-4 sm:text-3xl">
                      <AnimatedNumber value={data.total} />
                    </div>
                    <dl className="mt-2 flex flex-col gap-1 text-xs sm:flex-row sm:gap-4">
                      <div className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-sky-500" aria-hidden="true" />
                        <dt className="text-slate-600">Male</dt>
                        <dd className="font-semibold tabular-nums text-slate-800">
                          {data.male.toLocaleString()}
                        </dd>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-rose-500" aria-hidden="true" />
                        <dt className="text-slate-600">Female</dt>
                        <dd className="font-semibold tabular-nums text-slate-800">
                          {data.female.toLocaleString()}
                        </dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <p className="mt-4 text-sm text-slate-600">No data</p>
                )}
              </div>
            );
          })}
    </div>
  );
}

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

export function GradeLevelChart({
  stats,
  loading,
  schoolYear,
  description,
  hideEmpty = false,
}: {
  stats: EnrollmentStats | null;
  loading: boolean;
  schoolYear: string;
  description?: string;
  /** Show only the grade levels that have learners (a school's own page). */
  hideEmpty?: boolean;
}) {
  const max = stats ? Math.max(...stats.byGradeLevel.map((x) => x.count), 1) : 1;
  const hasData = !!stats && stats.byGradeLevel.some((g) => g.count > 0);
  const grades = stats
    ? hideEmpty
      ? stats.byGradeLevel.filter((g) => g.count > 0)
      : stats.byGradeLevel
    : [];
  const bands = new Set<string>(
    grades.map((g) => (g.grade <= 6 ? "e" : g.grade <= 10 ? "j" : "s")),
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Enrollment by grade level</h2>
          <p className="mt-1 text-sm text-slate-600">
            {description ?? `SY ${schoolYear}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
          {[
            { band: "e", cls: "bg-amber-500", label: "Elementary" },
            { band: "j", cls: "bg-emerald-500", label: "Junior High" },
            { band: "s", cls: "bg-violet-500", label: "Senior High" },
          ]
            .filter((l) => !hideEmpty || !hasData || bands.has(l.band))
            .map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5">
              <span className={`size-2.5 rounded-sm ${l.cls}`} aria-hidden="true" />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-56 items-end gap-2">
          {[70, 55, 80, 45, 90, 65, 75, 50, 85, 60, 70, 55].map((pct, i) => (
            <Skeleton key={i} className="flex-1 rounded-md bg-slate-100" style={{ height: `${pct}%` }} />
          ))}
        </div>
      ) : hasData && stats ? (
        <>
          {/* Phones: one labelled row per grade, count always visible */}
          <ul className="space-y-2 sm:hidden">
            {grades.map((g) => (
              <li key={g.grade} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-3 text-sm">
                <span className="truncate text-slate-700">{getGradeLevelLabel(g.grade)}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                  <span
                    className={`block h-full rounded-full ${bandBar(g.grade)}`}
                    style={{ width: `${(g.count / max) * 100}%` }}
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
            className="hidden h-64 items-end gap-2 sm:grid lg:gap-3"
            style={{
              gridTemplateColumns: `repeat(${grades.length}, minmax(0, 1fr))`,
            }}
            role="img"
            aria-label={`Enrollment by grade level, SY ${schoolYear}: ${grades
              .map((g) => `${getGradeLevelLabel(g.grade)} ${g.count}`)
              .join("; ")}`}
          >
            {grades.map((g, i) => (
              <div key={g.grade} className="flex h-full flex-col items-center justify-end gap-1.5">
                <span className="text-xs font-semibold tabular-nums text-slate-700">
                  {g.count.toLocaleString()}
                </span>
                {/* The bar's percentage is of this track alone, so the labels
                    above and below cannot squash tall bars. */}
                <div className="flex w-full flex-1 items-end justify-center">
                  <div
                    className={`animate-bar-grow min-h-[4px] w-full max-w-20 rounded-md ${bandBar(g.grade)}`}
                    style={{
                      height: `${Math.max((g.count / max) * 100, 3)}%`,
                      animationDelay: `${0.2 + i * 0.04}s`,
                    }}
                    title={`${getGradeLevelLabel(g.grade)}: ${g.count} learners`}
                  />
                </div>
                <span className="text-xs font-medium text-slate-600">{gradeAxisLabel(g.grade)}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="rounded-xl bg-slate-50 py-14 text-center text-sm text-slate-600">
          No enrollment data for SY {schoolYear}
        </p>
      )}
    </div>
  );
}
