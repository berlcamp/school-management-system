"use client";

import { ReviewDecisionPanel } from "@/components/examinations/review/ReviewDecisionPanel";
import { ReviewHistory } from "@/components/examinations/review/ReviewHistory";
import { ReviewStatusBadge } from "@/components/examinations/review/ReviewStatusBadge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getGradeLevelLabel } from "@/lib/constants";
import {
  BLOOM_LEVELS,
  getExamQuestionTypeLabel,
  type CognitiveLevel,
} from "@/lib/constants/examinations";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { examImageUrl } from "@/lib/utils/examImages";
import { setBankQuestionLevel } from "@/lib/utils/questionBank";
import type { BankOption, BankQuestion } from "@/types";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface Row extends BankQuestion {
  options: BankOption[];
  competency: {
    lc_code: string;
    competency_text: string;
    grade_level: number;
    area: { name: string } | null;
  } | null;
  author: { name: string | null; school: { name: string | null } | null } | null;
}

// Two FKs from sms_exam_bank_questions to sms_users (created_by,
// reviewed_by): the author embed names its constraint.
const SELECT =
  "*, options:sms_exam_bank_options(*), " +
  "competency:sms_competency_catalogue!sms_exam_bank_questions_catalogue_competency_id_fkey(lc_code, competency_text, grade_level, area:sms_learning_areas!sms_competency_catalogue_learning_area_id_fkey(name)), " +
  "author:sms_users!sms_exam_bank_questions_created_by_fkey(name, school:school_id(name))";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const me = useAppSelector((s) => s.user.user?.system_user_id ?? null);
  const [row, setRow] = useState<Row | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingLevel, setSavingLevel] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("sms_exam_bank_questions")
        .select(SELECT)
        .eq("id", Number(id))
        .maybeSingle();
      if (!isMounted) return;
      setLoadError(error ? error.message : null);
      setRow(error ? null : ((data as unknown as Row | null) ?? null));
      setLoaded(true);
    })();
    return () => {
      isMounted = false;
    };
  }, [id, refreshKey]);

  if (!loaded) return <div className="app__content">Loading…</div>;
  if (loadError)
    return (
      <div className="app__content text-destructive">Could not load the question: {loadError}</div>
    );
  if (!row)
    return (
      <div className="app__content text-muted-foreground">
        Not found or you do not have access.
      </div>
    );

  const isOwn = me != null && String(row.created_by) === String(me);
  // Mirrors bank_question_set_level: QA, not their own, only while under review.
  const canSetLevel = row.review_status === "under_review" && !isOwn;
  const options = [...(row.options ?? [])].sort((a, b) => a.position - b.position);

  const changeLevel = async (v: string) => {
    if (v === row.cognitive_level || savingLevel) return;
    setSavingLevel(true);
    const { error } = await setBankQuestionLevel(row.id, v as CognitiveLevel);
    setSavingLevel(false);
    if (error) return toast.error(error);
    toast.success("Cognitive level corrected");
    setRefreshKey((k) => k + 1);
  };

  return (
    <div>
      <div className="app__title">
        <Link href="/qa" className="text-sm text-muted-foreground hover:text-foreground">
          ← QA Dashboard
        </Link>
        <h1 className="app__title_text flex items-center gap-3">
          Question Bank question
          <ReviewStatusBadge status={row.review_status} />
        </h1>
      </div>
      <div className="app__content grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <section className="space-y-1 text-sm">
            <p>
              <span className="font-mono">{row.competency?.lc_code ?? "—"}</span> —{" "}
              {row.competency?.competency_text ?? "—"}
            </p>
            <p className="text-muted-foreground">
              {row.competency?.area?.name ?? "—"} ·{" "}
              {row.competency ? getGradeLevelLabel(row.competency.grade_level) : "—"} ·{" "}
              {getExamQuestionTypeLabel(row.question_type)} · written from the{" "}
              {row.source_llc_school_year} Least Learned list
            </p>
            <p className="text-muted-foreground">
              By {row.author?.name ?? "—"}
              {row.author?.school?.name ? `, ${row.author.school.name}` : ""}
            </p>
          </section>

          <section className="space-y-3 rounded-md border p-4">
            {row.question_text && <p className="whitespace-pre-wrap">{row.question_text}</p>}
            {row.image_path && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={examImageUrl(row.image_path)}
                alt={row.image_name ?? "Question figure"}
                className="max-h-60 rounded border"
              />
            )}
            {options.length > 0 && (
              <ol className="list-[upper-alpha] space-y-1 pl-6">
                {options.map((o) => (
                  <li
                    key={o.id}
                    className={o.is_correct ? "font-semibold text-green-700" : undefined}
                  >
                    {o.choice_text}
                    {o.is_correct && <span className="ml-1">✓ correct</span>}
                    {o.image_path && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={examImageUrl(o.image_path)}
                        alt={o.image_name ?? "Choice figure"}
                        className="mt-1 max-h-32 rounded border"
                      />
                    )}
                  </li>
                ))}
              </ol>
            )}
            {row.question_type === "true_false" && (
              <p>
                Answer: <b>{row.answer_key ?? "—"}</b>
              </p>
            )}
          </section>

          <section className="w-64">
            <Label className="mb-1.5 block">Cognitive level</Label>
            <Select
              value={row.cognitive_level}
              disabled={!canSetLevel || savingLevel}
              onValueChange={changeLevel}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BLOOM_LEVELS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {row.review_status === "submitted" && !isOwn && (
              <p className="mt-1 text-xs text-muted-foreground">
                Start the review to correct it.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold">Decision</h2>
            {row.review_comment && (
              <p className="text-sm text-muted-foreground">
                Latest comment: {row.review_comment}
              </p>
            )}
            <ReviewDecisionPanel
              entity="question"
              row={{ id: row.id, review_status: row.review_status, created_by: row.created_by }}
              onChanged={() => setRefreshKey((k) => k + 1)}
            />
          </section>
        </div>
        <section className="space-y-3">
          <h2 className="font-semibold">History</h2>
          <ReviewHistory entity="question" id={row.id} refreshKey={refreshKey} />
        </section>
      </div>
    </div>
  );
}
