"use client";

import { REVIEW_ACTION_LABEL } from "@/lib/constants/examReview";
import { supabase } from "@/lib/supabase/client";
import type { ExamReviewEvent } from "@/types";
import { format } from "date-fns";
import { useEffect, useState } from "react";

interface Row extends ExamReviewEvent {
  actor: { name: string | null } | null;
}

/** The audit trail of one TOS, exam or authorization, oldest first. */
export function ReviewHistory({
  entity,
  id,
  refreshKey = 0,
}: {
  entity: "tos" | "exam" | "author";
  id: string | number;
  refreshKey?: number;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("sms_exam_review_events")
        .select("*, actor:actor_id(name)")
        .eq("entity_type", entity)
        .eq("entity_id", Number(id))
        .order("created_at", { ascending: true });
      if (!isMounted) return;
      setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [entity, id, refreshKey]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading history…</p>;
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">No review activity yet.</p>;

  return (
    <ol className="space-y-3">
      {rows.map((r) => (
        <li key={r.id} className="border-l-2 border-muted pl-3">
          <div className="text-sm font-medium">
            {REVIEW_ACTION_LABEL[r.action]}
            <span className="ml-2 font-normal text-muted-foreground">
              {r.actor?.name ?? "—"} · {format(new Date(r.created_at), "MMM d, yyyy h:mm a")}
            </span>
          </div>
          {r.comment && <p className="mt-0.5 text-sm text-muted-foreground">{r.comment}</p>}
        </li>
      ))}
    </ol>
  );
}
