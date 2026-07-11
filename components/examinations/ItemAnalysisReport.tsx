"use client";

/**
 * Printable item-analysis report: class summary (MPS + mastery, mean, high/low,
 * retain/revise/reject counts), a per-item table (difficulty, discrimination,
 * verdict), and an optional per-learner score list. Pure render.
 */

import { getMasteryLevel } from "@/lib/utils/mps";
import type { AnalysisSummary, ItemStat } from "@/lib/utils/itemAnalysis";

export interface ItemAnalysisReportHeader {
  examTitle: string;
  subject: string;
  sectionName: string;
  gradeLabel: string;
  schoolYear: string;
  dateAdministered?: string | null;
}

interface ItemAnalysisReportProps {
  header: ItemAnalysisReportHeader;
  itemStats: ItemStat[];
  scores?: { name: string; score: number }[];
  summary: AnalysisSummary;
  showStudents?: boolean;
}

const verdictClass: Record<ItemStat["verdict"], string> = {
  Retain: "text-green-700",
  Revise: "text-amber-600",
  Reject: "text-red-600",
};

export function ItemAnalysisReport({
  header,
  itemStats,
  scores,
  summary,
  showStudents,
}: ItemAnalysisReportProps) {
  const mastery = getMasteryLevel(summary.mps);

  return (
    <div className="item-analysis text-[11px] leading-tight text-black">
      <div className="mb-3 text-center">
        <h2 className="text-sm font-bold uppercase">Item Analysis</h2>
        <p className="text-xs font-semibold">{header.examTitle}</p>
        <p className="text-[11px]">
          {header.subject} · {header.gradeLabel} · {header.sectionName} · SY{" "}
          {header.schoolYear}
          {header.dateAdministered ? ` · ${header.dateAdministered}` : ""}
        </p>
      </div>

      {/* Summary */}
      <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        <SummaryTile label="Learners" value={summary.studentCount} />
        <SummaryTile label="Items" value={summary.totalItems} />
        <SummaryTile label="MPS" value={`${summary.mps}%`} />
        <SummaryTile label="Mean" value={summary.meanScore} />
        <SummaryTile label="Highest" value={summary.highest} />
        <SummaryTile label="Lowest" value={summary.lowest} />
      </div>
      <p className="mb-3 text-[11px]">
        Mastery level:{" "}
        <span
          className={`rounded border px-1.5 py-0.5 font-semibold ${mastery.colorClass}`}
        >
          {mastery.label}
        </span>{" "}
        · Retain {summary.retain} · Revise {summary.revise} · Reject{" "}
        {summary.reject}
      </p>

      {/* Per-item table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-black">
          <thead>
            <tr>
              <th className="border border-black px-1 py-1">Item</th>
              <th className="border border-black px-1 py-1">Correct</th>
              <th className="border border-black px-1 py-1">Diff. Index (p)</th>
              <th className="border border-black px-1 py-1">Difficulty</th>
              <th className="border border-black px-1 py-1">Disc. Index (D)</th>
              <th className="border border-black px-1 py-1">Discrimination</th>
              <th className="border border-black px-1 py-1">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {itemStats.map((it) => (
              <tr key={it.itemNumber}>
                <td className="border border-black px-1 py-1 text-center font-medium">
                  {it.itemNumber}
                </td>
                <td className="border border-black px-1 py-1 text-center">
                  {it.correct}/{it.total}
                </td>
                <td className="border border-black px-1 py-1 text-center">
                  {it.difficulty.toFixed(2)}
                </td>
                <td className="border border-black px-1 py-1 text-center">
                  {it.difficultyLabel}
                </td>
                <td className="border border-black px-1 py-1 text-center">
                  {it.discrimination.toFixed(2)}
                </td>
                <td className="border border-black px-1 py-1 text-center">
                  {it.discriminationLabel}
                </td>
                <td
                  className={`border border-black px-1 py-1 text-center font-semibold ${verdictClass[it.verdict]}`}
                >
                  {it.verdict}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showStudents && scores && scores.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-[11px] font-semibold">Learner Scores</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 sm:grid-cols-3">
            {scores.map((s, i) => (
              <p key={i} className="flex justify-between border-b border-dotted">
                <span className="truncate">{s.name}</span>
                <span className="font-medium">
                  {s.score}/{summary.totalItems}
                </span>
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded border border-neutral-300 px-2 py-1 text-center">
      <p className="text-[9px] uppercase text-neutral-500">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}
