"use client";

import { ExamReleaseCodeCard } from "@/components/examinations/ExamReleaseCodeCard";
import { ExamViewModal } from "@/components/examinations/ExamViewModal";
import { ReviewDecisionPanel } from "@/components/examinations/review/ReviewDecisionPanel";
import { ReviewHistory } from "@/components/examinations/review/ReviewHistory";
import { ReviewStatusBadge } from "@/components/examinations/review/ReviewStatusBadge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";
import type { Exam } from "@/types";
import Link from "next/link";
import { use, useEffect, useState } from "react";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [exam, setExam] = useState<Exam | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { data } = await supabase.from("sms_exams").select("*").eq("id", Number(id)).maybeSingle();
      if (!isMounted) return;
      setExam((data as Exam | null) ?? null);
      setLoaded(true);
    })();
    return () => {
      isMounted = false;
    };
  }, [id, refreshKey]);

  if (!loaded) return <div className="app__content">Loading…</div>;
  if (!exam)
    return (
      <div className="app__content text-muted-foreground">
        Not found or you do not have access.
      </div>
    );

  return (
    <div>
      <div className="app__title">
        <Link href="/qa" className="text-sm text-muted-foreground hover:text-foreground">
          ← QA Dashboard
        </Link>
        <h1 className="app__title_text flex items-center gap-3">
          {exam.title?.trim() || `Exam · ${exam.version_label}`}
          <ReviewStatusBadge status={exam.review_status} />
        </h1>
        <div className="app__title_actions">
          <Button variant="outline" size="sm" onClick={() => setViewOpen(true)}>
            View exam
          </Button>
        </div>
      </div>
      <div className="app__content grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="font-semibold">Decision</h2>
            {exam.review_status && (
              <ReviewDecisionPanel
                entity="exam"
                row={{ id: exam.id, review_status: exam.review_status, created_by: exam.created_by }}
                onChanged={() => setRefreshKey((k) => k + 1)}
              />
            )}
          </section>
          {exam.review_status === "approved" && (
            <section className="space-y-3">
              <h2 className="font-semibold">Release code</h2>
              <ExamReleaseCodeCard examId={exam.id} onSealedChange={() => {}} />
            </section>
          )}
        </div>
        <section className="space-y-3">
          <h2 className="font-semibold">History</h2>
          <ReviewHistory entity="exam" id={exam.id} refreshKey={refreshKey} />
        </section>
      </div>
      <ExamViewModal isOpen={viewOpen} exam={exam} onClose={() => setViewOpen(false)} />
    </div>
  );
}
