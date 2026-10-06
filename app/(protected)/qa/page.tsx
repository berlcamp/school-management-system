"use client";

import { BankReviewQueueTable } from "@/components/examinations/review/BankReviewQueueTable";
import { ReviewQueueTable } from "@/components/examinations/review/ReviewQueueTable";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReviewStatus } from "@/lib/constants/examReview";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  ClipboardCheck,
  FileQuestion,
  FileText,
  ListChecks,
  Table2,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const PENDING: ReviewStatus[] = ["submitted", "under_review"];
const APPROVED: ReviewStatus[] = ["approved"];
const RETURNED: ReviewStatus[] = ["rejected"];

type Queue = "tos" | "exam" | "question";
type View = "pending" | "approved" | "returned";

const QUEUES: { key: Queue; label: string; icon: LucideIcon }[] = [
  { key: "tos", label: "TOS", icon: Table2 },
  { key: "exam", label: "Exams", icon: FileText },
  { key: "question", label: "Question Bank", icon: FileQuestion },
];

const VIEWS: { key: View; label: string; statuses: ReviewStatus[] }[] = [
  { key: "pending", label: "Pending", statuses: PENDING },
  { key: "approved", label: "Approved", statuses: APPROVED },
  { key: "returned", label: "Returned", statuses: RETURNED },
];

type QueueCounts = Record<View, number>;
interface Counts {
  tos: QueueCounts;
  exam: QueueCounts;
  question: QueueCounts;
  authors: number;
}

async function countOf(queue: Queue, statuses: ReviewStatus[]) {
  const q =
    queue === "question"
      ? supabase.from("sms_exam_bank_questions").select("id", { count: "exact", head: true })
      : supabase
          .from(queue === "tos" ? "sms_tos" : "sms_exams")
          .select("id", { count: "exact", head: true })
          .is("school_id", null);
  const { count } = await q.in("review_status", statuses);
  return count ?? 0;
}

async function queueCounts(queue: Queue): Promise<QueueCounts> {
  const [pending, approved, returned] = await Promise.all(VIEWS.map((v) => countOf(queue, v.statuses)));
  return { pending, approved, returned };
}

function isQueue(v: string | null): v is Queue {
  return v === "tos" || v === "exam" || v === "question";
}
function isView(v: string | null): v is View {
  return v === "pending" || v === "approved" || v === "returned";
}

/** Pending / Approved / Returned, the same switch on every queue. */
function StatusSwitch({
  value,
  counts,
  onChange,
}: {
  value: View;
  counts: QueueCounts | undefined;
  onChange: (v: View) => void;
}) {
  return (
    <div role="group" aria-label="Review status" className="inline-flex rounded-lg border bg-muted/40 p-0.5">
      {VIEWS.map((v) => {
        const active = v.key === value;
        return (
          <button
            key={v.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(v.key)}
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {v.label}
            <span className="text-xs tabular-nums text-muted-foreground">{counts?.[v.key] ?? "—"}</span>
          </button>
        );
      })}
    </div>
  );
}

function Dashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queueParam = params.get("queue");
  const viewParam = params.get("status");
  const queue: Queue = isQueue(queueParam) ? queueParam : "tos";
  const view: View = isView(viewParam) ? viewParam : "pending";
  const [counts, setCounts] = useState<Counts | null>(null);

  // The queue and status live in the URL, so Back and a shared link land on the same list.
  const go = (next: { queue?: Queue; view?: View }) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("queue", next.queue ?? queue);
    sp.set("status", next.view ?? view);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const [tos, exam, question, authorsRes] = await Promise.all([
        queueCounts("tos"),
        queueCounts("exam"),
        queueCounts("question"),
        supabase.from("sms_exam_qa_authors").select("id", { count: "exact", head: true }).eq("is_active", true),
      ]);
      if (!isMounted) return;
      setCounts({ tos, exam, question, authors: authorsRes.count ?? 0 });
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const totalPending = counts ? counts.tos.pending + counts.exam.pending + counts.question.pending : null;
  const current = VIEWS.find((v) => v.key === view) ?? VIEWS[0];

  return (
    <div>
      <div className="app__title flex-wrap gap-y-2">
        <div className="min-w-0 space-y-0.5">
          <h1 className="app__title_text flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 shrink-0" />
            QA Dashboard
          </h1>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {totalPending === null
              ? "Loading the review queues…"
              : totalPending === 0
                ? "All caught up — nothing is waiting for review."
                : `${totalPending} ${totalPending === 1 ? "item is" : "items are"} waiting for review, oldest first.`}
          </p>
        </div>
        <div className="app__title_actions flex-wrap">
          <Button asChild variant="outline" size="sm">
            <Link href="/qa/authors">
              <Users className="h-4 w-4" /> Authorized Teachers
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/qa/competencies">
              <ListChecks className="h-4 w-4" /> Competency Catalogue
            </Link>
          </Button>
        </div>
      </div>

      <div className="app__content space-y-6">
        {/* Work cards: what is waiting, per queue. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {QUEUES.map(({ key, label, icon: Icon }) => {
            const c = counts?.[key];
            const waiting = c?.pending ?? 0;
            const active = queue === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => go({ queue: key, view: "pending" })}
                aria-label={`${label}: ${c ? `${waiting} waiting for review` : "loading"}`}
                className={cn(
                  "group flex flex-col gap-3 rounded-xl border bg-background p-4 text-left shadow-sm transition-all",
                  "hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active && "border-emerald-500 ring-1 ring-emerald-500",
                )}
              >
                <span className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">{label}</span>
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg",
                      waiting > 0
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                </span>
                {c ? (
                  <span>
                    <span className="block text-3xl font-semibold tabular-nums leading-none">{waiting}</span>
                    <span className="mt-1.5 block text-xs text-muted-foreground">
                      waiting · {c.approved} approved
                    </span>
                  </span>
                ) : (
                  <span className="space-y-2">
                    <Skeleton className="h-7 w-10" />
                    <Skeleton className="h-3 w-24" />
                  </span>
                )}
              </button>
            );
          })}
          <Link
            href="/qa/authors"
            className="flex flex-col gap-3 rounded-xl border bg-background p-4 shadow-sm transition-all hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Authorized teachers</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                <Users className="h-4 w-4" aria-hidden />
              </span>
            </span>
            {counts ? (
              <span>
                <span className="block text-3xl font-semibold tabular-nums leading-none">{counts.authors}</span>
                <span className="mt-1.5 block text-xs text-muted-foreground">may write Division TOS</span>
              </span>
            ) : (
              <span className="space-y-2">
                <Skeleton className="h-7 w-10" />
                <Skeleton className="h-3 w-24" />
              </span>
            )}
          </Link>
        </div>

        <Tabs value={queue} onValueChange={(v) => isQueue(v) && go({ queue: v })}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList className="h-auto w-fit flex-wrap">
              {QUEUES.map(({ key, label }) => {
                const waiting = counts?.[key].pending ?? 0;
                return (
                  <TabsTrigger key={key} value={key} className="gap-1.5">
                    {label}
                    {waiting > 0 && (
                      <span className="rounded-full bg-amber-100 px-1.5 text-xs font-medium tabular-nums text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                        {waiting}
                      </span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            <StatusSwitch value={view} counts={counts?.[queue]} onChange={(v) => go({ view: v })} />
          </div>

          <TabsContent value="tos" className="pt-3">
            {queue === "tos" && <ReviewQueueTable key={view} entity="tos" statuses={current.statuses} />}
          </TabsContent>
          <TabsContent value="exam" className="pt-3">
            {queue === "exam" && <ReviewQueueTable key={view} entity="exam" statuses={current.statuses} />}
          </TabsContent>
          <TabsContent value="question" className="pt-3">
            {queue === "question" && <BankReviewQueueTable key={view} statuses={current.statuses} />}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}
