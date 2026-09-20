"use client";

/**
 * Saved results for one exam + section, and the printable learner slips.
 *
 * Reads back what the scanner (or the hand-encoding grid) saved, so this tab is
 * the record, not a copy of the review screen. Rows written before migration
 * 132 have no raw answers; their slips still print, showing which items were
 * right, just without the learner's own choice beside the key. That degradation
 * is deliberate — an older result is still worth handing to a learner.
 *
 * The section and its roster are the workspace's, not this panel's: the results
 * have to be read for exactly the class the sheets were scanned against.
 */

import { Button } from "@/components/ui/button";
import type { RosterLearner } from "@/hooks/useExamRoster";
import { getGradeLevelLabel } from "@/lib/constants";
import {
  scorableItemNumbers,
  scoreAnswers,
  type AnswerKeyItem,
  type SheetScore,
} from "@/lib/omr/score";
import { generateExamResultSlips } from "@/lib/pdf/generateExamResultSlips";
import { supabase } from "@/lib/supabase/client";
import {
  computeItemStats,
  summarize,
  type AnalysisStudent,
} from "@/lib/utils/itemAnalysis";
import { BarChart3, ListChecks, Printer, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ExamNotice } from "./ExamNotice";
import { ItemAnalysisReport } from "./ItemAnalysisReport";
import { PrintPortal } from "./PrintPortal";

interface ExamResultsPanelProps {
  examId: string;
  answerKey: AnswerKeyItem[];
  schoolName: string;
  examTitle: string;
  subjectName: string;
  versionLabel: string;
  schoolYear: string;
  sectionId: string;
  sectionName: string;
  sectionGradeLevel: number;
  learners: RosterLearner[];
  teacherName: string | null;
  /** Bumped by the scan panel after a save so this tab refetches. */
  refreshToken: number;
  onGoToStep: (step: string) => void;
}

interface SavedRow {
  studentId: number;
  correctItems: number[];
  answers: string[];
  scanSource: string;
}

