"use client";

/**
 * Read-only list of exam results (item-analysis) for the division rollup.
 * Rows carry joined exam/tos, section and school for display; each drills into
 * the read-only ItemAnalysisViewModal.
 */

import { Button } from "@/components/ui/button";
import { getGradeLevelLabel } from "@/lib/constants";
import type { ExamResult } from "@/types";
import { getMasteryLevel } from "@/lib/utils/mps";
import { generateTosTitle } from "@/lib/utils/tos";
import { BarChart3 } from "lucide-react";
import { useState } from "react";
import { useSelector } from "react-redux";
import { ItemAnalysisViewModal } from "./ItemAnalysisViewModal";

interface JoinedTos {
  subject_name: string;
  grade_level: number;
  school_year: string;
  exam_type: string;
  grading_period: number;
  title: string | null;
}

export type ItemAnalysisResultRow = ExamResult & {
  exam?: {
    version_label: string;
    title: string | null;
    tos?: JoinedTos | null;
  } | null;
  section?: { name: string; grade_level: number } | null;
  school?: { name: string } | null;
};

export function ItemAnalysisList({ showSchool }: { showSchool?: boolean }) {
  const list = useSelector(
    (state: { list: { value: ItemAnalysisResultRow[] } }) => state.list.value,
  );
  const [viewItem, setViewItem] = useState<ItemAnalysisResultRow | null>(null);

  const examTitle = (r: ItemAnalysisResultRow) =>
    r.exam?.title?.trim() ||
    (r.exam?.tos
      ? `${generateTosTitle(r.exam.tos)} · ${r.exam.version_label}`
      : "Exam");

  return (
    <div className="app__table_container">
      <div className="app__table_wrapper">
        <table className="app__table">
          <thead className="app__table_thead">
            <tr>
              <th className="app__table_th">Exam</th>
              <th className="app__table_th">Subject</th>
              <th className="app__table_th">Section</th>
              {showSchool && <th className="app__table_th">School</th>}
              <th className="app__table_th">SY</th>
              <th className="app__table_th">MPS</th>
              <th className="app__table_th_right">Actions</th>
            </tr>
          </thead>
          <tbody className="app__table_tbody">
            {list.map((r) => {
              const mastery = r.mps != null ? getMasteryLevel(r.mps) : null;
              return (
                <tr key={r.id} className="app__table_tr">
                  <td className="app__table_td">
                    <div className="app__table_cell_title">{examTitle(r)}</div>
                  </td>
                  <td className="app__table_td">
                    {r.exam?.tos?.subject_name ?? "—"}
                  </td>
                  <td className="app__table_td">
                    {r.section
                      ? `${r.section.name} · ${getGradeLevelLabel(r.section.grade_level)}`
                      : "—"}
                  </td>
                  {showSchool && (
                    <td className="app__table_td">{r.school?.name ?? "—"}</td>
                  )}
                  <td className="app__table_td">{r.school_year}</td>
                  <td className="app__table_td">
                    {r.mps != null ? (
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${mastery?.colorClass ?? ""}`}
                      >
                        {r.mps}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="app__table_td_actions">
                    <div className="app__table_action_container">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setViewItem(r)}
                      >
                        <BarChart3 className="mr-1.5 h-4 w-4" />
                        View
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ItemAnalysisViewModal
        isOpen={!!viewItem}
        result={viewItem}
        onClose={() => setViewItem(null)}
      />
    </div>
  );
}
