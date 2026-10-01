"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { getGradeLevelLabel } from "@/lib/constants";
import type { ReviewEntity, ReviewStatus } from "@/lib/constants/examReview";
import { supabase } from "@/lib/supabase/client";
import { generateTosTitle } from "@/lib/utils/tos";
import { format } from "date-fns";
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

export function ReviewQueueTable({
  entity,
  statuses,
}: {
  entity: ReviewEntity;
  statuses: ReviewStatus[];
}) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);

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
      if (error) console.error(error);
      setRows((data as QueueRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [entity, statuses]);

  if (loading) return <TableSkeleton />;
  if (rows.length === 0)
    return <p className="py-8 text-center text-sm text-muted-foreground">Nothing here.</p>;

  const tosOf = (r: QueueRow): TosLike =>
    entity === "tos" ? (r as unknown as TosLike) : (r.tos as TosLike);

  return (
    <div className="app__table_container">
      <div className="app__table_wrapper">
        <table className="app__table">
          <thead className="app__table_thead">
            <tr>
              <th className="app__table_th">{entity === "tos" ? "TOS" : "Exam"}</th>
              {entity === "exam" && <th className="app__table_th">TOS</th>}
              <th className="app__table_th">Subject</th>
              <th className="app__table_th">Grade Level</th>
              <th className="app__table_th">Teacher</th>
              <th className="app__table_th">School</th>
              <th className="app__table_th">Submitted</th>
              <th className="app__table_th">Status</th>
              <th className="app__table_th_right">Action</th>
            </tr>
          </thead>
          <tbody className="app__table_tbody">
            {rows.map((r) => {
              const t = tosOf(r);
              return (
                <tr key={r.id} className="app__table_tr">
                  <td className="app__table_td">
                    {entity === "tos"
                      ? r.title?.trim() || generateTosTitle(t)
                      : `${r.title?.trim() || generateTosTitle(t)} · ${r.version_label ?? ""}`}
                  </td>
                  {entity === "exam" && (
                    <td className="app__table_td">{t?.title?.trim() || (t ? generateTosTitle(t) : "—")}</td>
                  )}
                  <td className="app__table_td">{t?.subject_name ?? "—"}</td>
                  <td className="app__table_td">
                    {t ? getGradeLevelLabel(t.grade_level) : "—"}
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
                      href={`/qa/${entity}/${r.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {r.review_status === "approved" ? "Open" : "Review"}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
