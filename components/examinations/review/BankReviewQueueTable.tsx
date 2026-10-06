"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BLOOM_LEVELS, getCognitiveLevelLabel } from "@/lib/constants/examinations";
import type { ReviewStatus } from "@/lib/constants/examReview";
import { catalogueGradeLabel } from "@/lib/constants/questionBank";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { BankQuestion } from "@/types";
import { differenceInCalendarDays, format, formatDistanceToNowStrict } from "date-fns";
import { ChevronRight, Clock, ImageIcon, Inbox, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ReviewStatusBadge } from "./ReviewStatusBadge";

interface Row extends BankQuestion {
  competency: {
    lc_code: string;
    competency_text: string;
    grade_level: number;
    area: { name: string } | null;
  } | null;
  author: { name: string | null; school: { name: string | null } | null } | null;
}

// sms_exam_bank_questions carries two FKs to sms_users (created_by,
// reviewed_by), so the author embed must name its constraint.
const SELECT =
  "*, competency:sms_competency_catalogue!sms_exam_bank_questions_catalogue_competency_id_fkey(lc_code, competency_text, grade_level, area:sms_learning_areas!sms_competency_catalogue_learning_area_id_fkey(name)), " +
  "author:sms_users!sms_exam_bank_questions_created_by_fkey(name, school:school_id(name))";

/** A pending question waiting longer than this is flagged. */
const STALE_DAYS = 7;

const TIER_CLASS = {
  LOTS: "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-900",
  MOTS: "bg-indigo-50 text-indigo-800 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-200 dark:ring-indigo-900",
  HOTS: "bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-200 dark:ring-violet-900",
} as const;

function LevelChip({ level }: { level: string }) {
  const tier = BLOOM_LEVELS.find((l) => l.value === level)?.tier;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        tier ? TIER_CLASS[tier] : "bg-muted text-muted-foreground ring-border",
      )}
    >
      {getCognitiveLevelLabel(level)}
    </span>
  );
}

const ALL = "all";

