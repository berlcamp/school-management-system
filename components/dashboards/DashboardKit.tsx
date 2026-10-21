"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ArrowRight, Inbox, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared building blocks for every dashboard (home, teacher, division, student
 * portal), so the four read as one product: flat bordered surfaces, one tint
 * per figure, tabular numerals, 12px minimum text, no hover zoom.
 */

export type Tone =
  | "emerald"
  | "sky"
  | "amber"
  | "rose"
  | "violet"
  | "slate";

/** Icon chip + soft surface per tone; text stays ≥ 4.5:1 in both themes. */
export const TONE: Record<Tone, { chip: string; soft: string; bar: string }> = {
  emerald: {
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    soft: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    bar: "bg-emerald-500",
  },
  sky: {
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
    soft: "bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
    bar: "bg-sky-500",
  },
  amber: {
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
    soft: "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  rose: {
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
    soft: "bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
    bar: "bg-rose-500",
  },
  violet: {
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
    soft: "bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
    bar: "bg-violet-500",
  },
  slate: {
    chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    soft: "bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-300",
    bar: "bg-slate-500",
  },
};

/** Male / female colours used by every by-sex figure, always beside a text label. */
export const SEX_BAR = { male: "bg-sky-500", female: "bg-rose-500" } as const;

/** Page title row: what this dashboard is, its context line, and its controls. */
export function DashboardHeader({
  title,
  context,
  loading,
  actions,
}: {
  title: string;
  context?: ReactNode;
  loading?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {loading ? (
          <Skeleton className="mt-1.5 h-4 w-56" />
        ) : (
          context && (
            <p className="mt-1 text-sm text-muted-foreground">{context}</p>
          )
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

/** One headline figure. */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "slate",
  loading,
  href,
}: {
  label: string;
  value: number | string;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  loading?: boolean;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            TONE[tone].chip,
          )}
        >
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
        {loading ? (
          <Skeleton className="h-9 w-20" />
        ) : typeof value === "number" ? (
          value.toLocaleString()
        ) : (
          value
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  const cls =
    "block rounded-xl border bg-card p-5 text-card-foreground shadow-xs";
  return href ? (
    <Link
      href={href}
      className={cn(
        cls,
        "transition-colors hover:border-emerald-300 hover:bg-emerald-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** A titled surface holding one chart, list or table. */
export function Panel({
  title,
  description,
  icon: Icon,
  action,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-xl border bg-card text-card-foreground shadow-xs",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <Icon
              className="mt-0.5 size-[18px] shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight text-foreground">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {action}
      </header>
      <div className={cn("flex-1 p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** "View all →" link for a panel header. */
export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-emerald-400 dark:hover:bg-emerald-950/40"
    >
      {children}
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}

/** Nothing to show yet — always says what is missing. */
export function EmptyState({
  icon: Icon = Inbox,
  children,
  className,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 py-10 text-center",
        className,
      )}
    >
      <Icon className="size-6 text-muted-foreground/70" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

/** Stacked placeholder rows while a panel loads. */
export function RowsSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

/**
 * One line of a breakdown: label, count, and a bar for its share of the total.
 * `color` is a CSS colour for data-driven palettes (enrollment statuses);
 * otherwise the tone's bar class is used.
 */
export function BreakdownRow({
  label,
  count,
  total,
  tone = "slate",
  color,
}: {
  label: ReactNode;
  count: number;
  total: number;
  tone?: Tone;
  color?: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <li className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2 text-foreground">
          <span
            className={cn("size-2.5 shrink-0 rounded-full", !color && TONE[tone].bar)}
            style={color ? { backgroundColor: color } : undefined}
            aria-hidden="true"
          />
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 tabular-nums">
          <span className="font-semibold text-foreground">{count.toLocaleString()}</span>
          <span className="ml-1.5 text-xs text-muted-foreground">{pct}%</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className={cn("h-full rounded-full", !color && TONE[tone].bar)}
          style={{ width: `${pct}%`, ...(color ? { backgroundColor: color } : {}) }}
        />
      </div>
    </li>
  );
}

/** A small figure inside a panel (staff composition, advisory, …). */
export function MiniStat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number | string;
  tone?: Tone;
}) {
  return (
    <div className={cn("rounded-lg px-4 py-3", TONE[tone].soft)}>
      <div className="text-2xl font-semibold tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="mt-0.5 text-xs font-medium">{label}</div>
    </div>
  );
}

/** Legend entry: colour swatch beside its text label. */
export function LegendItem({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("size-2.5 rounded-sm", className)} aria-hidden="true" />
      {children}
    </span>
  );
}

/** A shortcut tile to a module. */
export function QuickLink({
  href,
  title,
  description,
  icon: Icon,
  tone = "slate",
}: {
  href: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  tone?: Tone;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-14 items-center gap-3 rounded-xl border bg-card px-4 py-3 text-card-foreground shadow-xs transition-colors hover:border-emerald-300 hover:bg-emerald-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20"
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          TONE[tone].chip,
        )}
      >
        <Icon className="size-[18px]" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        {description && (
          <span className="block truncate text-xs text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      <ArrowRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        aria-hidden="true"
      />
    </Link>
  );
}
