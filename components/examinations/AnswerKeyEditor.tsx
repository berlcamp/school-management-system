"use client";

/**
 * Answer key editor — the flat item-number → letter key an exam is scored on.
 *
 * Built for speed of entry above all else, because a teacher with a paper exam
 * and 50 answers should be done in under a minute:
 *   - "Paste key" takes a run of letters or a numbered list straight from a
 *     document, which is how most keys already exist;
 *   - the grid is click-to-set, and typing A–E on a focused item sets it and
 *     moves to the next, so a whole key can be entered without the mouse;
 *   - "Prefill from exam questions" pulls the answers out of the Exam Builder
 *     when the exam was authored there, so nothing is retyped.
 *
 * Per-item choice counts and per-item points are real but rare — almost every
 * exam is uniform, and set from the two controls at the top. They are folded
 * behind "Per-item choices & points" so the common key is a column of item
 * numbers and letters and nothing else; 50 rows of two extra controls each is
 * 100 controls a teacher has to read past to find the one they wanted.
 *
 * Read-only for a teacher looking at a division-authored exam: the exam is not
 * theirs to change, and a locally-diverging key would silently mis-score every
 * school that shares it.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { choiceLetter, MAX_ITEMS } from "@/lib/omr/layout";
import type { AnswerKeyItem } from "@/lib/omr/score";
import {
  DEFAULT_CHOICE_COUNT,
  DEFAULT_POINTS,
  deriveAnswerKeyFromQuestions,
  parseKeyText,
  persistAnswerKey,
  resizeAnswerKey,
} from "@/lib/utils/examAnswerKey";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardPaste,
  Eraser,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ExamNotice } from "./ExamNotice";

interface AnswerKeyEditorProps {
  examId: string;
  answerKey: AnswerKeyItem[];
  canEdit: boolean;
  onChange: (key: AnswerKeyItem[]) => void;
  onSaved: (key: AnswerKeyItem[]) => void;
  /** Offered once the key is saved — the next step in the workspace. */
  onContinue?: () => void;
}

/** Identity of a key for the unsaved-changes check. Order is significant. */
const fingerprint = (key: AnswerKeyItem[]) =>
  key
    .map((i) => `${i.itemNumber}:${i.correctAnswer ?? ""}:${i.choiceCount}:${i.points}`)
    .join("|");

