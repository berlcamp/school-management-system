"use client";

/**
 * Printable item-analysis report: class summary (MPS + mastery, mean, high/low,
 * retain/revise/reject counts), a per-item table (mastery level and remark as
 * the division's Item Analysis worksheet bands them, then difficulty,
 * discrimination and the verdict), an optional per-learner score list and an
 * optional Mean Percentage Score roll-up across the sections that sat the same
 * exam. Pure render.
 */

import { getMasteryLevel } from "@/lib/utils/mps";
import {
  computeItemMastery,
  leastLearnedCompetencies,
  passingRate,
  summarizeMpsRollup,
  PASSING_SCORE_PERCENT,
  type AnalysisSummary,
  type CompetencyStat,
  type ItemStat,
  type MpsRollupRow,
} from "@/lib/utils/itemAnalysis";

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
  competencyStats?: CompetencyStat[];
  scores?: { name: string; score: number }[];
  summary: AnalysisSummary;
  showStudents?: boolean;
  /** One row per section that sat this exam; omitted when only one has. */
  mpsRollup?: MpsRollupRow[];
}

const verdictClass: Record<ItemStat["verdict"], string> = {
  Retain: "text-green-700",
  Revise: "text-amber-600",
  Reject: "text-red-600",
};

export function ItemAnalysisReport({
  header,
  itemStats,
  competencyStats,
  scores,
  summary,
  showStudents,
  mpsRollup,
}: ItemAnalysisReportProps) {
  const mastery = getMasteryLevel(summary.mps);
  const llc = competencyStats ? leastLearnedCompetencies(competencyStats) : [];
  const itemMastery = computeItemMastery(itemStats, summary.studentCount);
  const passRate =
    scores && scores.length > 0
      ? passingRate(
          scores.map((s) => s.score),
          summary.totalItems,
        )
      : null;
  const rollupTotals = mpsRollup ? summarizeMpsRollup(mpsRollup) : null;

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
      {/* Item mastery — how many items the class as a whole learned. The
          tiers are exclusive, so the three counts add up to the item total. */}
      <p className="mb-1 text-[10px] font-semibold uppercase text-neutral-600">
        Item mastery — of {summary.totalItems} items
      </p>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryTile label="Mastered" value={itemMastery.mastered} />
        <SummaryTile label="Nearing Mastery" value={itemMastery.nearing} />
        <SummaryTile label="Not Mastered" value={itemMastery.notMastered} />
        <SummaryTile
          label={`% of Passing (≥${PASSING_SCORE_PERCENT}%)`}
          value={passRate != null ? `${passRate}%` : "—"}
        />
      </div>

      <p className="mb-1 text-[11px]">
        Mastery level:{" "}
        <span
          className={`rounded border px-1.5 py-0.5 font-semibold ${mastery.colorClass}`}
        >
          {mastery.label}
        </span>{" "}
        · Retain {summary.retain} · Revise {summary.revise} · Reject{" "}
        {summary.reject}
      </p>
      <p className="mb-3 text-[10px] text-neutral-600">
        M = Mastered (correct responses ≥ 75% of examinees) · NeM = Nearing
        Mastery (50–74%) · NoM = Not Mastered (below 50%, needs remedial)
      </p>

      {/* Per-item table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-black">
          <thead>
            <tr>
              <th className="border border-black px-1 py-1">Item</th>
              <th className="border border-black px-1 py-1">Correct</th>
              <th className="border border-black px-1 py-1">M</th>
              <th className="border border-black px-1 py-1">NeM</th>
              <th className="border border-black px-1 py-1">NoM</th>
              <th className="border border-black px-1 py-1">Remark</th>
              <th className="border border-black px-1 py-1">Diff. Index (p)</th>
              <th className="border border-black px-1 py-1">Difficulty</th>
              <th className="border border-black px-1 py-1">Disc. Index (D)</th>
              <th className="border border-black px-1 py-1">Discrimination</th>
              <th className="border border-black px-1 py-1">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {itemStats.map((it, i) => {
              const m = itemMastery.rows[i];
              return (
              <tr key={it.itemNumber}>
                <td className="border border-black px-1 py-1 text-center font-medium">
                  {it.itemNumber}
                </td>
                <td className="border border-black px-1 py-1 text-center">
                  {it.correct}/{it.total}
                </td>
                <td className="border border-black px-1 py-1 text-center">
                  {m?.tier === "mastered" ? "✓" : ""}
                </td>
                <td className="border border-black px-1 py-1 text-center">
                  {m?.tier === "nearing" ? "✓" : ""}
                </td>
                <td className="border border-black px-1 py-1 text-center">
                  {m?.tier === "not" ? "✓" : ""}
                </td>
                <td
                  className={`border border-black px-1 py-1 text-center font-semibold ${
                    m?.remark === "REMEDIAL" ? "text-red-600" : "text-green-700"
                  }`}
                >
                  {m?.remark}
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
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Per-competency mastery */}
      {competencyStats && competencyStats.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-[11px] font-semibold">
            Competency Analysis (Mean Percentage Score per MELC)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-black">
              <thead>
                <tr>
                  <th className="border border-black px-1 py-1 text-left">
                    Competency
                  </th>
                  <th className="border border-black px-1 py-1">Items</th>
                  <th className="border border-black px-1 py-1">Correct</th>
                  <th className="border border-black px-1 py-1">MPS</th>
                  <th className="border border-black px-1 py-1">Mastery</th>
                </tr>
              </thead>
              <tbody>
                {competencyStats.map((c) => {
                  const m = getMasteryLevel(c.mps);
                  return (
                    <tr key={c.competencyId}>
                      <td className="border border-black px-1 py-1 align-top">
                        {c.lcCode ? (
                          <span className="font-medium">{c.lcCode}</span>
                        ) : null}
                        {c.lcCode ? " — " : ""}
                        {c.competencyText}
                      </td>
                      <td className="border border-black px-1 py-1 text-center">
                        {c.itemCount}
                      </td>
                      <td className="border border-black px-1 py-1 text-center">
                        {c.correct}/{c.total}
                      </td>
                      <td className="border border-black px-1 py-1 text-center font-medium">
                        {c.mps}%
                      </td>
                      <td className="border border-black px-1 py-1 text-center">
                        <span
                          className={`rounded border px-1 py-0.5 font-semibold ${m.colorClass}`}
                        >
                          {m.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {llc.length > 0 && (
            <div className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1.5">
              <p className="text-[11px] font-semibold text-red-700">
                Least Learned {llc.length > 1 ? "Competencies" : "Competency"}{" "}
                (LLC) — lowest MPS at {llc[0].mps}%
              </p>
              <ul className="mt-0.5 list-disc pl-4 text-[11px] text-black">
                {llc.map((c) => (
                  <li key={c.competencyId}>
                    {c.lcCode ? (
                      <span className="font-medium">{c.lcCode}</span>
                    ) : null}
                    {c.lcCode ? " — " : ""}
                    {c.competencyText}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

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

      {mpsRollup && mpsRollup.length > 0 && rollupTotals && (
        <div className="mt-4">
          <p className="mb-1 text-[11px] font-semibold uppercase">
            Mean Percentage Score
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-black">
              <thead>
                <tr>
                  <th className="border border-black px-1 py-1 text-left">
                    Course
                  </th>
                  <th className="border border-black px-1 py-1">Section</th>
                  <th className="border border-black px-1 py-1">
                    No. of Students
                  </th>
                  <th className="border border-black px-1 py-1">No. of Items</th>
                  <th className="border border-black px-1 py-1">Total Score</th>
                  <th className="border border-black px-1 py-1">MPS</th>
                  <th className="border border-black px-1 py-1">MPS × n</th>
                </tr>
              </thead>
              <tbody>
                {mpsRollup.map((r) => (
                  <tr key={r.key} className={r.isCurrent ? "font-semibold" : ""}>
                    <td className="border border-black px-1 py-1">
                      {r.subject}
                    </td>
                    <td className="border border-black px-1 py-1 whitespace-nowrap">
                      {r.sectionName}
                    </td>
                    <td className="border border-black px-1 py-1 text-center">
                      {r.students}
                    </td>
                    <td className="border border-black px-1 py-1 text-center">
                      {r.items}
                    </td>
                    <td className="border border-black px-1 py-1 text-center">
                      {r.totalScore}
                    </td>
                    <td className="border border-black px-1 py-1 text-center">
                      {r.mps.toFixed(2)}%
                    </td>
                    <td className="border border-black px-1 py-1 text-center">
                      {r.mpsTimesN.toFixed(2)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td
                    className="border border-black px-1 py-1 text-right font-semibold"
                    colSpan={2}
                  >
                    Σn / Σx
                  </td>
                  <td className="border border-black px-1 py-1 text-center font-semibold">
                    {rollupTotals.students}
                  </td>
                  <td className="border border-black px-1 py-1" />
                  <td className="border border-black px-1 py-1 text-center font-semibold">
                    {rollupTotals.totalScore}
                  </td>
                  <td className="border border-black px-1 py-1" />
                  <td className="border border-black px-1 py-1 text-center font-semibold">
                    {rollupTotals.mpsTimesN.toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td
                    className="border border-black px-1 py-1 text-right font-semibold uppercase"
                    colSpan={6}
                  >
                    General MPS
                  </td>
                  <td className="border border-black px-1 py-1 text-center font-bold">
                    {rollupTotals.generalMps.toFixed(2)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[10px] text-neutral-600">
            General MPS = Σ(MPS × n) ÷ Σn — weighted by the number of learners
            in each section.
          </p>
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
