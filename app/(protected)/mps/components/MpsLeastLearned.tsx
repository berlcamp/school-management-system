"use client";

/**
 * Least Learned Competencies across the MPS dashboard's current filters.
 *
 * Item Analysis already reports MPS per competency (MELC) for one exam in one
 * section. This pools the same numbers over every result in scope: for each
 * TOS competency, correct answers ÷ (items × learners) summed across sections,
 * so a competency tested in four sections reads as one row. Exam structure and
 * learner marks are read on demand — only when this tab is opened — and cached
 * for the life of the page, since filters only ever narrow the same results.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { getGradeLevelLabel } from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import {
  loadExamCompetencyInputs,
  loadExamScorableItems,
} from "@/lib/utils/examCompetencies";
import {
  computeCompetencyStats,
  type AnalysisStudent,
  type CompetencyInput,
} from "@/lib/utils/itemAnalysis";
import { getMasteryLevel } from "@/lib/utils/mps";
import { getGradingPeriods } from "@/lib/utils/schoolYear";
import { Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";

/** Below this MPS a competency is not yet at Average Mastery (see getMasteryLevel). */
const LEAST_LEARNED_THRESHOLD = 75;

export interface MpsResultRef {
  resultId: string;
  examId: string;
  subjectName: string;
  gradeLevel: number;
  quarter: number;
  sectionName: string;
}

interface ExamStructure {
  competencies: CompetencyInput[];
}

interface LlcRow {
  key: string;
  subjectName: string;
  gradeLevel: number;
  quarter: number;
  lcCode: string | null;
  competencyText: string;
  itemCount: number;
  sections: string[];
  correct: number;
  total: number;
  mps: number;
}

const RESULT_CHUNK = 50;
const PAGE_SIZE = 1000;

/** Per-learner marks for the given results, paged past PostgREST's row cap. */
async function fetchMarks(
  resultIds: string[],
): Promise<Map<string, AnalysisStudent[]>> {
  const byResult = new Map<string, AnalysisStudent[]>();
  for (let i = 0; i < resultIds.length; i += RESULT_CHUNK) {
    const chunk = resultIds.slice(i, i + RESULT_CHUNK).map(Number);
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("sms_exam_result_students")
        .select("id, result_id, student_id, correct_items")
        .in("result_id", chunk)
        .order("id")
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      (data ?? []).forEach((r) => {
        const key = String(r.result_id);
        const list = byResult.get(key) ?? [];
        list.push({
          studentId: String(r.student_id),
          correctItems: new Set((r.correct_items ?? []) as number[]),
        });
        byResult.set(key, list);
      });
      if ((data ?? []).length < PAGE_SIZE) break;
    }
  }
  // A result with no learner rows still counts as loaded.
  resultIds.forEach((id) => {
    if (!byResult.has(id)) byResult.set(id, []);
  });
  return byResult;
}

