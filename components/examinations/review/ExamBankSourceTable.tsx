"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { getExamQuestionTypeLabel } from "@/lib/constants/examinations";
import { supabase } from "@/lib/supabase/client";
import { questionSourceLabel } from "@/lib/utils/questionBank";
import { useEffect, useState } from "react";

interface Row {
  id: string;
  item_number: number;
  question_type: string;
  source_bank_question_id: string | null;
  bank_level_override: boolean | null;
}

/**
 * Per item: written new for this exam, or taken from the Question Bank.
 * Informational only — nothing about bank status gates exam approval.
 */
export function ExamBankSourceTable({ examId }: { examId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("sms_exam_questions")
        .select("id, item_number, question_type, source_bank_question_id, bank_level_override")
        .eq("exam_id", Number(examId))
        .order("item_number");
      if (!isMounted) return;
      setError(error ? error.message : null);
      setRows(error ? [] : ((data as Row[]) ?? []));
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [examId]);

  if (loading) return <TableSkeleton rows={3} />;
  if (error)
    return <p className="text-sm text-destructive">Could not load the items: {error}</p>;
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">No questions have been written yet.</p>;

  const fromBank = rows.filter((r) => r.source_bank_question_id != null).length;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {fromBank} of {rows.length} item(s) from the Question Bank; the rest were written for this
        exam.
      </p>
      <div className="app__table_container">
        <div className="app__table_wrapper">
          <table className="app__table">
            <thead className="app__table_thead">
              <tr>
                <th className="app__table_th">Item</th>
                <th className="app__table_th">Type</th>
                <th className="app__table_th">Source</th>
                <th className="app__table_th">Note</th>
              </tr>
            </thead>
            <tbody className="app__table_tbody">
              {rows.map((r) => (
                <tr key={r.id} className="app__table_tr">
                  <td className="app__table_td">{r.item_number}</td>
                  <td className="app__table_td">{getExamQuestionTypeLabel(r.question_type)}</td>
                  <td className="app__table_td">{questionSourceLabel(r)}</td>
                  <td className="app__table_td text-amber-700">
                    {r.bank_level_override
                      ? "Level override — cognitive level differs from the TOS item"
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