/** QA's queue of Question Bank questions in the given review statuses. */
export function BankReviewQueueTable({ statuses }: { statuses: ReviewStatus[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [area, setArea] = useState(ALL);
  const [grade, setGrade] = useState(ALL);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("sms_exam_bank_questions")
        .select(SELECT)
        .in("review_status", statuses)
        .order("submitted_at", { ascending: true, nullsFirst: false });
      if (!isMounted) return;
      setError(error ? error.message : null);
      setRows(error ? [] : ((data as unknown as Row[]) ?? []));
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [statuses]);

  const pending = statuses.some((s) => s === "submitted" || s === "under_review");
  const areas = useMemo(
    () => [...new Set(rows.map((r) => r.competency?.area?.name).filter((n): n is string => !!n))].sort(),
    [rows],
  );
  const grades = useMemo(
    () =>
      [...new Set(rows.map((r) => r.competency?.grade_level).filter((g): g is number => g != null))].sort(
        (a, b) => a - b,
      ),
    [rows],
  );

  const q = search.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (area !== ALL && r.competency?.area?.name !== area) return false;
    if (grade !== ALL && String(r.competency?.grade_level) !== grade) return false;
    if (!q) return true;
    return [
      r.question_text,
      r.competency?.lc_code,
      r.competency?.competency_text,
      r.author?.name,
      r.author?.school?.name,
    ].some((v) => v?.toLowerCase().includes(q));
  });
  const filtered = q !== "" || area !== ALL || grade !== ALL;

  if (error)
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-8 text-center text-sm text-destructive">
        Could not load the questions: {error}
      </p>
    );

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-80">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search question, competency, teacher"
            aria-label="Search questions"
            className="h-9 bg-background pl-8"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={area} onValueChange={setArea} disabled={areas.length === 0}>
            <SelectTrigger aria-label="Learning area" className="h-9 bg-background sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All learning areas</SelectItem>
              {areas.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={grade} onValueChange={setGrade} disabled={grades.length === 0}>
            <SelectTrigger aria-label="Grade level" className="h-9 bg-background sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All grades</SelectItem>
              {grades.map((g) => (
                <SelectItem key={g} value={String(g)}>
                  {catalogueGradeLabel(g)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground sm:ml-auto" aria-live="polite">
          {loading ? (
            "Loading…"
          ) : (
            <>
              <span className="font-semibold text-foreground tabular-nums">{shown.length}</span>
              {filtered && <> of {rows.length}</>} {rows.length === 1 ? "question" : "questions"}
            </>
          )}
        </p>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
        <div className="hidden grid-cols-[minmax(0,1fr)_9rem_13rem_8rem_7rem_1.5rem] gap-4 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid">
          <span>Question</span>
          <span>Cognitive level</span>
          <span>Teacher</span>
          <span>{pending ? "Waiting" : "Submitted"}</span>
          <span>Status</span>
          <span />
        </div>

        {loading && (
          <ul className="divide-y">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="space-y-2 px-4 py-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </li>
            ))}
          </ul>
        )}

        {!loading && shown.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/60" aria-hidden />
            <p className="font-medium">
              {filtered ? "No question matches these filters" : pending ? "Nothing waiting for review" : "Nothing here yet"}
            </p>
            <p className="text-sm text-muted-foreground">
              {filtered
                ? "Clear the search or pick another learning area or grade."
                : pending
                  ? "Questions teachers submit to the bank appear here, oldest first."
                  : "Questions move here once they have been reviewed."}
            </p>
          </div>
        )}

        {!loading && shown.length > 0 && (
          <ul className="divide-y">
            {shown.map((r) => {
              const waited = r.submitted_at ? differenceInCalendarDays(new Date(), new Date(r.submitted_at)) : null;
              const stale = pending && waited !== null && waited > STALE_DAYS;
              const c = r.competency;
              return (
                <li key={r.id}>
                  <Link
                    href={`/qa/question/${r.id}`}
                    className="group grid gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:grid-cols-[minmax(0,1fr)_9rem_13rem_8rem_7rem_1.5rem] lg:items-start"
                  >
                    {/* Question + competency */}
                    <div className="min-w-0 space-y-1.5">
                      <p className="line-clamp-2 font-medium leading-snug">
                        {r.question_text?.trim() || (
                          <span className="inline-flex items-center gap-1.5 italic text-muted-foreground">
                            <ImageIcon className="h-4 w-4" aria-hidden /> Figure only
                          </span>
                        )}
                      </p>
                      <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        {c && (
                          <span className="font-mono text-emerald-800 dark:text-emerald-300">{c.lc_code}</span>
                        )}
                        <span>
                          {[c?.area?.name, c ? catalogueGradeLabel(c.grade_level) : null].filter(Boolean).join(" · ")}
                        </span>
                        {c && (
                          <span className="line-clamp-1 basis-full" title={c.competency_text}>
                            {c.competency_text}
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Phones and tablets: the remaining columns as one wrapped line. */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground lg:contents">
                      <div className="lg:pt-0.5">
                        <LevelChip level={r.cognitive_level} />
                      </div>
                      <div className="min-w-0 lg:text-sm">
                        <p className="truncate text-foreground">{r.author?.name ?? "—"}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.author?.school?.name ?? ""}</p>
                      </div>
                      <div
                        className={cn("lg:pt-0.5 lg:text-sm", stale && "font-medium text-amber-700 dark:text-amber-400")}
                        title={r.submitted_at ? format(new Date(r.submitted_at), "MMM d, yyyy h:mm a") : undefined}
                      >
                        {r.submitted_at ? (
                          pending ? (
                            <span className="inline-flex items-center gap-1">
                              {stale && <Clock className="h-3.5 w-3.5" aria-hidden />}
                              {formatDistanceToNowStrict(new Date(r.submitted_at))}
                            </span>
                          ) : (
                            format(new Date(r.submitted_at), "MMM d, yyyy")
                          )
                        ) : (
                          "—"
                        )}
                      </div>
                      <div className="lg:pt-0.5">
                        <ReviewStatusBadge status={r.review_status} />
                      </div>
                    </div>

                    <ChevronRight
                      className="hidden h-4 w-4 self-center text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground lg:block"
                      aria-hidden
                    />
                    <span className="sr-only">{pending ? "Review" : "Open"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
