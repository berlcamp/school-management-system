"use client";

/**
 * Scan answer sheets and score them.
 *
 * The flow is upload → decode → REVIEW → save, and the review step is not
 * optional. Optical mark recognition on school photocopies is good, not
 * infallible, and these are learner records: every sheet lands in a table where
 * the teacher can see what was read, fix any item, and reassign a sheet whose
 * ID block did not survive the scanner, before a single row is written.
 *
 * Nothing is saved per sheet as it decodes. One explicit Save writes the whole
 * batch, so an interrupted or misjudged scan leaves the stored results exactly
 * as they were.
 *
 * Scanned rows carry their raw answers (migration 132), which is what lets the
 * result slip show a learner the choice they actually made rather than only
 * that they got it wrong.
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
import { buildSheetLayout, choiceLetter } from "@/lib/omr/layout";
import { decodeImageData, MULTI_MARK } from "@/lib/omr/decode";
import { fileToPages, UnsupportedFileError } from "@/lib/omr/loadImage";
import {
  itemSpecsFromKey,
  scoreAnswers,
  type AnswerKeyItem,
  type SheetScore,
} from "@/lib/omr/score";
import { computeMps } from "@/lib/utils/itemAnalysis";
import { supabase } from "@/lib/supabase/client";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { Fragment, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

interface ScanScorePanelProps {
  examId: string;
  answerKey: AnswerKeyItem[];
  schoolYear: string;
  sections: RosterSection[];
  sectionId: string;
  onSectionChange: (id: string) => void;
  sectionsLoading: boolean;
  teacherId: string | number | null;
  fallbackSchoolId: number | null;
  onSaved: () => void;
}

interface ScannedSheet {
  key: string;
  label: string;
  /** Learner this sheet is attributed to; null until a human picks one. */
  studentId: number | null;
  /** True when the ID block decoded cleanly, false when a human assigned it. */
  autoMatched: boolean;
  answers: string[];
  flags: {
    rotated: boolean;
    idUnreadable: boolean;
    multiMarkItems: number[];
    blankItems: number[];
    lowConfidenceItems: number[];
  };
}

