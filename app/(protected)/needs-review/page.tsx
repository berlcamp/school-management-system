"use client";

/**
 * Needs Review for one school (migration 227): the school head's and school
 * admin's own row of the division's /division/needs-review — how far their
 * school has encoded each module, and the steps and screen to catch up.
 *
 * The school is not chosen here. `division_needs_review` returns a school head
 * or admin only their active school, so the page simply shows the one row it
 * gets back. Read-only.
 */

import { ModuleAccessDenied } from "@/components/ModuleAccessDenied";
import { NeedsReviewOff } from "@/components/needs-review/NeedsReviewOff";
import { StatusPill } from "@/components/needs-review/StatusPill";
import { SchoolYearFilter } from "@/components/division-reports/SchoolYearFilter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNeedsReviewEnabled } from "@/hooks/useNeedsReviewEnabled";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  MODULE_GUIDES,
  MODULE_KEYS,
  moduleResult,
  normalizeNeedsReviewRow,
  type ModuleKey,
  type ModuleResult,
  type ModuleStatus,
  type NeedsReviewSchool,
} from "@/lib/utils/needsReview";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { AlertCircle, CheckCircle2, ClipboardCheck, RefreshCw, XCircle, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/** Behind first, so the work to do is at the top. */
const STATUS_ORDER: Record<ModuleStatus, number> = {
  not_started: 0,
  incomplete: 1,
  complete: 2,
  not_applicable: 3,
};

const SCHOOL_ROLES = new Set(["school_head", "admin"]);

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const { enabled, loading } = useNeedsReviewEnabled();
  if (!user || loading) return null;
  if (!SCHOOL_ROLES.has(user.type ?? "")) return <ModuleAccessDenied />;
  if (!enabled) return <NeedsReviewOff />;
  return <SchoolNeedsReview />;
}

function SchoolNeedsReview() {
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [school, setSchool] = useState<NeedsReviewSchool | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    void (async () => {
      const { data, error: err } = await supabase.rpc("division_needs_review", { p_school_year: schoolYear });
      if (!isMounted) return;
      if (err) {
        console.error("Error loading Needs Review:", err);
        setError("The figures could not be loaded. Please try again.");
      } else {
        const rows = ((data ?? []) as Record<string, unknown>[]).map(normalizeNeedsReviewRow);
        setSchool(rows[0] ?? null);
      }
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [schoolYear, reloadKey]);

  const modules = useMemo(() => {
    if (!school) return [];
    return MODULE_KEYS.map((key) => ({ key, result: moduleResult(school, key) })).sort(
      (a, b) => STATUS_ORDER[a.result.status] - STATUS_ORDER[b.result.status],
    );
  }, [school]);

  const count = (st: ModuleStatus) => modules.filter((m) => m.result.status === st).length;

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
          Needs Review
        </h1>
        <p className="text-sm text-muted-foreground">
          {school ? `${school.school_name} — ` : ""}what your school has not yet encoded for SY {schoolYear}.
        </p>
      </div>

      <div className="app__content space-y-4">
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          <p>
            The division office sees this same list for every school. Each module below says why it matters, what
            to do, and which screen to use. After encoding, click <strong>Check again</strong>. This page only reads
            records; it never changes anything.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <SchoolYearFilter value={schoolYear} onChange={setSchoolYear} />
          <Button
            className="ml-auto"
            variant="secondary"
            size="sm"
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={loading}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Checking…" : "Check again"}
          </Button>
        </div>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              {error}
              <Button className="mt-2 block" variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
                Try again
              </Button>
            </div>
          </div>
        ) : loading && !school ? (
          <div className="space-y-3" aria-busy="true" aria-label="Checking the records">
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[92px] rounded-xl" />
              ))}
            </div>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : !school ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Your school is not on the list. Needs Review covers active schools only; ask the division office if
            this looks wrong.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat icon={XCircle} tone="text-red-700" label="Not started" value={count("not_started")} />
              <Stat icon={AlertTriangle} tone="text-amber-700" label="Incomplete" value={count("incomplete")} />
              <Stat icon={CheckCircle2} tone="text-emerald-700" label="Complete" value={count("complete")} />
            </div>
            <ul className="space-y-3">
              {modules.map(({ key, result }) => (
                <ModuleCard key={key} moduleKey={key} result={result} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof XCircle;
  tone: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className={`h-4 w-4 ${tone}`} aria-hidden="true" />
        {label}
      </div>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ModuleCard({ moduleKey, result }: { moduleKey: ModuleKey; result: ModuleResult }) {
  const guide = MODULE_GUIDES[moduleKey];
  const behind = result.status === "not_started" || result.status === "incomplete";
  return (
    <li className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="min-w-0 flex-1 text-sm font-semibold">{guide.title}</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {result.detail}
          {result.percent !== null && ` · ${result.percent.toFixed(1)}%`}
        </span>
        <StatusPill status={result.status} />
      </div>
      {behind && (
        <div className="mt-3 space-y-2 border-t pt-3 text-sm">
          <p className="text-muted-foreground">{guide.why}</p>
          <ol className="ml-5 list-decimal space-y-1">
            {guide.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            Screen:{" "}
            <Link href={guide.screen.href} className="font-medium text-primary underline-offset-2 hover:underline">
              {guide.screen.label}
            </Link>{" "}
            · {guide.screen.who}
          </p>
        </div>
      )}
    </li>
  );
}
