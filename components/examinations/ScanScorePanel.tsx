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
 * as they were. The workspace keeps this panel mounted for the same reason —
 * a closed Radix tab unmounts, and that used to throw the whole reviewed batch
 * away the moment a teacher looked at another tab.
 *
 * There is a second, phone-first way in: "Take photo" reads ONE sheet and
 * saves that learner on one tap, then asks for the next photo — a teacher
 * walking a stack of cut strips with a phone. The photo itself is never
 * uploaded: it lives in the browser as an object URL for the teacher to look at
 * while checking the reading, and is released the moment the next one is taken
 * or the page is left. Only the answers are stored.
 *
 * Every format the exam fits (whole page, ½ or ¼ strip) is tried on each image,
 * so nobody has to say which size was printed, and one scan holding several
 * strips — laid on a flatbed together, or an uncut page — yields one sheet per
 * strip.
 *
 * Scanned rows carry their raw answers (migration 132), which is what lets the
 * result slip show a learner the choice they actually made rather than only
 * that they got it wrong.
 */

import { Button } from "@/components/ui/button";
import type { RosterLearner } from "@/hooks/useExamRoster";
import {
  buildSheetLayout,
  choiceLetter,
  formatsForItemCount,
  type SheetLayout,
} from "@/lib/omr/layout";
import { decodeImageDataSheets, MULTI_MARK } from "@/lib/omr/decode";
import { fileToPages, UnsupportedFileError } from "@/lib/omr/loadImage";
import {
  itemSpecsFromKey,
  scoreAnswers,
  type AnswerKeyItem,
  type SheetScore,
} from "@/lib/omr/score";
import { computeMps } from "@/lib/utils/itemAnalysis";
import { groupLearnersBySex } from "@/lib/utils/learnerSex";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Save,
  ScanLine,
  Trash2,
  Upload,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ExamNotice } from "./ExamNotice";

interface ScanScorePanelProps {
  examId: string;
  answerKey: AnswerKeyItem[];
  schoolYear: string;
  sectionId: string;
  sectionSchoolId: number | null;
  learners: RosterLearner[];
  teacherId: string | number | null;
  fallbackSchoolId: number | null;
  /** A school head viewing a section they do not teach: no scanning, no save. */
  readOnly?: boolean;
  /** `stay` = keep this step open (the phone flow, one learner at a time). */
  onSaved: (options?: { stay?: boolean }) => void;
  onDraftChange: (draft: { sheets: number; needsAttention: number }) => void;
  onGoToStep: (step: string) => void;
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

/** A sheet read from a phone photo, waiting for its one-tap save. */
interface CameraSheet extends ScannedSheet {
  /** Object URL of the photo — in memory only, revoked when done with. */
  photoUrl: string;
}

export function ScanScorePanel({
  examId,
  answerKey,
  schoolYear,
  sectionId,
  sectionSchoolId,
  learners,
  teacherId,
  fallbackSchoolId,
  readOnly = false,
  onSaved,
  onDraftChange,
  onGoToStep,
}: ScanScorePanelProps) {
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
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const keySeq = useRef(0);
  const nextKey = (label: string) => `${label}#${(keySeq.current += 1)}`;

  // Phone flow: the sheet(s) read from the latest photo, one saved at a time.
  const [camera, setCamera] = useState<CameraSheet[]>([]);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraSaving, setCameraSaving] = useState(false);
  const [cameraFailure, setCameraFailure] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<{
    name: string;
    correct: number;
    total: number;
  } | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  /** Learners who already have a saved result for this exam in this section. */
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  const learnerById = useMemo(
    () => new Map(learners.map((l) => [l.id, l])),
    [learners],
  );
  /** The picker's options, MALE then FEMALE. Display only — matching is by id. */
  const learnerGroups = useMemo(
    () =>
      groupLearnersBySex(learners, (l) => l.gender).filter(
        (g) => g.rows.length > 0,
      ),
    [learners],
  );

  // A batch belongs to the class it was scanned against. Changing either the
  // section or the school year changes who the sheets would be saved for, so
  // the reviewed batch is dropped rather than silently re-pointed.
  useEffect(() => {
    setSheets([]);
    setFailures([]);
    setExpanded(null);
    setCamera((prev) => {
      prev.forEach((c) => URL.revokeObjectURL(c.photoUrl));
      return [];
    });
    setCameraFailure(null);
    setLastSaved(null);
  }, [sectionId, schoolYear]);