export function ScanScorePanel({
  examId,
  answerKey,
  schoolYear,
  sections,
  sectionId,
  onSectionChange,
  sectionsLoading,
  teacherId,
  fallbackSchoolId,
  onSaved,
}: ScanScorePanelProps) {
  const { learners } = useSectionRoster(sectionId, schoolYear);
  const [sheets, setSheets] = useState<ScannedSheet[]>([]);
  const [failures, setFailures] = useState<{ label: string; reason: string }[]>(
    [],
  );
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const section = sections.find((s) => s.id === sectionId);
  const learnerById = useMemo(
    () => new Map(learners.map((l) => [l.id, l])),
    [learners],
  );

  const layout = useMemo(() => {
    if (answerKey.length === 0) return null;
    try {
      return buildSheetLayout(itemSpecsFromKey(answerKey));
    } catch {
      return null;
    }
  }, [answerKey]);

  const scores = useMemo(() => {
    const map = new Map<string, SheetScore>();
    for (const sheet of sheets) {
      map.set(sheet.key, scoreAnswers(sheet.answers, answerKey));
    }
    return map;
  }, [sheets, answerKey]);

  /** A learner appearing on two sheets would silently overwrite themselves. */
  const duplicateStudentIds = useMemo(() => {
    const counts = new Map<number, number>();
    for (const sheet of sheets) {
      if (sheet.studentId == null) continue;
      counts.set(sheet.studentId, (counts.get(sheet.studentId) ?? 0) + 1);
    }
    return new Set(
      [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id),
    );
  }, [sheets]);

  const unassigned = sheets.filter((s) => s.studentId == null).length;
  const notInSection = sheets.filter(
    (s) => s.studentId != null && !learnerById.has(s.studentId),
  ).length;
  const blocked =
    unassigned > 0 || notInSection > 0 || duplicateStudentIds.size > 0;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!layout) {
      toast.error("Set the answer key before scanning — it defines the sheet.");
      return;
    }

    setScanning(true);
    setFailures([]);
    const fileList = Array.from(files);
    const nextSheets: ScannedSheet[] = [];
    const nextFailures: { label: string; reason: string }[] = [];
    let done = 0;
    let total = fileList.length;
    setProgress({ done, total });

    for (const file of fileList) {
      try {
        const pages = await fileToPages(file);
        // A multi-page PDF is a whole class in one file; count real pages.
        total += pages.length - 1;
        setProgress({ done, total });

        for (const page of pages) {
          const result = decodeImageData(page.image, layout);
          if (!result.ok) {
            nextFailures.push({ label: page.label, reason: result.reason });
          } else {
            nextSheets.push({
              key: `${page.label}#${nextSheets.length}`,
              label: page.label,
              studentId: result.sheet.studentId,
              autoMatched: result.sheet.studentId !== null,
              answers: result.sheet.answers,
              flags: result.sheet.flags,
            });
          }
          done += 1;
          setProgress({ done, total });
          // Yield so the progress counter paints between pages.
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      } catch (error) {
        nextFailures.push({
          label: file.name,
          reason:
            error instanceof UnsupportedFileError
              ? error.message
              : error instanceof Error
                ? error.message
                : String(error),
        });
        done += 1;
        setProgress({ done, total });
      }
    }

    setSheets((prev) => [...prev, ...nextSheets]);
    setFailures(nextFailures);
    setScanning(false);
    setProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (nextSheets.length > 0) {
      const matched = nextSheets.filter((s) => s.studentId !== null).length;
      toast.success(
        `Read ${nextSheets.length} sheet${nextSheets.length === 1 ? "" : "s"}; ${matched} matched to a learner automatically.`,
      );
    }
    if (nextFailures.length > 0) {
      toast.error(
        `${nextFailures.length} page${nextFailures.length === 1 ? "" : "s"} could not be read.`,
      );
    }
  };

  const assign = (sheetKey: string, studentId: number | null) =>
    setSheets((prev) =>
      prev.map((s) =>
        s.key === sheetKey ? { ...s, studentId, autoMatched: false } : s,
      ),
    );

  const overrideAnswer = (sheetKey: string, index: number, letter: string) =>
    setSheets((prev) =>
      prev.map((sheet) => {
        if (sheet.key !== sheetKey) return sheet;
        const answers = [...sheet.answers];
        answers[index] = answers[index] === letter ? "" : letter;
        const item = answerKey[index]?.itemNumber;
        return {
          ...sheet,
          answers,
          flags: {
            ...sheet.flags,
            // A hand-corrected item is no longer a machine uncertainty.
            multiMarkItems: sheet.flags.multiMarkItems.filter((n) => n !== item),
            blankItems: sheet.flags.blankItems.filter((n) => n !== item),
            lowConfidenceItems: sheet.flags.lowConfidenceItems.filter(
              (n) => n !== item,
            ),
          },
        };
      }),
    );

  const removeSheet = (sheetKey: string) =>
    setSheets((prev) => prev.filter((s) => s.key !== sheetKey));

  const handleSave = async () => {
    if (saving || sheets.length === 0) return;
    if (blocked) {
      toast.error("Fix the flagged sheets before saving.");
      return;
    }

    setSaving(true);
    try {
      const scorableCount =
        answerKey.filter((i) => i.correctAnswer).length || answerKey.length;
      const perSheet = sheets.map((sheet) => ({
        sheet,
        score: scores.get(sheet.key) as SheetScore,
      }));
      const mps = computeMps(
        perSheet.map((p) => p.score.correctCount),
        scorableCount,
      );

      const payload = {
        exam_id: Number(examId),
        section_id: Number(sectionId),
        school_id: section?.school_id ?? fallbackSchoolId,
        school_year: schoolYear,
        teacher_id: teacherId ?? null,
        total_items: scorableCount,
        mps,
      };

      // One administration per exam + section + school year (migration 101's
      // unique key), so re-scanning a class updates that row rather than
      // stacking a second set of results beside it.
      const { data: existing } = await supabase
        .from("sms_exam_results")
        .select("id")
        .eq("exam_id", Number(examId))
        .eq("section_id", Number(sectionId))
        .eq("school_year", schoolYear)
        .maybeSingle();

      let resultId = existing?.id ? String(existing.id) : null;
      if (resultId) {
        const { error } = await supabase
          .from("sms_exam_results")
          .update(payload)
          .eq("id", resultId);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase
          .from("sms_exam_results")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        resultId = String(data.id);
      }

      const { error: upsertError } = await supabase
        .from("sms_exam_result_students")
        .upsert(
          perSheet.map(({ sheet, score }) => ({
            result_id: Number(resultId),
            student_id: sheet.studentId as number,
            correct_items: score.correctItems,
            answers: sheet.answers,
            scan_source: "scan",
            scanned_at: new Date().toISOString(),
          })),
          { onConflict: "result_id,student_id" },
        );
      if (upsertError) throw new Error(upsertError.message);

      toast.success(
        `Saved ${perSheet.length} learner result${perSheet.length === 1 ? "" : "s"}. Class MPS ${mps.toFixed(2)}%.`,
      );
      setSheets([]);
      setFailures([]);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="space-y-1">
          <Label className="text-xs">Section</Label>
          <Select
            value={sectionId}
            onValueChange={(id) => {
              onSectionChange(id);
              setSheets([]);
              setFailures([]);
            }}
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

        <div className="space-y-1">
          <Label htmlFor="scan-files" className="text-xs">
            Scanned sheets
          </Label>
          <input
            ref={fileInputRef}
            id="scan-files"
            type="file"
            accept="image/*,application/pdf"
            multiple
            disabled={!sectionId || !layout || scanning}
            onChange={(e) => handleFiles(e.target.files)}
            className="block h-9 w-full max-w-md cursor-pointer rounded-md border border-input bg-background text-sm file:mr-3 file:h-9 file:cursor-pointer file:border-0 file:bg-muted file:px-3 file:text-sm"
          />
        </div>

        {sheets.length > 0 && (
          <Button
            variant="green"
            size="sm"
            className="ml-auto h-9"
            disabled={saving || blocked}
            onClick={handleSave}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Save {sheets.length} result{sheets.length === 1 ? "" : "s"}
          </Button>
        )}
      </div>

      {!layout && (
        <Callout tone="warn">
          Set the answer key first. It defines how many items the sheet has and
          how many circles each item was printed with, which is exactly what the
          scanner reads back.
        </Callout>
      )}

      {scanning && progress && (
        <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Reading sheet {progress.done} of {progress.total}…
        </div>
      )}

      {failures.length > 0 && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-900">
          <p className="mb-1 font-medium">
            {failures.length} page{failures.length === 1 ? "" : "s"} could not
            be read:
          </p>
          <ul className="list-inside list-disc space-y-0.5">
            {failures.map((f) => (
              <li key={f.label}>
                <span className="font-medium">{f.label}</span> — {f.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {blocked && sheets.length > 0 && (
        <Callout tone="warn">
          {unassigned > 0 && (
            <>
              {unassigned} sheet{unassigned === 1 ? "" : "s"} could not be
              matched to a learner — pick the learner from the dropdown.{" "}
            </>
          )}
          {notInSection > 0 && (
            <>
              {notInSection} sheet{notInSection === 1 ? "" : "s"} belong to a
              learner who is not in this section — check you selected the right
              section.{" "}
            </>
          )}
          {duplicateStudentIds.size > 0 && (
            <>
              {duplicateStudentIds.size} learner
              {duplicateStudentIds.size === 1 ? " has" : "s have"} two sheets.
              Remove the duplicate before saving.
            </>
          )}
        </Callout>
      )}

      {sheets.length > 0 && (
        <div className="app__table_container">
          <div className="app__table_wrapper">
            <table className="app__table">
              <thead className="app__table_thead">
                <tr>
                  <th className="app__table_th w-8" />
                  <th className="app__table_th">Sheet</th>
                  <th className="app__table_th">Learner</th>
                  <th className="app__table_th">Score</th>
                  <th className="app__table_th">Needs a look</th>
                  <th className="app__table_th_right">Actions</th>
                </tr>
              </thead>
              <tbody className="app__table_tbody">
                {sheets.map((sheet) => {
                  const score = scores.get(sheet.key) as SheetScore;
                  const learner =
                    sheet.studentId != null
                      ? learnerById.get(sheet.studentId)
                      : undefined;
                  const duplicate =
                    sheet.studentId != null &&
                    duplicateStudentIds.has(sheet.studentId);
                  const isOpen = expanded === sheet.key;
                  const issues =
                    sheet.flags.multiMarkItems.length +
                    sheet.flags.blankItems.length +
                    sheet.flags.lowConfidenceItems.length;

                  return (
                    <Fragment key={sheet.key}>
                      <tr className="app__table_tr">
                        <td className="app__table_td">
                          <button
                            type="button"
                            aria-label={
                              isOpen ? "Hide answers" : "Show answers"
                            }
                            onClick={() =>
                              setExpanded(isOpen ? null : sheet.key)
                            }
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className="app__table_td">
                          <div className="max-w-[220px] truncate text-xs">
                            {sheet.label}
                          </div>
                          {sheet.flags.rotated && (
                            <span className="text-[10px] text-muted-foreground">
                              read upside-down
                            </span>
                          )}
                        </td>
                        <td className="app__table_td">
                          <select
                            aria-label={`Learner for ${sheet.label}`}
                            value={sheet.studentId ?? ""}
                            onChange={(e) =>
                              assign(
                                sheet.key,
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                            className={`h-8 w-52 rounded-md border bg-background px-2 text-sm ${
                              sheet.studentId == null || !learner || duplicate
                                ? "border-red-400"
                                : "border-input"
                            }`}
                          >
                            <option value="">— not matched —</option>
                            {learners.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.name}
                              </option>
                            ))}
                          </select>
                          {sheet.autoMatched && learner && (
                            <span className="ml-1.5 inline-flex items-center text-[10px] text-green-700">
                              <CheckCircle2 className="mr-0.5 h-3 w-3" />
                              matched
                            </span>
                          )}
                          {duplicate && (
                            <div className="text-[10px] text-red-700">
                              duplicate sheet for this learner
                            </div>
                          )}
                        </td>
                        <td className="app__table_td">
                          <span className="font-medium">
                            {score.correctCount}
                          </span>
                          <span className="text-muted-foreground">
                            {" "}
                            / {score.scorableCount}
                          </span>
                          <div className="text-[10px] text-muted-foreground">
                            {score.percentage.toFixed(1)}%
                          </div>
                        </td>
                        <td className="app__table_td">
                          {issues === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          ) : (
                            <div className="space-y-0.5 text-[11px]">
                              {sheet.flags.multiMarkItems.length > 0 && (
                                <div className="text-red-700">
                                  two marks:{" "}
                                  {sheet.flags.multiMarkItems.join(", ")}
                                </div>
                              )}
                              {sheet.flags.blankItems.length > 0 && (
                                <div className="text-amber-700">
                                  blank: {sheet.flags.blankItems.join(", ")}
                                </div>
                              )}
                              {sheet.flags.lowConfidenceItems.length > 0 && (
                                <div className="text-muted-foreground">
                                  faint:{" "}
                                  {sheet.flags.lowConfidenceItems.join(", ")}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="app__table_td_actions">
                          <button
                            type="button"
                            aria-label={`Remove ${sheet.label}`}
                            onClick={() => removeSheet(sheet.key)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr>
                          <td colSpan={6} className="bg-muted/30 px-4 py-3">
                            <p className="mb-2 text-xs text-muted-foreground">
                              Click a letter to correct what was read. The key
                              is shown underneath each item.
                            </p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4 xl:grid-cols-6">
                              {answerKey.map((item, index) => {
                                const outcome = score.outcomes[index];
                                const response = sheet.answers[index] ?? "";
                                return (
                                  <div
                                    key={item.itemNumber}
                                    className="flex items-center gap-1.5 text-xs"
                                  >
                                    <span className="w-6 text-right text-muted-foreground">
                                      {item.itemNumber}.
                                    </span>
                                    <div className="flex gap-0.5">
                                      {Array.from(
                                        { length: item.choiceCount },
                                        (_, c) => {
                                          const letter = choiceLetter(c);
                                          const picked = response === letter;
                                          const isKey =
                                            item.correctAnswer === letter;
                                          return (
                                            <button
                                              key={letter}
                                              type="button"
                                              aria-label={`${sheet.label} item ${item.itemNumber} ${letter}`}
                                              onClick={() =>
                                                overrideAnswer(
                                                  sheet.key,
                                                  index,
                                                  letter,
                                                )
                                              }
                                              className={`h-5 w-5 rounded-full border text-[10px] font-semibold ${
                                                picked
                                                  ? outcome.status === "correct"
                                                    ? "border-green-700 bg-green-600 text-white"
                                                    : "border-red-700 bg-red-600 text-white"
                                                  : isKey
                                                    ? "border-green-600 text-green-700"
                                                    : "border-input text-muted-foreground"
                                              }`}
                                            >
                                              {letter}
                                            </button>
                                          );
                                        },
                                      )}
                                    </div>
                                    {response === MULTI_MARK && (
                                      <span className="text-red-700">?</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sheets.length === 0 && !scanning && layout && sectionId && (
        <div className="app__empty_state">
          <div className="app__empty_state_icon">
            <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
          </div>
          <p className="app__empty_state_title">No sheets scanned yet</p>
          <p className="app__empty_state_description">
            Scan or photograph the answer sheets and upload them above. Images
            and multi-page PDFs both work — one page per learner.
          </p>
        </div>
      )}
    </div>
  );
}

function Callout({
  tone,
  children,
}: {
  tone: "warn" | "info";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-md px-3 py-2 text-xs ${
        tone === "warn"
          ? "bg-amber-50 text-amber-900"
          : "bg-blue-50 text-blue-900"
      }`}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