export function ExamResultsPanel({
  examId,
  answerKey,
  schoolName,
  examTitle,
  subjectName,
  versionLabel,
  schoolYear,
  sectionId,
  sectionName,
  sectionGradeLevel,
  learners,
  teacherName,
  refreshToken,
  onGoToStep,
}: ExamResultsPanelProps) {
  const [rows, setRows] = useState<SavedRow[]>([]);
  const [mps, setMps] = useState<number | null>(null);
  const [dateAdministered, setDateAdministered] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!sectionId || !examId) {
      setRows([]);
      setMps(null);
      return;
    }
    setLoading(true);

    const { data: result } = await supabase
      .from("sms_exam_results")
      .select("id, mps, date_administered")
      .eq("exam_id", Number(examId))
      .eq("section_id", Number(sectionId))
      .eq("school_year", schoolYear)
      .maybeSingle();

    if (!result?.id) {
      setRows([]);
      setMps(null);
      setDateAdministered(null);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("sms_exam_result_students")
      .select("student_id, correct_items, answers, scan_source")
      .eq("result_id", result.id);

    setRows(
      (data ?? []).map((row) => ({
        studentId: Number(row.student_id),
        correctItems: (row.correct_items ?? []) as number[],
        answers: (row.answers ?? []) as string[],
        scanSource: (row.scan_source as string) ?? "manual",
      })),
    );
    setMps(result.mps != null ? Number(result.mps) : null);
    setDateAdministered((result.date_administered as string) ?? null);
    setLoading(false);
  }, [examId, sectionId, schoolYear]);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  /**
   * Score every saved row.
   *
   * A scanned row is re-scored from its raw answers, so correcting the answer
   * key updates the slips without a re-scan. A hand-encoded row has no raw
   * answers, so its stored correct-item list is taken at face value — it is the
   * only record of what happened.
   */
  const scored = useMemo(() => {
    const byStudent = new Map<number, SavedRow>(
      rows.map((r) => [r.studentId, r]),
    );

    const entries = learners
      .map((learner) => {
        const row = byStudent.get(learner.id);
        if (!row) return null;

        const score: SheetScore =
          row.answers.length > 0
            ? scoreAnswers(row.answers, answerKey)
            : scoreFromCorrectItems(row.correctItems, answerKey);

        return { learner, row, score };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    const ranked = [...entries].sort(
      (a, b) => b.score.correctCount - a.score.correctCount,
    );
    const rankByStudent = new Map<number, number>();
    ranked.forEach((entry, index) => {
      const previous = ranked[index - 1];
      const rank =
        previous && previous.score.correctCount === entry.score.correctCount
          ? (rankByStudent.get(previous.learner.id) as number)
          : index + 1;
      rankByStudent.set(entry.learner.id, rank);
    });

    return entries.map((entry) => ({
      ...entry,
      rank: rankByStudent.get(entry.learner.id) ?? null,
    }));
  }, [rows, learners, answerKey]);

  /**
   * Difficulty / discrimination / MPS, computed straight from the saved rows.
   *
   * The item analysis is a read of the same data, not a separate step a teacher
   * has to remember to do: a scan finishes and the analysis is already here.
   * The maths is migration 101's, unchanged — only where it is called from is
   * new — so a scanned administration and a hand-encoded one produce the same
   * numbers and the Item Analysis page still agrees with this tab.
   */
  const analysis = useMemo(() => {
    if (scored.length === 0) return null;

    const itemNumbers = scorableItemNumbers(answerKey);
    if (itemNumbers.length === 0) return null;

    const students: AnalysisStudent[] = scored.map((entry) => ({
      studentId: String(entry.learner.id),
      correctItems: new Set(entry.score.correctItems),
    }));
    const scores = scored.map((entry) => entry.score.correctCount);
    const itemStats = computeItemStats(students, itemNumbers);

    return {
      itemStats,
      summary: summarize(scores, itemNumbers.length, itemStats),
      scoreRows: scored.map((entry) => ({
        name: entry.learner.name,
        score: entry.score.correctCount,
      })),
    };
  }, [scored, answerKey]);

  const reportHeader = {
    examTitle: `${examTitle} — ${versionLabel}`,
    subject: subjectName,
    sectionName,
    gradeLabel: getGradeLevelLabel(sectionGradeLevel),
    schoolYear,
    dateAdministered,
  };

  const handlePrint = (only?: number) => {
    const selected = only
      ? scored.filter((s) => s.learner.id === only)
      : scored;
    if (selected.length === 0) {
      toast.error("No results to print.");
      return;
    }
    try {
      generateExamResultSlips({
        schoolName,
        examTitle,
        subjectName,
        sectionName,
        schoolYear,
        versionLabel,
        teacherName,
        dateAdministered,
        classMps: mps,
        learners: selected.map((entry) => ({
          studentId: entry.learner.id,
          name: entry.learner.name,
          lrn: entry.learner.lrn,
          score: entry.score,
          rank: entry.rank,
        })),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  if (!sectionId) {
    return (
      <div className="app__empty_state">
        <div className="app__empty_state_icon">
          <ListChecks className="mx-auto h-10 w-10" />
        </div>
        <p className="app__empty_state_title">Choose a section first</p>
        <p className="app__empty_state_description">
          Results are saved per class. Pick the section in the box above to see
          what has been recorded for it.
        </p>
      </div>
    );
  }

  const highest =
    scored.length > 0
      ? Math.max(...scored.map((s) => s.score.correctCount))
      : null;
  const lowest =
    scored.length > 0
      ? Math.min(...scored.map((s) => s.score.correctCount))
      : null;

  return (
    <div className="space-y-4">
      {scored.length === 0 ? (
        <div className="app__empty_state">
          <p className="app__empty_state_title">
            {loading
              ? "Looking for saved results…"
              : `Nothing recorded yet for ${sectionName || "this section"}`}
          </p>
          <p className="app__empty_state_description">
            Scan the answer sheets, or encode them by hand from the Item
            Analysis page.
          </p>
          {!loading && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onGoToStep("scan")}
              >
                Go to Scan &amp; Score
              </Button>
              <Button size="sm" variant="ghost" onClick={load}>
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Check again
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Scores are recomputed from the answer key. With no key there is
              nothing to recompute against, so every column reads zero beside a
              stored MPS that does not — say so rather than let the table and
              the headline quietly contradict each other. */}
          {answerKey.length === 0 && (
            <ExamNotice
              tone="warn"
              title="This exam has no answer key, so the per-learner columns read zero"
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onGoToStep("key")}
                >
                  Set the answer key
                </Button>
              }
            >
              These results were encoded by hand. Score, % and Points are worked
              out from the key, and there is none — the Class MPS below is the
              figure that was saved with the results and is unaffected. Setting
              the key fills the columns in without a re-scan.
            </ExamNotice>
          )}

          {rows.length > scored.length &&
            (() => {
              const hidden = rows.length - scored.length;
              const one = hidden === 1;
              return (
                <ExamNotice tone="info">
                  {hidden} saved result{one ? "" : "s"}{" "}
                  {one ? "belongs to a learner who is" : "belong to learners who are"}{" "}
                  no longer on this section&apos;s roster for {schoolYear}, so{" "}
                  {one ? "it is" : "they are"} not listed below. Nothing has been
                  deleted.
                </ExamNotice>
              );
            })()}

          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg border bg-card p-3.5">
            <div className="min-w-0">
              {mps != null ? (
                <>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Class MPS
                  </p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {mps.toFixed(2)}%
                  </p>
                </>
              ) : (
                <p className="text-sm font-semibold">
                  {sectionName || "This section"}
                </p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">
                  {scored.length}
                </span>{" "}
                of {learners.length} learners scored
                {highest != null && answerKey.length > 0 && (
                  <>
                    {" · highest "}
                    <span className="tabular-nums">{highest}</span>
                    {" · lowest "}
                    <span className="tabular-nums">{lowest}</span>
                  </>
                )}
                {dateAdministered && <> · administered {dateAdministered}</>}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-9"
                onClick={load}
                disabled={loading}
              >
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Refresh
              </Button>
              {analysis && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={() => window.print()}
                >
                  <BarChart3 className="mr-1.5 h-4 w-4" />
                  Print item analysis
                </Button>
              )}
              <Button
                size="sm"
                variant="green"
                className="h-9"
                onClick={() => handlePrint()}
              >
                <Printer className="mr-1.5 h-4 w-4" />
                Print all result slips
              </Button>
            </div>
          </div>

          <div className="app__table_container">
            <div className="app__table_wrapper">
              <table className="app__table">
                <thead className="app__table_thead">
                  <tr>
                    <th className="app__table_th">Rank</th>
                    <th className="app__table_th">Learner</th>
                    <th className="app__table_th">Score</th>
                    <th className="app__table_th">%</th>
                    <th className="app__table_th">Points</th>
                    <th className="app__table_th">Source</th>
                    <th className="app__table_th_right">Actions</th>
                  </tr>
                </thead>
                <tbody className="app__table_tbody">
                  {scored.map((entry) => (
                    <tr key={entry.learner.id} className="app__table_tr">
                      <td className="app__table_td tabular-nums">
                        {entry.rank}
                      </td>
                      <td className="app__table_td">
                        <div className="app__table_cell_title">
                          {entry.learner.name}
                        </div>
                        {entry.learner.lrn && (
                          <div className="app__table_cell_subtitle font-mono">
                            {entry.learner.lrn}
                          </div>
                        )}
                      </td>
                      <td className="app__table_td tabular-nums">
                        {entry.score.correctCount} / {entry.score.scorableCount}
                      </td>
                      <td className="app__table_td tabular-nums">
                        {entry.score.percentage.toFixed(1)}%
                      </td>
                      <td className="app__table_td tabular-nums">
                        {entry.score.points} / {entry.score.maxPoints}
                      </td>
                      <td className="app__table_td">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            entry.row.scanSource === "scan"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {entry.row.scanSource === "scan"
                            ? "Scanned"
                            : "Encoded"}
                        </span>
                      </td>
                      <td className="app__table_td_actions">
                        <div className="app__table_action_container">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handlePrint(entry.learner.id)}
                          >
                            <Printer className="mr-1.5 h-3.5 w-3.5" />
                            Slip
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {analysis && (
        <>
          <div className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Item analysis
              </h3>
              <span className="text-xs text-muted-foreground">
                computed from these results — no separate step
              </span>
            </div>
            <ItemAnalysisReport
              header={reportHeader}
              itemStats={analysis.itemStats}
              summary={analysis.summary}
              scores={analysis.scoreRows}
              showStudents
            />
          </div>

          {/* Printed outside the tab so the browser's print view gets the
              report alone, not the surrounding workspace chrome. Reuses the
              id the Item Analysis page already registers in globals.css, so
              both places print identically. */}
          <PrintPortal id="item-analysis-print-area">
            <ItemAnalysisReport
              header={reportHeader}
              itemStats={analysis.itemStats}
              summary={analysis.summary}
              scores={analysis.scoreRows}
              showStudents
            />
          </PrintPortal>
        </>
      )}
    </div>
  );
}

/**
 * Rebuild a score from a pre-132 row that only knows which items were right.
 * The learner's own choices are unrecoverable, so every wrong item reads as a
 * blank on the slip rather than inventing a letter they never marked.
 */
function scoreFromCorrectItems(
  correctItems: number[],
  answerKey: AnswerKeyItem[],
): SheetScore {
  const correct = new Set(correctItems);
  const answers = answerKey.map((item) =>
    correct.has(item.itemNumber) ? (item.correctAnswer ?? "") : "",
  );
  return scoreAnswers(answers, answerKey);
}