  // Release any photo still held when the panel goes away.
  const cameraRef = useRef<CameraSheet[]>([]);
  cameraRef.current = camera;
  useEffect(
    () => () => cameraRef.current.forEach((c) => URL.revokeObjectURL(c.photoUrl)),
    [],
  );

  const refreshSavedIds = useCallback(async () => {
    if (!examId || !sectionId || !schoolYear) {
      setSavedIds(new Set());
      return;
    }
    const { data: result } = await supabase
      .from("sms_exam_results")
      .select("id")
      .eq("exam_id", Number(examId))
      .eq("section_id", Number(sectionId))
      .eq("school_year", schoolYear)
      .maybeSingle();
    if (!result?.id) {
      setSavedIds(new Set());
      return;
    }
    const { data: rows } = await supabase
      .from("sms_exam_result_students")
      .select("student_id")
      .eq("result_id", result.id);
    setSavedIds(new Set((rows ?? []).map((r) => Number(r.student_id))));
  }, [examId, sectionId, schoolYear]);

  useEffect(() => {
    void refreshSavedIds();
  }, [refreshSavedIds]);

  /** One layout per sheet size this exam fits; each image is tried against all. */
  const layout = useMemo((): SheetLayout[] | null => {
    if (answerKey.length === 0) return null;
    try {
      const specs = itemSpecsFromKey(answerKey);
      const layouts = formatsForItemCount(specs.length).map((f) =>
        buildSheetLayout(specs, f),
      );
      return layouts.length > 0 ? layouts : null;
    } catch {
      return null;
    }
  }, [answerKey]);

  const scores = useMemo(() => {
    const map = new Map<string, SheetScore>();
    for (const sheet of [...sheets, ...camera]) {
      map.set(sheet.key, scoreAnswers(sheet.answers, answerKey));
    }
    return map;
  }, [sheets, camera, answerKey]);

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
  const needsAttention =
    unassigned + notInSection + duplicateStudentIds.size;

