"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { getGradeLevelLabel } from "@/lib/constants";
import { getCognitiveLevelLabel } from "@/lib/constants/examinations";
import type { ReviewStatus } from "@/lib/constants/examReview";
import { supabase } from "@/lib/supabase/client";
import type { BankQuestion } from "@/types";
import { format } from "date-fns";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ReviewStatusBadge } from "./ReviewStatusBadge";

interface Row extends BankQuestion {
  competency: { lc_code: string; competency_text: string; grade_level: number } | null;
  author: { name: string | null; school: { name: string | null } | null } | null;
}

// sms_exam_bank_questions carries two FKs to sms_users (created_by,
// reviewed_by), so the author embed must name its constraint.
const SELECT =
  "*, competency:sms_competency_catalogue!sms_exam_bank_questions_catalogue_competency_id_fkey(lc_code, competency_text, grade_level), " +
  "author:sms_users!sms_exam_bank_questions_created_by_fkey(name, school:school_id(name))";

/** QA's queue of Question Bank questions in the given review statuses. */
export function BankReviewQueueTable({ statuses }: { statuses: ReviewStatus[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) return <TableSkeleton />;
  if (error)
    return (
      <p className="py-8 text-center text-sm text-destructive">
        Could not load the questions: {error}
      </p>
    );
  if (rows.length === 0)
    return <p className="py-8 text-center text-sm text-muted-foreground">Nothing here.</p>;

  return (
    <div className="app__table_container">
      <div className="app__table_wrapper">
        <table className="app__table">
          <thead className="app__table_thead">
            <tr>
              <th className="app__table_th">LC Code</th>
              <th className="app__table_th">Competency</th>
              <th className="app__table_th">Grade Level</th>
              <th className="app__table_th">Cognitive Level</th>
              <th className="app__table_th">Question</th>
              <th className="app__table_th">Teacher</th>
              <th className="app__table_th">School</th>
              <th className="app__table_th">Submitted</th>
              <th className="app__table_th">Status</th>
              <th className="app__table_th_right">Action</th>
            </tr>
          </thead>
          <tbody className="app__table_tbody">
            {rows.map((r) => (
              <tr key={r.id} className="app__table_tr">
                <td className="app__table_td font-mono text-xs">{r.competency?.lc_code ?? "—"}</td>
                <td className="app__table_td max-w-xs">
                  <span className="line-clamp-2">{r.competency?.competency_text ?? "—"}</span>
                </td>
                <td className="app__table_td">
                  {r.competency ? getGradeLevelLabel(r.competency.grade_level) : "—"}
                </td>
                <td className="app__table_td">{getCognitiveLevelLabel(r.cognitive_level)}</td>
                <td className="app__table_td max-w-sm">
                  <span className="line-clamp-2">{r.question_text?.trim() || "(figure only)"}</span>
                </td>
                <td className="app__table_td">{r.author?.name ?? "—"}</td>
                <td className="app__table_td">{r.author?.school?.name ?? "—"}</td>
                <td className="app__table_td">
                  {r.submitted_at ? format(new Date(r.submitted_at), "MMM d, yyyy") : "—"}
                </td>
                <td className="app__table_td">
                  <ReviewStatusBadge status={r.review_status} />
                </td>
                <td className="app__table_td_actions">
                  <Link
                    href={`/qa/question/${r.id}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {r.review_status === "submitted" || r.review_status === "under_review"
                      ? "Review"
                      : "Open"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
