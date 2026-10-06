"use client";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getGradeLevelLabel } from "@/lib/constants";
import type { ReviewEntity, ReviewStatus } from "@/lib/constants/examReview";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { generateTosTitle } from "@/lib/utils/tos";
import { differenceInCalendarDays, format, formatDistanceToNowStrict } from "date-fns";
import { ChevronRight, Clock, Inbox, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ReviewStatusBadge } from "./ReviewStatusBadge";

interface TosLike {
  title: string | null;
  subject_name: string;
  grade_level: number;
  exam_type: string;
  grading_period: number;
  school_year: string;
}

interface QueueRow {
  id: string;
  title: string | null;
  version_label?: string;
  review_status: ReviewStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  subject_name?: string;
  grade_level?: number;
  exam_type?: string;
  grading_period?: number;
  school_year?: string;
  tos?: TosLike | null;
  author: { name: string | null; school: { name: string | null } | null } | null;
}

/** A pending item waiting longer than this is flagged. */
const STALE_DAYS = 7;

const GRID = "lg:grid-cols-[minmax(0,1fr)_13rem_8rem_7rem_1.5rem]";

/** QA's queue of division TOS or exams in the given review statuses. */
export function ReviewQueueTable({
  entity,
  statuses,
}: {
  entity: Exclude<ReviewEntity, "question">;
  statuses: ReviewStatus[];
}) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      const authorSelect = "author:created_by(name, school:school_id(name))";
      const { data, error } =
        entity === "tos"
          ? await supabase
              .from("sms_tos")
              .select(`*, ${authorSelect}`)
              .is("school_id", null)
              .in("review_status", statuses)
              .order("submitted_at", { ascending: true, nullsFirst: false })
          : await supabase
              .from("sms_exams")
              .select(
                `*, ${authorSelect}, tos:tos_id(title, subject_name, grade_level, exam_type, grading_period, school_year)`,
              )
              .is("school_id", null)
              .in("review_status", statuses)
              .order("submitted_at", { ascending: true, nullsFirst: false });
      if (!isMounted) return;
      setError(error ? error.message : null);
      setRows(error ? [] : ((data as QueueRow[]) ?? []));
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [entity, statuses]);

  const pending = statuses.some((s) => s === "submitted" || s === "under_review");
  const noun = entity === "tos" ? "TOS" : "exam";
  const tosOf = (r: QueueRow): TosLike | null =>
    entity === "tos" ? (r as unknown as TosLike) : (r.tos ?? null);
  const titleOf = (r: QueueRow) => {
    const t = tosOf(r);
    const base = r.title?.trim() || (t ? generateTosTitle(t) : "Untitled");
    return entity === "exam" && r.version_label ? `${base} · ${r.version_label}` : base;
  };

  const q = search.trim().toLowerCase();
  const shown = q
    ? rows.filter((r) =>
        [titleOf(r), tosOf(r)?.subject_name, r.author?.name, r.author?.school?.name].some((v) =>
          v?.toLowerCase().includes(q),
        ),
      )
    : rows;

  if (error)
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-8 text-center text-sm text-destructive">
        Could not load the {noun} queue: {error}
      </p>
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-80">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, subject, teacher, school"
            aria-label={`Search ${noun}`}
            className="h-9 bg-background pl-8"
          />
        </div>
        <p className="text-sm text-muted-foreground sm:ml-auto" aria-live="polite">
          {loading ? (
            "Loading…"
          ) : (
            <>
              <span className="font-semibold text-foreground tabular-nums">{shown.length}</span>
              {q && <> of {rows.length}</>} {entity === "tos" ? "TOS" : rows.length === 1 ? "exam" : "exams"}
            </>
          )}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
        <div
          className={cn(
            "hidden gap-4 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid",
            GRID,
          )}
        >
          <span>{entity === "tos" ? "TOS" : "Exam"}</span>
          <span>Teacher</span>
          <span>{pending ? "Waiting" : statuses.includes("approved") ? "Approved" : "Returned"}</span>
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
              {q ? `No ${noun} matches “${search.trim()}”` : pending ? "Nothing waiting for review" : "Nothing here yet"}
            </p>
            <p className="text-sm text-muted-foreground">
              {q
                ? "Try another title, subject or teacher."
                : pending
                  ? `Division ${noun === "TOS" ? "TOS" : "exams"} submitted by authorized teachers appear here, oldest first.`
                  : `Division ${noun === "TOS" ? "TOS" : "exams"} move here once they have been reviewed.`}
            </p>
          </div>
        )}

        {!loading && shown.length > 0 && (
          <ul className="divide-y">
            {shown.map((r) => {
              const t = tosOf(r);
              const waited = r.submitted_at ? differenceInCalendarDays(new Date(), new Date(r.submitted_at)) : null;
              const stale = pending && waited !== null && waited > STALE_DAYS;
              const when = pending ? r.submitted_at : (r.reviewed_at ?? r.submitted_at);
              return (
                <li key={r.id}>
                  <Link
                    href={`/qa/${entity}/${r.id}`}
                    className={cn(
                      "group grid gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-muted/40 lg:items-start",
                      "focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      GRID,
                    )}
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="line-clamp-2 font-medium leading-snug">{titleOf(r)}</p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          t?.subject_name,
                          t ? getGradeLevelLabel(t.grade_level) : null,
                          t?.exam_type,
                          t?.school_year ? `SY ${t.school_year}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>

                    {/* Phones and tablets: the remaining columns as one wrapped line. */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground lg:contents">
                      <div className="min-w-0 lg:text-sm">
                        <p className="truncate text-foreground">{r.author?.name ?? "—"}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.author?.school?.name ?? ""}</p>
                      </div>
                      <div
                        className={cn("lg:pt-0.5 lg:text-sm", stale && "font-medium text-amber-700 dark:text-amber-400")}
                        title={when ? format(new Date(when), "MMM d, yyyy h:mm a") : undefined}
                      >
                        {when ? (
                          pending ? (
                            <span className="inline-flex items-center gap-1">
                              {stale && <Clock className="h-3.5 w-3.5" aria-hidden />}
                              {formatDistanceToNowStrict(new Date(when))}
                            </span>
                          ) : (
                            format(new Date(when), "MMM d, yyyy")
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
                    <span className="sr-only">{r.review_status === "approved" ? "Open" : "Review"}</span>
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
