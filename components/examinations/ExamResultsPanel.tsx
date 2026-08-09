"use client";

/**
 * Saved results for one exam + section, and the printable learner slips.
 *
 * Reads back what the scanner (or the hand-encoding grid) saved, so this tab is
 * the record, not a copy of the review screen. Rows written before migration
 * 132 have no raw answers; their slips still print, showing which items were
 * right, just without the learner's own choice beside the key. That degradation
 * is deliberate — an older result is still worth handing to a learner.
 */

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSectionRoster, type RosterSection } from "@/hooks/useExamRoster";
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
import { BarChart3, Printer, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
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
  sections: RosterSection[];
  sectionId: string;
  onSectionChange: (id: string) => void;
  sectionsLoading: boolean;
  teacherName: string | null;
  /** Bumped by the scan panel after a save so this tab refetches. */
  refreshToken: number;
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
  sections,
  sectionId,
  onSectionChange,
  sectionsLoading,
  teacherName,
  refreshToken,
}: ExamResultsPanelProps) {
  const { learners } = useSectionRoster(sectionId, schoolYear);
  const [rows, setRows] = useState<SavedRow[]>([]);
  const [mps, setMps] = useState<number | null>(null);
  const [dateAdministered, setDateAdministered] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const section = sections.find((s) => s.id === sectionId);

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
    sectionName: section?.name ?? "",
    gradeLabel: getGradeLevelLabel(section?.grade_level ?? 0),
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
        sectionName: section?.name ?? "",
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="space-y-1">
          <Label className="text-xs">Section</Label>
          <Select
            value={sectionId}
            onValueChange={onSectionChange}
            disabled={sectionsLoading}
          >
            <SelectTrigger className="h-9 w-60" aria-label="Section">
              <SelectValue
                placeholder={
                  sectionsLoading ? "Loading sections…" : "Select a section"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-9"
          onClick={load}
          disabled={loading || !sectionId}
        >
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Refresh
        </Button>

        {scored.length > 0 && (
          <div className="ml-auto flex gap-2">
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
        )}
      </div>

      {mps != null && scored.length > 0 && (
        <div className="flex flex-wrap gap-6 rounded-lg border p-3 text-sm">
          <Stat label="Learners scored" value={String(scored.length)} />
          <Stat label="Class MPS" value={`${mps.toFixed(2)}%`} />
          <Stat
            label="Highest"
            value={String(
              Math.max(...scored.map((s) => s.score.correctCount)),
            )}
          />
          <Stat
            label="Lowest"
            value={String(Math.min(...scored.map((s) => s.score.correctCount)))}
          />
          {dateAdministered && (
            <Stat label="Administered" value={dateAdministered} />
          )}
        </div>
      )}

      {scored.length === 0 ? (
        <div className="app__empty_state">
          <p className="app__empty_state_title">
            {loading ? "Loading…" : "No saved results for this section"}
          </p>
          <p className="app__empty_state_description">
            Scan the answer sheets on the Scan &amp; Score tab, or encode them by
            hand from the Item Analysis page.
          </p>
        </div>
      ) : (
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
                    <td className="app__table_td">{entry.rank}</td>
                    <td className="app__table_td">
                      <div className="app__table_cell_title">
                        {entry.learner.name}
                      </div>
                      {entry.learner.lrn && (
                        <div className="text-[10px] text-muted-foreground">
                          {entry.learner.lrn}
                        </div>
                      )}
                    </td>
                    <td className="app__table_td">
                      {entry.score.correctCount} / {entry.score.scorableCount}
                    </td>
                    <td className="app__table_td">
                      {entry.score.percentage.toFixed(1)}%
                    </td>
                    <td className="app__table_td">
                      {entry.score.points} / {entry.score.maxPoints}
                    </td>
                    <td className="app__table_td">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          entry.row.scanSource === "scan"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {entry.row.scanSource === "scan"
                          ? "Scanned"
                          : "Encoded"}
                      </span>
                    </td>
                    <td className="app__table_td_actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handlePrint(entry.learner.id)}
                      >
                        <Printer className="mr-1.5 h-3.5 w-3.5" />
                        Slip
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {analysis && (
        <>
          <div className="rounded-lg border p-4">
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <h3 className="text-sm font-semibold">Item analysis</h3>
              <span className="text-xs text-muted-foreground">
                computed from these results
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