  // The rail speaks for this step while it is hidden, so it needs the count.
  useEffect(() => {
    onDraftChange({ sheets: sheets.length, needsAttention });
  }, [sheets.length, needsAttention, onDraftChange]);

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
          const result = decodeImageDataSheets(page.image, layout);
          if (!result.ok) {
            nextFailures.push({ label: page.label, reason: result.reason });
          } else {
            // Several strips in one scan each become their own row.
            result.sheets.forEach((decoded, i) => {
              const label =
                result.sheets.length > 1
                  ? `${page.label} — strip ${i + 1}`
                  : page.label;
              nextSheets.push({
                key: nextKey(label),
                label,
                studentId: decoded.studentId,
                autoMatched: decoded.studentId !== null,
                answers: decoded.answers,
                flags: decoded.flags,
              });
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

  /** Apply an edit to a sheet wherever it is — the batch or the phone card. */
  const updateSheet = (
    sheetKey: string,
    edit: <T extends ScannedSheet>(sheet: T) => T,
  ) => {
    setSheets((prev) => prev.map((s) => (s.key === sheetKey ? edit(s) : s)));
    setCamera((prev) => prev.map((s) => (s.key === sheetKey ? edit(s) : s)));
  };

  const assign = (sheetKey: string, studentId: number | null) =>
    updateSheet(sheetKey, (s) => ({ ...s, studentId, autoMatched: false }));

  const overrideAnswer = (sheetKey: string, index: number, letter: string) =>
    updateSheet(sheetKey, (sheet) => {
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
    });

  const removeSheet = (sheetKey: string) =>
    setSheets((prev) => prev.filter((s) => s.key !== sheetKey));

  /**
   * Write learners' results and bring the class header up to date.
   *
   * The header's MPS is recomputed from EVERY stored learner after the write,
   * not from the sheets just saved: with one photo saved at a time, a batch-only
   * MPS would describe the last learner alone, and a class scanned in two
   * sittings would describe only the second.
   */
  const persistResults = async (
    list: { sheet: ScannedSheet; score: SheetScore }[],
  ): Promise<number> => {
    const scorableCount =
      answerKey.filter((i) => i.correctAnswer).length || answerKey.length;
    const payload = {
      exam_id: Number(examId),
      section_id: Number(sectionId),
      school_id: sectionSchoolId ?? fallbackSchoolId,
      school_year: schoolYear,
      teacher_id: teacherId ?? null,
      total_items: scorableCount,
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
        .insert({
          ...payload,
          mps: computeMps(
            list.map((p) => p.score.correctCount),
            scorableCount,
          ),
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      resultId = String(data.id);
    }

    const { error: upsertError } = await supabase
      .from("sms_exam_result_students")
      .upsert(
        list.map(({ sheet, score }) => ({
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

    const { data: stored, error: storedError } = await supabase
      .from("sms_exam_result_students")
      .select("correct_items")
      .eq("result_id", Number(resultId));
    if (storedError) throw new Error(storedError.message);
    const mps = computeMps(
      (stored ?? []).map((r) => ((r.correct_items ?? []) as number[]).length),
      scorableCount,
    );
    const { error: mpsError } = await supabase
      .from("sms_exam_results")
      .update({ mps })
      .eq("id", resultId);
    if (mpsError) throw new Error(mpsError.message);
    return mps;
  };

  const handleSave = async () => {
    if (saving || readOnly || sheets.length === 0) return;
    if (blocked) {
      toast.error("Fix the flagged sheets before saving.");
      return;
    }

    setSaving(true);
    try {
      const perSheet = sheets.map((sheet) => ({
        sheet,
        score: scores.get(sheet.key) as SheetScore,
      }));
      const mps = await persistResults(perSheet);
      toast.success(
        `Saved ${perSheet.length} learner result${perSheet.length === 1 ? "" : "s"}. Class MPS ${mps.toFixed(2)}%.`,
      );
      setSheets([]);
      setFailures([]);
      void refreshSavedIds();
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  // --- phone flow ----------------------------------------------------------

  const releaseCamera = () =>
    setCamera((prev) => {
      prev.forEach((c) => URL.revokeObjectURL(c.photoUrl));
      return [];
    });

  const handlePhoto = async (files: FileList | null) => {
    const file = files?.[0];
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (!file || !layout) return;
    releaseCamera();
    setCameraFailure(null);
    setLastSaved(null);
    setShowPhoto(false);
    setCameraBusy(true);
    try {
      const pages = await fileToPages(file);
      const read: CameraSheet[] = [];
      // One object URL per photo; every sheet read from it shares it, and it
      // is revoked once (releaseCamera revokes duplicates harmlessly).
      const photoUrl = URL.createObjectURL(file);
      for (const page of pages) {
        const result = decodeImageDataSheets(page.image, layout);
        if (!result.ok) {
          setCameraFailure(result.reason);
          continue;
        }
        result.sheets.forEach((decoded, i) => {
          const label =
            result.sheets.length > 1 ? `Photo — strip ${i + 1}` : "Photo";
          read.push({
            key: nextKey(label),
            label,
            studentId: decoded.studentId,
            autoMatched: decoded.studentId !== null,
            answers: decoded.answers,
            flags: decoded.flags,
            photoUrl,
          });
        });
      }
      if (read.length === 0) {
        URL.revokeObjectURL(photoUrl);
        setCameraFailure((prev) => prev ?? "No answer sheet was found in that photo.");
      } else {
        setCameraFailure(null);
        setCamera(read);
      }
    } catch (error) {
      setCameraFailure(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setCameraBusy(false);
    }
  };

  const current = camera[0] ?? null;
  const currentScore = current ? scores.get(current.key) ?? null : null;
  const currentLearner =
    current?.studentId != null ? learnerById.get(current.studentId) : undefined;
  const currentMultiMarks = current
    ? current.answers.filter((a) => a === MULTI_MARK).length
    : 0;
  const currentBlocked =
    !current || !currentLearner || currentMultiMarks > 0;

  const saveCurrent = async () => {
    if (!current || !currentScore || currentBlocked || cameraSaving || readOnly) {
      return;
    }
    setCameraSaving(true);
    try {
      await persistResults([{ sheet: current, score: currentScore }]);
      setLastSaved({
        name: currentLearner?.name ?? "Learner",
        correct: currentScore.correctCount,
        total: currentScore.scorableCount,
      });
      setShowPhoto(false);
      setCamera((prev) => {
        const [done, ...rest] = prev;
        // The photo is shared by every strip read from it; free it with the last.
        if (done && !rest.some((r) => r.photoUrl === done.photoUrl)) {
          URL.revokeObjectURL(done.photoUrl);
        }
        return rest;
      });
      void refreshSavedIds();
      onSaved({ stay: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setCameraSaving(false);
    }
  };

  const skipCurrent = () =>
    setCamera((prev) => {
      const [done, ...rest] = prev;
      if (done && !rest.some((r) => r.photoUrl === done.photoUrl)) {
        URL.revokeObjectURL(done.photoUrl);
      }
      return rest;
    });

  if (!layout) {
    return (
      <ExamNotice
        tone="warn"
        title="Set the answer key first"
        action={
          <Button size="sm" variant="outline" onClick={() => onGoToStep("key")}>
            Go to the answer key
          </Button>
        }
      >
        The key defines how many items the sheet has and how many circles each
        item was printed with, which is exactly what the scanner reads back.
      </ExamNotice>
    );
  }

  if (!sectionId) {
    return (
      <div className="app__empty_state">
        <div className="app__empty_state_icon">
          <ScanLine className="mx-auto h-10 w-10" />
        </div>
        <p className="app__empty_state_title">Choose a section first</p>
        <p className="app__empty_state_description">
          Scanned sheets are matched against one class list and saved for that
          section. Pick it in the Section box above.
        </p>
      </div>
    );
  }

  if (readOnly) {
    return (
      <ExamNotice tone="info" title="View only for this section">
        Results for this class are scanned and saved by its teacher. You can
        print its answer sheets and read its saved results on the Results tab.
      </ExamNotice>
    );
  }

  const canDrop = !scanning && !saving;

  const currentIssues = current
    ? {
        blank: current.flags.blankItems,
        faint: current.flags.lowConfidenceItems,
        multi: current.answers
          .map((a, i) => (a === MULTI_MARK ? answerKey[i]?.itemNumber : null))
          .filter((n): n is number => n != null),
      }
    : null;

  return (
    <div className="space-y-4">
      {/* Phone flow: one photo, one learner, one tap to save. */}
      <div className="rounded-lg border bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Take a photo of each sheet</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              One sheet per photo, all four black squares in the frame. Each
              one is saved as soon as you tap Save — the photo itself is not
              kept.
            </p>
          </div>
          <Button
            type="button"
            variant={current ? "outline" : "green"}
            className="h-11 w-full sm:h-9 sm:w-auto"
            disabled={cameraBusy || cameraSaving || scanning || saving}
            onClick={() => cameraInputRef.current?.click()}
          >
            {cameraBusy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Camera className="mr-1.5 h-4 w-4" />
            )}
            {cameraBusy
              ? "Reading…"
              : current
                ? "Retake photo"
                : lastSaved
                  ? "Take next photo"
                  : "Take photo"}
          </Button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Photo of an answer sheet"
            className="sr-only"
            onChange={(e) => void handlePhoto(e.target.files)}
          />
        </div>

        {lastSaved && !current && (
          <p className="mt-3 flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              Saved <span className="font-medium">{lastSaved.name}</span> —{" "}
              {lastSaved.correct} / {lastSaved.total}.
            </span>
          </p>
        )}

        {cameraFailure && !current && (
          <div className="mt-3">
            <ExamNotice tone="danger" title="That photo could not be read">
              {cameraFailure} Retake it closer and straighter, in good light.
            </ExamNotice>
          </div>
        )}

        {current && currentScore && currentIssues && (
          <div className="mt-3 space-y-3 border-t pt-3">
            {camera.length > 1 && (
              <p className="text-xs text-muted-foreground">
                This photo holds {camera.length} sheets — saving them one at a
                time.
              </p>
            )}
            <div className="flex flex-wrap items-start gap-3">
              <button
                type="button"
                onClick={() => setShowPhoto((v) => !v)}
                className="shrink-0 overflow-hidden rounded-md border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                aria-label={showPhoto ? "Shrink the photo" : "Enlarge the photo"}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- an in-memory object URL, never a hosted image */}
                <img
                  src={current.photoUrl}
                  alt="The photographed answer sheet"
                  className={cn(
                    "object-contain bg-muted",
                    showPhoto ? "max-h-[70vh] w-full" : "h-28 w-20",
                  )}
                />
              </button>
              <div className="min-w-0 flex-1 space-y-2">
                <select
                  aria-label="Learner for this photo"
                  value={current.studentId ?? ""}
                  onChange={(e) =>
                    assign(
                      current.key,
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                  className={cn(
                    "h-10 w-full rounded-md border bg-background px-2 text-sm sm:h-9",
                    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                    !currentLearner ? "border-red-400 bg-red-50/60" : "border-input",
                  )}
                >
                  <option value="">— pick the learner —</option>
                  {current.studentId != null && !currentLearner && (
                    <option value={current.studentId}>
                      {`— learner code ${current.studentId}, not in this section —`}
                    </option>
                  )}
                  {learnerGroups.map((g) => (
                    <optgroup key={g.key} label={`${g.label} (${g.rows.length})`}>
                      {g.rows.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <p className="text-sm">
                  <span className="text-2xl font-semibold tabular-nums">
                    {currentScore.correctCount}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {" "}
                    / {currentScore.scorableCount} ·{" "}
                    {currentScore.percentage.toFixed(1)}%
                  </span>
                </p>
                {current.autoMatched && currentLearner && (
                  <p className="flex items-center text-xs text-emerald-700">
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    Matched by the learner code
                  </p>
                )}
                {current.studentId != null && savedIds.has(current.studentId) && (
                  <p className="text-xs text-amber-700">
                    This learner already has a saved result — saving replaces it.
                  </p>
                )}
              </div>
            </div>

            {(currentIssues.multi.length > 0 ||
              currentIssues.blank.length > 0 ||
              currentIssues.faint.length > 0 ||
              current.flags.rotated) && (
              <div className="space-y-0.5 text-xs">
                {currentIssues.multi.length > 0 && (
                  <p className="font-medium text-red-700">
                    Two marks on item{currentIssues.multi.length === 1 ? "" : "s"}{" "}
                    {currentIssues.multi.join(", ")} — open &ldquo;Check or
                    correct the answers&rdquo; and tap the learner&apos;s real
                    answer.
                  </p>
                )}
                {currentIssues.blank.length > 0 && (
                  <p className="text-amber-700">
                    Blank: {currentIssues.blank.join(", ")}
                  </p>
                )}
                {currentIssues.faint.length > 0 && (
                  <p className="text-muted-foreground">
                    Faint, worth a look: {currentIssues.faint.join(", ")}
                  </p>
                )}
                {current.flags.rotated && (
                  <p className="text-muted-foreground">Read upside-down.</p>
                )}
              </div>
            )}

            <details className="rounded-md border bg-muted/30 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium">
                Check or correct the answers
              </summary>
              <p className="mb-2 mt-1.5 text-xs text-muted-foreground">
                Tap a letter to change what was read. A hollow green circle is
                the key; a filled circle is what the learner marked.
              </p>
              <AnswerCorrectionGrid
                sheet={current}
                score={currentScore}
                answerKey={answerKey}
                onPick={(index, letter) => overrideAnswer(current.key, index, letter)}
              />
            </details>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="green"
                className="h-11 sm:h-9"
                disabled={currentBlocked || cameraSaving}
                onClick={() => void saveCurrent()}
              >
                {cameraSaving ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-4 w-4" />
                )}
                Save{currentLearner ? ` ${currentLearner.name}` : ""}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 sm:h-9"
                disabled={cameraSaving}
                onClick={skipCurrent}
              >
                Discard this reading
              </Button>
            </div>
            {currentBlocked && (
              <p className="text-xs text-red-700">
                {!currentLearner
                  ? "Pick the learner this sheet belongs to before saving."
                  : "Resolve the items with two marks before saving."}
              </p>
            )}
          </div>
        )}
      </div>

      <div
        onDragOver={(e) => {
          if (!canDrop) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (!canDrop) return;
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-lg border border-dashed p-5 text-center transition-colors",
          dragging
            ? "border-emerald-500 bg-emerald-50"
            : "border-border bg-card",
        )}
      >
        <Upload
          className={cn(
            "mx-auto mb-2 h-7 w-7",
            dragging ? "text-emerald-600" : "text-muted-foreground",
          )}
          aria-hidden
        />
        <p className="text-sm font-medium">
          Or upload scans: drop them here, or choose the files
        </p>
        <p className="mx-auto mt-1 max-w-prose text-xs text-muted-foreground">
          Photos and multi-page PDFs both work — whole sheets, cut ½ or ¼
          strips, several strips on one scan. Nothing is saved until you review
          the batch and press Save.
        </p>
        <input
          ref={fileInputRef}
          id="scan-files"
          aria-label="Scanned sheets"
          type="file"
          accept="image/*,application/pdf"
          multiple
          disabled={!canDrop}
          onChange={(e) => handleFiles(e.target.files)}
          className="sr-only"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-3"
          disabled={!canDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          Choose files…
        </Button>
      </div>

      {scanning && progress && (
        <div className="space-y-2 rounded-lg border bg-card p-3.5">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="font-medium">
              Reading sheet {progress.done} of {progress.total}…
            </span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            aria-label="Sheets read"
          >
            <div
              className="h-full rounded-full bg-emerald-600 transition-[width] duration-200 ease-out"
              style={{
                width: `${(progress.done / Math.max(progress.total, 1)) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {failures.length > 0 && (
        <ExamNotice
          tone="danger"
          title={`${failures.length} page${failures.length === 1 ? "" : "s"} could not be read`}
        >
          <ul className="space-y-0.5">
            {failures.map((f) => (
              <li key={f.label}>
                <span className="font-medium">{f.label}</span> — {f.reason}
              </li>
            ))}
          </ul>
        </ExamNotice>
      )}

      {blocked && sheets.length > 0 && (
        <ExamNotice
          tone="warn"
          title={`${needsAttention} sheet${needsAttention === 1 ? "" : "s"} need a look before this can be saved`}
        >
          <ul className="space-y-0.5">
            {unassigned > 0 && (
              <li>
                {unassigned} sheet{unassigned === 1 ? "" : "s"} could not be
                matched to a learner — pick the learner in the row below.
              </li>
            )}
            {notInSection > 0 && (
              <li>
                {notInSection} sheet{notInSection === 1 ? "" : "s"} belong to a
                learner who is not in this section — check you picked the right
                one.
              </li>
            )}
            {duplicateStudentIds.size > 0 && (
              <li>
                {duplicateStudentIds.size} learner
                {duplicateStudentIds.size === 1 ? " has" : "s have"} two sheets.
                Remove the duplicate before saving.
              </li>
            )}
          </ul>
        </ExamNotice>
      )}

      {sheets.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border bg-card p-3.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {sheets.length} sheet{sheets.length === 1 ? "" : "s"} read,
                nothing saved yet
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Check the learner and the score on each row, correct anything the
                scanner misread, then save the batch in one go.
              </p>
            </div>
            <Button
              variant="green"
              size="sm"
              className="h-9"
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
          </div>

          <div className="app__table_container">
            <div className="app__table_wrapper">
              <table className="app__table">
                <thead className="app__table_thead">
                  <tr>
                    <th className="app__table_th w-8">
                      <span className="sr-only">Show answers</span>
                    </th>
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
                              aria-expanded={isOpen}
                              aria-label={
                                isOpen
                                  ? `Hide the answers read from ${sheet.label}`
                                  : `Show the answers read from ${sheet.label}`
                              }
                              onClick={() =>
                                setExpanded(isOpen ? null : sheet.key)
                              }
                              className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
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
                              <span className="text-[11px] text-muted-foreground">
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
                                  e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                )
                              }
                              className={cn(
                                "h-8 w-52 rounded-md border bg-background px-2 text-sm",
                                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                                sheet.studentId == null ||
                                  !learner ||
                                  duplicate
                                  ? "border-red-400 bg-red-50/60"
                                  : "border-input",
                              )}
                            >
                              <option value="">— not matched —</option>
                              {sheet.studentId != null && !learner && (
                                // The sheet DID decode an id; it is simply not
                                // one of this section's learners. Showing "not
                                // matched" here contradicted the notice above.
                                <option value={sheet.studentId}>
                                  {`— learner code ${sheet.studentId}, not in this section —`}
                                </option>
                              )}
                              {learnerGroups.map((g) => (
                                <optgroup
                                  key={g.key}
                                  label={`${g.label} (${g.rows.length})`}
                                >
                                  {g.rows.map((l) => (
                                    <option key={l.id} value={l.id}>
                                      {l.name}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                            {sheet.autoMatched && learner && (
                              <span className="ml-1.5 inline-flex items-center text-[11px] text-emerald-700">
                                <CheckCircle2 className="mr-0.5 h-3 w-3" />
                                matched
                              </span>
                            )}
                            {duplicate && (
                              <div className="text-[11px] font-medium text-red-700">
                                duplicate sheet for this learner
                              </div>
                            )}
                          </td>
                          <td className="app__table_td">
                            <span className="font-medium tabular-nums">
                              {score.correctCount}
                            </span>
                            <span className="text-muted-foreground tabular-nums">
                              {" "}
                              / {score.scorableCount}
                            </span>
                            <div className="text-[11px] text-muted-foreground tabular-nums">
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
                            <div className="app__table_action_container">
                              <button
                                type="button"
                                aria-label={`Remove ${sheet.label} from this batch`}
                                onClick={() => removeSheet(sheet.key)}
                                className="rounded-sm p-1 text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isOpen && (
                          <tr>
                            <td colSpan={6} className="bg-muted/30 px-4 py-3">
                              <p className="mb-2.5 text-xs text-muted-foreground">
                                Click a letter to correct what was read. A
                                hollow green circle is the key; a filled circle
                                is what this learner marked.
                              </p>
                              <AnswerCorrectionGrid
                                sheet={sheet}
                                score={score}
                                answerKey={answerKey}
                                onPick={(index, letter) =>
                                  overrideAnswer(sheet.key, index, letter)
                                }
                              />
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
        </>
      )}

      {sheets.length === 0 && !scanning && failures.length === 0 && (
        <div className="rounded-lg border bg-card p-3.5">
          <p className="mb-1.5 text-sm font-semibold">Getting a clean read</p>
          <ul className="space-y-1 text-[0.8125rem] leading-relaxed text-muted-foreground">
            <li className="flex gap-2">
              <span aria-hidden className="text-foreground">
                —
              </span>
              <span>
                All four black corner squares must be in frame and unmarked —
                they are what lets a crooked or hand-held photo be read.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-foreground">
                —
              </span>
              <span>
                Upside-down is fine, and so is a phone photo. No particular DPI
                is needed.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-foreground">
                —
              </span>
              <span>
                Anything the scanner is unsure of is flagged for you rather than
                guessed.
              </span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * One button per choice per item: tap a letter to correct what was read, tap
 * the marked letter again to clear it. The key shows as a hollow green circle;
 * the learner's choice is filled — green when right, red when wrong.
 */
function AnswerCorrectionGrid({
  sheet,
  score,
  answerKey,
  onPick,
}: {
  sheet: ScannedSheet;
  score: SheetScore;
  answerKey: AnswerKeyItem[];
  onPick: (index: number, letter: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4 xl:grid-cols-6">
      {answerKey.map((item, index) => {
        const outcome = score.outcomes[index];
        const response = sheet.answers[index] ?? "";
        return (
          <div key={item.itemNumber} className="flex items-center gap-1.5 text-xs">
            <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">
              {item.itemNumber}.
            </span>
            <div className="flex gap-1 sm:gap-0.5">
              {Array.from({ length: item.choiceCount }, (_, c) => {
                const letter = choiceLetter(c);
                const picked = response === letter;
                const isKey = item.correctAnswer === letter;
                return (
                  <button
                    key={letter}
                    type="button"
                    aria-label={`${sheet.label} item ${item.itemNumber} ${letter}`}
                    aria-pressed={picked}
                    onClick={() => onPick(index, letter)}
                    className={cn(
                      "h-7 w-7 rounded-full border text-[11px] font-semibold transition-colors sm:h-5 sm:w-5 sm:text-[10px]",
                      "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                      picked
                        ? outcome.status === "correct"
                          ? "border-emerald-700 bg-emerald-600 text-white"
                          : "border-red-700 bg-red-600 text-white"
                        : isKey
                          ? "border-emerald-600 text-emerald-700"
                          : "border-input text-muted-foreground hover:border-foreground/40",
                    )}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
            {response === MULTI_MARK && (
              <span
                className="font-semibold text-red-700"
                title="Two marks were read for this item"
              >
                ?
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