export function AnswerKeyEditor({
  examId,
  answerKey,
  canEdit,
  onChange,
  onSaved,
  onContinue,
}: AnswerKeyEditorProps) {
  const [saving, setSaving] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [itemCountDraft, setItemCountDraft] = useState(
    String(answerKey.length || 50),
  );
  const [bulkChoices, setBulkChoices] = useState(String(DEFAULT_CHOICE_COUNT));
  // What is on the server. Compared rather than tracked with a dirty flag so
  // that undoing a change by hand correctly reads as saved again.
  const [savedPrint, setSavedPrint] = useState(() => fingerprint(answerKey));
  const bubbleRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const keyed = useMemo(
    () => answerKey.filter((i) => i.correctAnswer).length,
    [answerKey],
  );
  const totalPoints = useMemo(
    () =>
      answerKey
        .filter((i) => i.correctAnswer)
        .reduce((sum, i) => sum + i.points, 0),
    [answerKey],
  );
  const dirty = fingerprint(answerKey) !== savedPrint;
  const complete = answerKey.length > 0 && keyed === answerKey.length;

  const applyItemCount = () => {
    const count = Number(itemCountDraft);
    if (!Number.isFinite(count) || count < 1) {
      toast.error("Enter how many items this exam has.");
      return;
    }
    if (count > MAX_ITEMS) {
      toast.error(
        `An answer sheet holds ${MAX_ITEMS} items. Split a longer exam into two versions.`,
      );
      return;
    }
    onChange(
      resizeAnswerKey(answerKey, count, Number(bulkChoices), DEFAULT_POINTS),
    );
  };

  /** Direct set — used by the keyboard, where toggling would be a surprise. */
  const setAnswerAt = useCallback(
    (index: number, letter: string | null) => {
      const next = [...answerKey];
      next[index] = { ...next[index], correctAnswer: letter };
      onChange(next);
    },
    [answerKey, onChange],
  );

  /** Click — clicking the letter already set clears it. */
  const toggleAnswer = (index: number, letter: string) =>
    setAnswerAt(index, answerKey[index].correctAnswer === letter ? null : letter);

  const focusItem = (index: number) => {
    const target = bubbleRefs.current[index];
    if (target) target.focus();
  };

  /**
   * Type the key rather than click it.
   *
   * A–E sets the item and moves on, so fifty answers are fifty keystrokes.
   * A letter beyond the item's printed choices is ignored rather than widened:
   * on the keyboard that is a typo, where on paste it is a real mismatch worth
   * honouring.
   */
  const handleItemKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    index: number,
  ) => {
    if (!canEdit) return;
    const { key } = event;

    if (key === "Backspace" || key === "Delete") {
      event.preventDefault();
      setAnswerAt(index, null);
      return;
    }
    if (key === "ArrowDown" || key === "ArrowRight") {
      event.preventDefault();
      focusItem(Math.min(index + 1, answerKey.length - 1));
      return;
    }
    if (key === "ArrowUp" || key === "ArrowLeft") {
      event.preventDefault();
      focusItem(Math.max(index - 1, 0));
      return;
    }
    if (key.length !== 1) return;

    const letter = key.toUpperCase();
    const letterIndex = letter.charCodeAt(0) - 65;
    if (letterIndex < 0 || letterIndex >= answerKey[index].choiceCount) return;

    event.preventDefault();
    setAnswerAt(index, letter);
    if (index + 1 < answerKey.length) focusItem(index + 1);
  };

  const setChoiceCount = (index: number, count: number) => {
    const next = [...answerKey];
    const current = next[index];
    // Dropping below the keyed letter would leave a key pointing at a bubble
    // that is no longer printed, so clear it rather than orphan it.
    const letterIndex = current.correctAnswer
      ? current.correctAnswer.charCodeAt(0) - 65
      : -1;
    next[index] = {
      ...current,
      choiceCount: count,
      correctAnswer: letterIndex >= count ? null : current.correctAnswer,
    };
    onChange(next);
  };

  const setPoints = (index: number, points: number) => {
    const next = [...answerKey];
    next[index] = { ...next[index], points };
    onChange(next);
  };

  const applyChoicesToAll = (count: number) => {
    setBulkChoices(String(count));
    onChange(
      answerKey.map((item) => {
        const letterIndex = item.correctAnswer
          ? item.correctAnswer.charCodeAt(0) - 65
          : -1;
        return {
          ...item,
          choiceCount: count,
          correctAnswer: letterIndex >= count ? null : item.correctAnswer,
        };
      }),
    );
  };

  const handlePaste = () => {
    const letters = parseKeyText(pasteText);
    if (letters.length === 0) {
      toast.error("Nothing recognisable in that text.");
      return;
    }
    const sized =
      letters.length > answerKey.length
        ? resizeAnswerKey(
            answerKey,
            Math.min(MAX_ITEMS, letters.length),
            Number(bulkChoices),
          )
        : [...answerKey];

    const next = sized.map((item, i) => {
      const letter = letters[i];
      if (letter === undefined) return item;
      const letterIndex = letter ? letter.charCodeAt(0) - 65 : -1;
      // A pasted letter beyond the item's printed choices is a real mismatch;
      // widen the item rather than dropping the answer on the floor.
      const choiceCount =
        letterIndex >= item.choiceCount
          ? Math.min(5, letterIndex + 1)
          : item.choiceCount;
      return { ...item, correctAnswer: letter, choiceCount };
    });

    onChange(next);
    setPasteOpen(false);
    setPasteText("");
    setItemCountDraft(String(next.length));
    toast.success(
      `Read ${letters.filter(Boolean).length} of ${letters.length} answers.`,
    );
  };

  const handlePrefill = async () => {
    setPrefilling(true);
    try {
      const derived = await deriveAnswerKeyFromQuestions(examId);
      if (derived.length === 0) {
        toast.error(
          "This exam has no questions in the Exam Builder to take a key from. Type or paste the key instead.",
        );
        return;
      }
      onChange(derived);
      setItemCountDraft(String(derived.length));
      const missing = derived.filter((d) => !d.correctAnswer).length;
      toast.success(
        missing > 0
          ? `Filled ${derived.length - missing} of ${derived.length} items. The rest are written-answer items and are not machine-scored.`
          : `Filled all ${derived.length} items from the exam questions.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setPrefilling(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    if (answerKey.length === 0) {
      toast.error("Set how many items this exam has first.");
      return;
    }
    setSaving(true);
    try {
      await persistAnswerKey(examId, answerKey);
      onSaved(answerKey);
      setSavedPrint(fingerprint(answerKey));
      toast.success("Answer key saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="rounded-lg border bg-card">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3 p-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="key-item-count" className="text-xs font-medium">
                Number of items
              </Label>
              <div className="flex gap-1.5">
                <Input
                  id="key-item-count"
                  type="number"
                  min={1}
                  max={MAX_ITEMS}
                  className="h-9 w-24"
                  value={itemCountDraft}
                  onChange={(e) => setItemCountDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyItemCount();
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={applyItemCount}
                >
                  Apply
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="key-bulk-choices" className="text-xs font-medium">
                Choices per item
              </Label>
              <Select
                value={bulkChoices}
                onValueChange={(v) => applyChoicesToAll(Number(v))}
              >
                <SelectTrigger id="key-bulk-choices" className="h-9 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} (A–{choiceLetter(n - 1)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                disabled={prefilling}
                onClick={handlePrefill}
              >
                {prefilling ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-4 w-4" />
                )}
                Prefill from questions
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                aria-expanded={pasteOpen}
                onClick={() => setPasteOpen((open) => !open)}
              >
                <ClipboardPaste className="mr-1.5 h-4 w-4" />
                Paste key
              </Button>
              {dirty || answerKey.length === 0 ? (
                <Button
                  size="sm"
                  variant="green"
                  className="h-9"
                  disabled={saving}
                  onClick={handleSave}
                >
                  {saving ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-4 w-4" />
                  )}
                  Save answer key
                </Button>
              ) : (
                // Not a disabled primary: a greyed-out green button reads as an
                // action that has broken rather than as work already done.
                <span className="flex h-9 items-center gap-1.5 px-1 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Saved
                </span>
              )}
            </div>
          </div>

          {pasteOpen && (
            <div className="space-y-2 border-t bg-background/60 p-3.5">
              <Label htmlFor="key-paste" className="text-xs font-medium">
                Paste the key — a run of letters (ABCDA…), a spaced list, or one
                numbered answer per line (1. A)
              </Label>
              <Textarea
                id="key-paste"
                rows={4}
                className="font-mono text-sm"
                value={pasteText}
                placeholder={"ABCDABCDAB\nor\n1. A\n2. B"}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handlePaste}>
                  Read answers
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPasteOpen(false);
                    setPasteText("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {!canEdit && (
        <ExamNotice tone="info" title="This key is read-only here">
          The exam was authored by the division office, so its answer key is set
          there. You can still print answer sheets and scan them.
        </ExamNotice>
      )}

      {answerKey.length === 0 ? (
        <div className="app__empty_state">
          <p className="app__empty_state_title">No answer key yet</p>
          <p className="app__empty_state_description">
            {canEdit
              ? "Set the number of items above, then type or paste the answers."
              : "The division office has not set this exam's key yet."}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2.5 rounded-lg border bg-card p-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-sm">
                <span className="font-semibold tabular-nums">{keyed}</span>
                <span className="text-muted-foreground">
                  {" "}
                  of {answerKey.length} items keyed
                </span>
                <span className="text-muted-foreground">
                  {" · "}
                  <span className="font-medium text-foreground tabular-nums">
                    {totalPoints}
                  </span>{" "}
                  total points
                </span>
              </p>
              {dirty && (
                <span className="text-xs font-medium text-amber-700">
                  Unsaved changes
                </span>
              )}
            </div>

            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={answerKey.length}
              aria-valuenow={keyed}
              aria-label="Items keyed"
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-300 ease-out",
                  complete ? "bg-emerald-600" : "bg-amber-500",
                )}
                style={{
                  width: `${(keyed / answerKey.length) * 100}%`,
                }}
              />
            </div>

            {complete && !dirty && onContinue && (
              <div className="flex justify-end pt-0.5">
                <Button size="sm" variant="outline" onClick={onContinue}>
                  Print the answer sheets
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {keyed < answerKey.length && (
            <ExamNotice tone="warn">
              {answerKey.length - keyed} item
              {answerKey.length - keyed === 1 ? " is" : "s are"} not keyed. They
              are still printed on the sheet and learners can still shade them,
              but they are left out of the score and the item analysis.
            </ExamNotice>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {canEdit ? (
              <p className="text-xs text-muted-foreground">
                Click a letter, or focus an item and type{" "}
                <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[0.6875rem]">
                  A
                </kbd>
                –
                <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[0.6875rem]">
                  E
                </kbd>{" "}
                — the next item is focused for you.
              </p>
            ) : (
              <span />
            )}
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={showAdvanced}
                onCheckedChange={setShowAdvanced}
                aria-label="Show per-item choices and points"
              />
              Per-item choices &amp; points
            </label>
          </div>

          <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2 xl:grid-cols-3">
            {answerKey.map((item, index) => (
              <div
                key={item.itemNumber}
                onKeyDown={(e) => handleItemKeyDown(e, index)}
                className="flex w-fit max-w-full items-center gap-2 border-b py-1.5"
              >
                <span className="w-7 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">
                  {item.itemNumber}.
                </span>

                <div className="flex gap-1">
                  {Array.from({ length: item.choiceCount }, (_, c) => {
                    const letter = choiceLetter(c);
                    const active = item.correctAnswer === letter;
                    return (
                      <button
                        key={letter}
                        ref={
                          c === 0
                            ? (el) => {
                                bubbleRefs.current[index] = el;
                              }
                            : undefined
                        }
                        type="button"
                        disabled={!canEdit}
                        aria-label={`Item ${item.itemNumber} answer ${letter}`}
                        aria-pressed={active}
                        onClick={() => toggleAnswer(index, letter)}
                        className={cn(
                          "h-7 w-7 rounded-full border text-xs font-semibold transition-colors",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                          active
                            ? "border-emerald-700 bg-emerald-600 text-white"
                            : "border-input bg-background text-muted-foreground",
                          canEdit
                            ? active
                              ? "cursor-pointer hover:bg-emerald-700"
                              : "cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-800"
                            : "cursor-default opacity-70",
                        )}
                      >
                        {letter}
                      </button>
                    );
                  })}
                </div>

                {showAdvanced && (
                  <>
                    <Select
                      value={String(item.choiceCount)}
                      disabled={!canEdit}
                      onValueChange={(v) => setChoiceCount(index, Number(v))}
                    >
                      <SelectTrigger
                        className="h-7 w-14 text-xs"
                        aria-label={`Item ${item.itemNumber} choices`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[2, 3, 4, 5].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      className="h-7 w-14 text-xs"
                      aria-label={`Item ${item.itemNumber} points`}
                      value={item.points}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setPoints(index, Number(e.target.value) || 0)
                      }
                    />
                  </>
                )}

                {canEdit && (
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={`Clear item ${item.itemNumber}`}
                    disabled={!item.correctAnswer}
                    onClick={() => setAnswerAt(index, null)}
                    className={cn(
                      "rounded-sm p-1 transition-opacity",
                      "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                      item.correctAnswer
                        ? "text-muted-foreground hover:text-destructive"
                        : "pointer-events-none opacity-0",
                    )}
                  >
                    <Eraser className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
