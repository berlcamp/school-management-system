"use client";

import { ReviewQueueTable } from "@/components/examinations/review/ReviewQueueTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReviewStatus } from "@/lib/constants/examReview";
import { supabase } from "@/lib/supabase/client";
import { ClipboardCheck } from "lucide-react";
import { useEffect, useState } from "react";

const PENDING: ReviewStatus[] = ["submitted", "under_review"];
const APPROVED: ReviewStatus[] = ["approved"];

interface Counts {
  pendingTos: number;
  pendingExams: number;
  authors: number;
  approvedTos: number;
  approvedExams: number;
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
      const [pendingTos, pendingExams, approvedTos, approvedExams, authorsRes] =
        await Promise.all([
          countOf("sms_tos", PENDING),
          countOf("sms_exams", PENDING),
          countOf("sms_tos", APPROVED),
          countOf("sms_exams", APPROVED),
          supabase
            .from("sms_exam_qa_authors")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true),
        ]);
      if (!isMounted) return;
      setCounts({
        pendingTos,
        pendingExams,
        approvedTos,
        approvedExams,
        authors: authorsRes.count ?? 0,
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
  ];

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" />
          QA Dashboard
        </h1>
      </div>
      <div className="app__content space-y-6">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
          <TabsList>
            <TabsTrigger value="pending-tos">Pending TOS</TabsTrigger>
            <TabsTrigger value="pending-exams">Pending Exams</TabsTrigger>
            <TabsTrigger value="approved-tos">Approved TOS</TabsTrigger>
            <TabsTrigger value="approved-exams">Approved Exams</TabsTrigger>
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
        </Tabs>
      </div>
    </div>
  );
}
