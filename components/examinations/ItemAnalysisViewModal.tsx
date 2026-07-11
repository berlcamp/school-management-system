"use client";

/**
 * Read-only item-analysis report for a saved result (used by the division list
 * to drill into any school's results). Loads the exam's auto-scorable items and
 * the stored per-learner marks, recomputes the analysis, and prints.
 */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getGradeLevelLabel } from "@/lib/constants";
import { getExamQuestionType } from "@/lib/constants/examinations";
import { supabase } from "@/lib/supabase/client";
import {
  computeItemStats,
  studentScore,
  summarize,
  type AnalysisStudent,
  type ItemStat,
} from "@/lib/utils/itemAnalysis";
import { generateTosTitle } from "@/lib/utils/tos";
import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ItemAnalysisReport,
  type ItemAnalysisReportHeader,
} from "./ItemAnalysisReport";
import { PrintPortal } from "./PrintPortal";
import type { ItemAnalysisResultRow } from "./ItemAnalysisList";

interface ItemAnalysisViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: ItemAnalysisResultRow | null;
}

export function ItemAnalysisViewModal({
  isOpen,
  onClose,
  result,
}: ItemAnalysisViewModalProps) {
  const [loading, setLoading] = useState(false);
  const [itemStats, setItemStats] = useState<ItemStat[]>([]);
  const [scoreRows, setScoreRows] = useState<{ name: string; score: number }[]>(
    [],
  );
  const [summary, setSummary] = useState<ReturnType<typeof summarize> | null>(
    null,
  );

  useEffect(() => {
    if (!isOpen || !result?.id) return;
    let active = true;
    (async () => {
      setLoading(true);

      const { data: qRows } = await supabase
        .from("sms_exam_questions")
        .select("item_number, item_count, question_type")
        .eq("exam_id", result.exam_id)
        .order("item_number");
      const items: number[] = [];
      (qRows ?? []).forEach((q) => {
        if (!getExamQuestionType(q.question_type)?.autoScorable) return;
        const count = Number(q.item_count) || 1;
        for (let k = 0; k < count; k++) items.push(q.item_number + k);
      });
      items.sort((a, b) => a - b);

      const { data: rows } = await supabase
        .from("sms_exam_result_students")
        .select("student_id, correct_items")
        .eq("result_id", result.id);

      const studentIds = (rows ?? []).map((r) => String(r.student_id));
      const nameMap = new Map<string, string>();
      if (studentIds.length > 0) {
        const { data: studs } = await supabase
          .from("sms_students")
          .select("id, first_name, last_name")
          .in("id", studentIds);
        (studs ?? []).forEach((s) =>
          nameMap.set(String(s.id), `${s.last_name}, ${s.first_name}`),
        );
      }

      if (!active) return;

      const analysisStudents: AnalysisStudent[] = (rows ?? []).map((r) => ({
        studentId: String(r.student_id),
        correctItems: new Set((r.correct_items ?? []) as number[]),
      }));
      const scores = analysisStudents.map((s) =>
        studentScore(s.correctItems, items),
      );
      const stats = computeItemStats(analysisStudents, items);
      setItemStats(stats);
      setSummary(summarize(scores, items.length, stats));
      setScoreRows(
        analysisStudents.map((s, i) => ({
          name: nameMap.get(s.studentId) ?? s.studentId,
          score: scores[i],
        })),
      );
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [isOpen, result?.id, result?.exam_id]);

  if (!result) return null;

  const tos = result.exam?.tos;
  const header: ItemAnalysisReportHeader = {
    examTitle:
      result.exam?.title?.trim() ||
      (tos ? `${generateTosTitle(tos)} · ${result.exam?.version_label}` : "Exam"),
    subject: tos?.subject_name ?? "",
    sectionName: result.section?.name ?? "",
    gradeLabel: getGradeLevelLabel(
      result.section?.grade_level ?? tos?.grade_level ?? 0,
    ),
    schoolYear: result.school_year,
    dateAdministered: result.date_administered,
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[1000px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-4">
            <span>Item Analysis</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => window.print()}
              className="mr-6"
            >
              <Printer className="mr-1.5 h-4 w-4" /> Print
            </Button>
          </DialogTitle>
        </DialogHeader>

        {loading || !summary ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="bg-white p-2">
              <ItemAnalysisReport
                header={header}
                itemStats={itemStats}
                scores={scoreRows}
                summary={summary}
                showStudents
              />
            </div>
            <PrintPortal id="item-analysis-print-area">
              <ItemAnalysisReport
                header={header}
                itemStats={itemStats}
                scores={scoreRows}
                summary={summary}
                showStudents
              />
            </PrintPortal>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