export function MpsLeastLearned({
  results,
  schoolYear,
  loadingRows,
}: {
  results: MpsResultRef[];
  schoolYear: string;
  loadingRows: boolean;
}) {
  const examCache = useRef(new Map<string, ExamStructure>());
  const marksCache = useRef(new Map<string, AnalysisStudent[]>());
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Load whatever the current scope needs that is not cached yet.
  useEffect(() => {
    const examIds = Array.from(new Set(results.map((r) => r.examId))).filter(
      (id) => !examCache.current.has(id),
    );
    const resultIds = results
      .map((r) => r.resultId)
      .filter((id) => !marksCache.current.has(id));
    if (examIds.length === 0 && resultIds.length === 0) return;

    let active = true;
    setLoading(true);
    (async () => {
      try {
        const [structures, marks] = await Promise.all([
          Promise.all(
            examIds.map(async (examId) => {
              const items = await loadExamScorableItems(examId);
              const competencies =
                items.length > 0
                  ? await loadExamCompetencyInputs(examId, new Set(items))
                  : [];
              return [examId, { competencies }] as const;
            }),
          ),
          fetchMarks(resultIds),
        ]);
        structures.forEach(([id, s]) => examCache.current.set(id, s));
        marks.forEach((m, id) => marksCache.current.set(id, m));
        if (active) setVersion((v) => v + 1);
      } catch (err) {
        console.error("Error loading competency data:", err);
        toast.error("Failed to load least learned competencies");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      setLoading(false);
    };
  }, [results]);

  const { rows, unmapped } = useMemo(() => {
    void version; // re-run once the caches fill
    const groups = new Map<string, LlcRow & { sectionSet: Set<string> }>();
    const unmappedExams = new Set<string>();
    for (const ref of results) {
      const structure = examCache.current.get(ref.examId);
      const students = marksCache.current.get(ref.resultId);
      if (!structure || !students) continue;
      if (structure.competencies.length === 0) {
        unmappedExams.add(ref.examId);
        continue;
      }
      const stats = computeCompetencyStats(students, structure.competencies);
      stats.forEach((c) => {
        let g = groups.get(c.competencyId);
        if (!g) {
          g = {
            key: c.competencyId,
            subjectName: ref.subjectName,
            gradeLevel: ref.gradeLevel,
            quarter: ref.quarter,
            lcCode: c.lcCode,
            competencyText: c.competencyText,
            itemCount: c.itemCount,
            sections: [],
            sectionSet: new Set(),
            correct: 0,
            total: 0,
            mps: 0,
          };
          groups.set(c.competencyId, g);
        }
        g.correct += c.correct;
        g.total += c.total;
        g.itemCount = Math.max(g.itemCount, c.itemCount);
        g.sectionSet.add(ref.sectionName);
      });
    }
    const out: LlcRow[] = Array.from(groups.values())
      .filter((g) => g.total > 0)
      .map(({ sectionSet, ...g }) => ({
        ...g,
        sections: Array.from(sectionSet).sort((a, b) => a.localeCompare(b)),
        mps: Math.round((g.correct / g.total) * 100 * 100) / 100,
      }))
      .sort(
        (a, b) =>
          a.mps - b.mps ||
          a.subjectName.localeCompare(b.subjectName) ||
          a.quarter - b.quarter,
      );
    return { rows: out, unmapped: unmappedExams.size };
  }, [results, version]);

  const shown = showAll
    ? rows
    : rows.filter((r) => r.mps < LEAST_LEARNED_THRESHOLD);

  const periods = getGradingPeriods(schoolYear);
  const periodShort = (n: number) =>
    periods.find((p) => p.value === n)?.short ?? `#${n}`;

  const handleExport = () => {
    if (shown.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    const data = shown.map((r, idx) => ({
      "#": idx + 1,
      "School Year": schoolYear,
      "Grade Level": getGradeLevelLabel(r.gradeLevel),
      Subject: r.subjectName,
      Period: periodShort(r.quarter),
      "LC Code": r.lcCode ?? "",
      Competency: r.competencyText,
      Items: r.itemCount,
      Sections: r.sections.join(", "),
      MPS: r.mps.toFixed(2),
      Mastery: getMasteryLevel(r.mps).label,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Least Learned");
    XLSX.writeFile(
      wb,
      `Least_Learned_Competencies_${schoolYear.replace(/\s+/g, "_")}.xlsx`,
    );
  };

  const busy = loadingRows || loading;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Competencies (MELCs) with an MPS below {LEAST_LEARNED_THRESHOLD}% —
          under Average Mastery — pooled across every section in the current
          filters, lowest first. Narrow by section to see one class.
        </p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="llc-show-all"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            <Label htmlFor="llc-show-all" className="text-sm font-normal">
              Show all competencies
            </Label>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleExport}
            disabled={busy || shown.length === 0}
          >
            <Download className="mr-1.5 h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {busy && rows.length === 0 ? (
        <div className="rounded-lg border bg-background p-6 text-center text-sm text-muted-foreground">
          Loading...
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-lg border bg-background p-6 text-center text-sm text-muted-foreground">
          {rows.length > 0
            ? `Every competency in scope is at ${LEAST_LEARNED_THRESHOLD}% MPS or above.`
            : "No competency data for these filters. Competencies come from the exam's Table of Specifications."}
        </div>
      ) : (
        <div className="rounded-lg border bg-background overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium w-10">#</th>
                <th className="px-3 py-2 text-left font-medium">Subject</th>
                <th className="px-3 py-2 text-left font-medium">Grade Level</th>
                <th className="px-3 py-2 text-center font-medium w-16">
                  Period
                </th>
                <th className="px-3 py-2 text-left font-medium">Competency</th>
                <th className="px-3 py-2 text-center font-medium w-16">
                  Items
                </th>
                <th className="px-3 py-2 text-left font-medium">Sections</th>
                <th className="px-3 py-2 text-center font-medium w-20">MPS</th>
                <th className="px-3 py-2 text-left font-medium">Mastery</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((r, idx) => {
                const m = getMasteryLevel(r.mps);
                return (
                  <tr key={r.key} className="hover:bg-muted/40 align-top">
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2 font-medium">{r.subjectName}</td>
                    <td className="px-3 py-2">
                      {getGradeLevelLabel(r.gradeLevel)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {periodShort(r.quarter)}
                    </td>
                    <td className="px-3 py-2">
                      {r.lcCode && (
                        <span className="font-medium">{r.lcCode} — </span>
                      )}
                      {r.competencyText}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">
                      {r.itemCount}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.sections.join(", ")}
                    </td>
                    <td className="px-3 py-2 text-center font-semibold tabular-nums">
                      {r.mps.toFixed(2)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={`${m.colorClass} border`}
                      >
                        {m.label}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {unmapped > 0 && (
        <p className="text-xs text-muted-foreground">
          {unmapped} exam{unmapped > 1 ? "s" : ""} in scope could not be broken
          down by competency — no TOS competency mapping, or the paper is sealed
          by a release code you have not entered.
        </p>
      )}
    </div>
  );
}
