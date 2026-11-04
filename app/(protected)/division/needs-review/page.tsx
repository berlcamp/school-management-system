"use client";

/**
 * Needs Review (migration 226): which schools have not yet encoded each
 * module — Books, ARAL (CRLA, Phil-IRI), Examinations, Learner Health, Class
 * Record / ECCD / PACE, Attendance, Rooms and SBFP. Read-only: the page names
 * the screen a school uses to catch up, and never changes anything itself.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SchoolYearFilter } from "@/components/division-reports/SchoolYearFilter";
import { STATUS_STYLE, StatusPill } from "@/components/needs-review/StatusPill";
import { NeedsReviewOff } from "@/components/needs-review/NeedsReviewOff";
import { SchoolProgressChart } from "@/components/needs-review/SchoolProgressChart";
import { useNeedsReviewEnabled } from "@/hooks/useNeedsReviewEnabled";
import { SBFP_DISTRICTS } from "@/lib/constants/sbfp";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  MODULE_GUIDES,
  MODULE_KEYS,
  exportNeedsReviewWorkbook,
  moduleResult,
  normalizeNeedsReviewRow,
  reviewGroups,
  reviewTotals,
  type ModuleStatus,
  type NeedsReviewSchool,
  type ReviewEntry,
  type ReviewGroup,
} from "@/lib/utils/needsReview";
import { ALL_DISTRICTS, OTHER_DISTRICT, inDistrict } from "@/lib/utils/sbfpOverview";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ClipboardCheck,
  FileSpreadsheet,
  RefreshCw,
  School,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Show = "all" | "not_started" | "incomplete";
type View = "module" | "school";

const ROWS_SHOWN = 12;

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  pressed,
  onClick,
}: {
  icon: typeof School;
  label: string;
  value: number;
  tone: string;
  pressed?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className={`h-4 w-4 ${tone}`} aria-hidden="true" />
        {label}
      </div>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value.toLocaleString("en-US")}</p>
    </>
  );
  const base = "rounded-xl border bg-card p-4 text-left shadow-sm";
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={`${base} transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${pressed ? "ring-2 ring-primary" : ""}`}
    >
      {body}
    </button>
  ) : (
    <div className={base}>{body}</div>
  );
}

export default function Page() {
  // Migration 227: off hides the page for everyone but a super admin, whom
  // the database still serves so they can look before turning it back on.
  const user = useAppSelector((state) => state.user.user);
  const { enabled, loading } = useNeedsReviewEnabled();
  if (loading) return null;
  if (!enabled && user?.type !== "super admin") return <NeedsReviewOff />;
  return <NeedsReviewPage />;
}

function NeedsReviewPage() {
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [district, setDistrict] = useState(ALL_DISTRICTS);
  const [search, setSearch] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [view, setView] = useState<View>("module");
  const [schools, setSchools] = useState<NeedsReviewSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
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
        setSchools(((data ?? []) as Record<string, unknown>[]).map(normalizeNeedsReviewRow));
      }
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [schoolYear, reloadKey]);

  const shownSchools = useMemo(() => {
    const q = search.trim().toLowerCase();
    return schools.filter(
      (s) => inDistrict(s.district, district) && (q === "" || s.school_name.toLowerCase().includes(q)),
    );
  }, [schools, district, search]);

  const totals = useMemo(() => reviewTotals(shownSchools), [shownSchools]);
  const groups = useMemo(() => reviewGroups(shownSchools), [shownSchools]);

  const toggle = useCallback((key: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleShow = (s: Show) => setShow((cur) => (cur === s ? "all" : s));

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
          Needs Review
        </h1>
        <p className="text-sm text-muted-foreground">
          Schools that have not yet encoded each module for SY {schoolYear}.
        </p>
      </div>

      <div className="app__content space-y-4">
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          <p className="font-medium">How to use this page</p>
          <ol className="ml-5 mt-1 list-decimal space-y-0.5">
            <li>
              Start with the <strong>Not started</strong> schools in each module, then the{" "}
              <strong>Incomplete</strong> ones.
            </li>
            <li>Open a module to see why it matters, the steps the school follows, and the schools behind.</li>
            <li>Pass the steps to the school; they encode on the screen named there.</li>
            <li>
              Click <strong>Check again</strong>: schools that have caught up leave the list.
            </li>
          </ol>
          <p className="mt-2">This page only reads records. It never changes anything by itself.</p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <SchoolYearFilter value={schoolYear} onChange={setSchoolYear} />
          <div className="flex flex-col gap-1">
            <Label htmlFor="nr-district" className="text-xs text-muted-foreground">
              District
            </Label>
            <Select value={district} onValueChange={setDistrict}>
              <SelectTrigger id="nr-district" className="h-9 w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_DISTRICTS}>All districts</SelectItem>
                {SBFP_DISTRICTS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER_DISTRICT}>Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="nr-search" className="text-xs text-muted-foreground">
              Search school
            </Label>
            <Input
              id="nr-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="School name"
              className="h-9 w-[220px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="nr-view" className="text-xs text-muted-foreground">
              View
            </Label>
            <Select value={view} onValueChange={(v) => setView(v as View)}>
              <SelectTrigger id="nr-view" className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="module">By module</SelectItem>
                <SelectItem value="school">By school</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportNeedsReviewWorkbook(shownSchools, schoolYear)}
              disabled={loading || shownSchools.length === 0}
            >
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
              Excel
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Checking…" : "Check again"}
            </Button>
          </div>
        </div>

        {error ? (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              {error}
              <Button className="mt-2 block" variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
                Try again
              </Button>
            </div>
          </div>
        ) : loading && schools.length === 0 ? (
          <div className="space-y-3" aria-busy="true" aria-label="Checking the records">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[92px] rounded-xl" />
              ))}
            </div>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard icon={School} tone="text-sky-700" label="Schools needing review" value={totals.schoolsBehind} />
              <StatCard
                icon={XCircle}
                tone="text-red-700"
                label="Modules not started"
                value={totals.notStarted}
                pressed={show === "not_started"}
                onClick={() => toggleShow("not_started")}
              />
              <StatCard
                icon={AlertTriangle}
                tone="text-amber-700"
                label="Modules incomplete"
                value={totals.incomplete}
                pressed={show === "incomplete"}
                onClick={() => toggleShow("incomplete")}
              />
              <StatCard icon={School} tone="text-slate-500" label="Schools checked" value={totals.schools} />
            </div>

            {shownSchools.length > 0 && <SchoolProgressChart schools={shownSchools} />}

            {shownSchools.length === 0 ? (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                No school matches. Clear the search or the district to see every school.
              </p>
            ) : view === "module" ? (
              <div className="space-y-3">
                {groups.map((g) => (
                  <GroupCard key={g.key} group={g} show={show} open={open.has(g.key)} onToggle={() => toggle(g.key)} />
                ))}
              </div>
            ) : (
              <SchoolMatrix schools={shownSchools} show={show} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function GroupCard({
  group,
  show,
  open,
  onToggle,
}: {
  group: ReviewGroup;
  show: Show;
  open: boolean;
  onToggle: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const { guide, key } = group;
  const entries: ReviewEntry[] = [
    ...(show !== "incomplete" ? group.notStarted : []),
    ...(show !== "not_started" ? group.incomplete : []),
  ];
  const visible = showAll ? entries : entries.slice(0, ROWS_SHOWN);
  const panelId = `review-${key}`;

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 flex-1 text-sm font-semibold">{guide.title}</span>
          {group.notStarted.length > 0 && (
            <Badge variant="outline" className={STATUS_STYLE.not_started.className}>
              {group.notStarted.length} not started
            </Badge>
          )}
          {group.incomplete.length > 0 && (
            <Badge variant="outline" className={STATUS_STYLE.incomplete.className}>
              {group.incomplete.length} incomplete
            </Badge>
          )}
          {group.notStarted.length + group.incomplete.length === 0 && (
            <Badge variant="outline" className={STATUS_STYLE.complete.className}>
              All caught up
            </Badge>
          )}
          <ChevronDown
            aria-hidden="true"
            className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          />
        </button>
      </h2>
      {open && (
        <div id={panelId} className="grid gap-5 border-t px-4 py-4 lg:grid-cols-5">
          <div className="space-y-3 text-sm lg:col-span-2">
            <p className="text-muted-foreground">{guide.why}</p>
            <div>
              <p className="font-medium">What the school does</p>
              <ol className="ml-5 mt-1 list-decimal space-y-1">
                {guide.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>
            <p className="text-xs text-muted-foreground">
              Screen:{" "}
              <Link href={guide.screen.href} className="font-medium text-primary underline-offset-2 hover:underline">
                {guide.screen.label}
              </Link>{" "}
              · {guide.screen.who}
            </p>
          </div>
          <div className="lg:col-span-3">
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No school is behind on this module.</p>
            ) : (
              <>
                <ul className="divide-y rounded-lg border">
                  {visible.map(({ school, result }) => (
                    <li key={school.school_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                      <StatusPill status={result.status} />
                      <span className="min-w-0 flex-1 text-sm font-medium">{school.school_name}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {result.detail}
                        {result.percent !== null && ` · ${result.percent.toFixed(1)}%`}
                      </span>
                    </li>
                  ))}
                </ul>
                {entries.length > ROWS_SHOWN && (
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll((v) => !v)}>
                    {showAll ? "Show fewer" : `Show all ${entries.length}`}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

const CELL_STYLE: Record<ModuleStatus, string> = {
  not_started: "bg-red-50 text-red-800",
  incomplete: "bg-amber-50 text-amber-900",
  complete: "bg-emerald-50 text-emerald-800",
  not_applicable: "text-slate-400",
};

/** One row per school, one cell per module — the workbook, coloured. */
function SchoolMatrix({ schools, show }: { schools: readonly NeedsReviewSchool[]; show: Show }) {
  const rows = schools.filter((s) =>
    MODULE_KEYS.some((k) => {
      const st = moduleResult(s, k).status;
      return show === "all" ? true : st === show;
    }),
  );
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
      <table className="w-full min-w-[1100px] text-left text-xs">
        <thead className="app__table_thead">
          <tr>
            <th scope="col" className="sticky left-0 bg-muted/50 px-3 py-2 font-semibold">
              School
            </th>
            {MODULE_KEYS.map((k) => (
              <th key={k} scope="col" className="px-2 py-2 font-semibold">
                {MODULE_GUIDES[k].title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((s) => (
            <tr key={s.school_id}>
              <th scope="row" className="sticky left-0 bg-card px-3 py-2 font-medium">
                {s.school_name}
              </th>
              {MODULE_KEYS.map((k) => {
                const r = moduleResult(s, k);
                return (
                  <td key={k} className={`px-2 py-2 align-top ${CELL_STYLE[r.status]}`} title={r.detail}>
                    <span className="block font-medium">
                      {r.percent !== null ? `${r.percent.toFixed(0)}%` : STATUS_STYLE[r.status].label}
                    </span>
                    <span className="block text-[11px] opacity-80">{r.detail}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
