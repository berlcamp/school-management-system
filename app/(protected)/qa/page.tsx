"use client";

import { BankReviewQueueTable } from "@/components/examinations/review/BankReviewQueueTable";
import { ReviewQueueTable } from "@/components/examinations/review/ReviewQueueTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReviewStatus } from "@/lib/constants/examReview";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ClipboardCheck, ListChecks } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const PENDING: ReviewStatus[] = ["submitted", "under_review"];
const APPROVED: ReviewStatus[] = ["approved"];
const RETURNED: ReviewStatus[] = ["rejected"];

interface Counts {
  pendingTos: number;
  pendingExams: number;
  authors: number;
  approvedTos: number;
  approvedExams: number;
  pendingQuestions: number;
  approvedQuestions: number;
  returnedQuestions: number;
}

type BankView = "pending" | "approved" | "returned";

const BANK_VIEWS: { key: BankView; label: string; statuses: ReviewStatus[] }[] = [
  { key: "pending", label: "Pending", statuses: PENDING },
  { key: "approved", label: "Approved", statuses: APPROVED },
  { key: "returned", label: "Returned", statuses: RETURNED },
];

/** One tab for the bank, switched by review status inside it. */
function QuestionBankTab({ counts }: { counts: Counts | null }) {
  const [view, setView] = useState<BankView>("pending");
  const countOfView: Record<BankView, number | undefined> = {
    pending: counts?.pendingQuestions,
    approved: counts?.approvedQuestions,
    returned: counts?.returnedQuestions,
  };
  const current = BANK_VIEWS.find((v) => v.key === view) ?? BANK_VIEWS[0];

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Review status" className="inline-flex rounded-lg border bg-muted/40 p-0.5">
        {BANK_VIEWS.map((v) => {
          const active = v.key === view;
          return (
            <button
              key={v.key}
              type="button"
              aria-pressed={active}
              onClick={() => setView(v.key)}
              className={cn(
                "inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v.label}
              <span className="text-xs tabular-nums text-muted-foreground">{countOfView[v.key] ?? "—"}</span>
            </button>
          );
        })}
      </div>
      <BankReviewQueueTable key={current.key} statuses={current.statuses} />
    </div>
  );
}

async function countOf(table: "sms_tos" | "sms_exams", statuses: ReviewStatus[]) {
  const { count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .is("school_id", null)
    .in("review_status", statuses);
  return count ?? 0;
}

export default function Page() {
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const [pendingTos, pendingExams, approvedTos, approvedExams, authorsRes, pendingQ, approvedQ, returnedQ] =
        await Promise.all([
          countOf("sms_tos", PENDING),
          countOf("sms_exams", PENDING),
          countOf("sms_tos", APPROVED),
          countOf("sms_exams", APPROVED),
          supabase
            .from("sms_exam_qa_authors")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true),
          supabase
            .from("sms_exam_bank_questions")
            .select("id", { count: "exact", head: true })
            .in("review_status", PENDING),
          supabase
            .from("sms_exam_bank_questions")
            .select("id", { count: "exact", head: true })
            .in("review_status", APPROVED),
          supabase
            .from("sms_exam_bank_questions")
            .select("id", { count: "exact", head: true })
            .in("review_status", RETURNED),
        ]);
      if (!isMounted) return;
      setCounts({
        pendingTos,
        pendingExams,
        approvedTos,
        approvedExams,
        authors: authorsRes.count ?? 0,
        pendingQuestions: pendingQ.count ?? 0,
        approvedQuestions: approvedQ.count ?? 0,
        returnedQuestions: returnedQ.count ?? 0,
      });
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const tiles: [string, number | undefined][] = [
    ["Pending TOS", counts?.pendingTos],
    ["Pending Exams", counts?.pendingExams],
    ["Authorized Teachers", counts?.authors],
    ["Approved TOS", counts?.approvedTos],
    ["Approved Exams", counts?.approvedExams],
    ["Pending Questions", counts?.pendingQuestions],
    ["Approved Questions", counts?.approvedQuestions],
  ];

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" />
          QA Dashboard
        </h1>
        <div className="app__title_actions">
          <Link
            href="/qa/competencies"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <ListChecks className="h-4 w-4" />
            Competency Catalogue
          </Link>
        </div>
      </div>
      <div className="app__content space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {tiles.map(([label, value]) => (
            <Card key={label}>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{value ?? "—"}</CardContent>
            </Card>
          ))}
        </div>
        <Tabs defaultValue="pending-tos">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="pending-tos">Pending TOS</TabsTrigger>
            <TabsTrigger value="pending-exams">Pending Exams</TabsTrigger>
            <TabsTrigger value="approved-tos">Approved TOS</TabsTrigger>
            <TabsTrigger value="approved-exams">Approved Exams</TabsTrigger>
            <TabsTrigger value="question-bank" className="gap-1.5">
              Question Bank
              {!!counts?.pendingQuestions && (
                <span className="rounded-full bg-amber-100 px-1.5 text-xs font-medium tabular-nums text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                  {counts.pendingQuestions}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="pending-tos">
            <ReviewQueueTable entity="tos" statuses={PENDING} />
          </TabsContent>
          <TabsContent value="pending-exams">
            <ReviewQueueTable entity="exam" statuses={PENDING} />
          </TabsContent>
          <TabsContent value="approved-tos">
            <ReviewQueueTable entity="tos" statuses={APPROVED} />
          </TabsContent>
          <TabsContent value="approved-exams">
            <ReviewQueueTable entity="exam" statuses={APPROVED} />
          </TabsContent>
          <TabsContent value="question-bank" className="pt-2">
            <QuestionBankTab counts={counts} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
