"use client";

/**
 * Answer key editor — the flat item-number → letter key an exam is scored on.
 *
 * Built for speed of entry above all else, because a teacher with a paper exam
 * and 50 answers should be done in under a minute:
 *   - "Paste key" takes a run of letters or a numbered list straight from a
 *     document, which is how most keys already exist;
 *   - the grid is click-to-set with the keyboard as a first-class path;
 *   - "Prefill from exam questions" pulls the answers out of the Exam Builder
 *     when the exam was authored there, so nothing is retyped.
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
import { ClipboardPaste, Loader2, Save, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";

interface AnswerKeyEditorProps {
  examId: string;
  answerKey: AnswerKeyItem[];
  canEdit: boolean;
  onChange: (key: AnswerKeyItem[]) => void;
  onSaved: (key: AnswerKeyItem[]) => void;
}

export function AnswerKeyEditor({
  examId,
  answerKey,
  canEdit,
  onChange,
  onSaved,
}: AnswerKeyEditorProps) {
  const [saving, setSaving] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [itemCountDraft, setItemCountDraft] = useState(
    String(answerKey.length || 50),
  );
  const [bulkChoices, setBulkChoices] = useState(String(DEFAULT_CHOICE_COUNT));

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

  const setAnswer = (index: number, letter: string | null) => {
    const next = [...answerKey];
    next[index] = {
      ...next[index],
      correctAnswer: next[index].correctAnswer === letter ? null : letter,
    };
    onChange(next);
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
      toast.success("Answer key saved.");
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
          <Label htmlFor="key-item-count" className="text-xs">
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
              disabled={!canEdit}
              onChange={(e) => setItemCountDraft(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              disabled={!canEdit}
              onClick={applyItemCount}
            >
              Apply
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Choices per item</Label>
          <Select
            value={bulkChoices}
            disabled={!canEdit}
            onValueChange={(v) => applyChoicesToAll(Number(v))}
          >
            <SelectTrigger className="h-9 w-36">
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

        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!canEdit || prefilling}
            onClick={handlePrefill}
          >
            {prefilling ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            Prefill from exam questions
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canEdit}
            onClick={() => setPasteOpen((open) => !open)}
          >
            <ClipboardPaste className="mr-1.5 h-4 w-4" />
            Paste key
          </Button>
          <Button
            size="sm"
            variant="green"
            disabled={!canEdit || saving}
            onClick={handleSave}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Save answer key
          </Button>
        </div>
      </div>

      {pasteOpen && canEdit && (
        <div className="space-y-2 rounded-lg border p-3">
          <Label htmlFor="key-paste" className="text-xs">
            Paste the key — a run of letters (ABCDA…), a spaced list, or one
            numbered answer per line (1. A)
          </Label>
          <Textarea
            id="key-paste"
            rows={4}
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

      {!canEdit && (
        <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900">
          This exam was authored by the division office, so its answer key is
          read-only here. You can still print answer sheets and scan them.
        </p>
      )}

      {answerKey.length === 0 ? (
        <div className="app__empty_state">
          <p className="app__empty_state_title">No answer key yet</p>
          <p className="app__empty_state_description">
            Set the number of items above, then paste or click in the answers.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>
              <b className="text-foreground">{keyed}</b> of {answerKey.length}{" "}
              items keyed
            </span>
            <span>
              <b className="text-foreground">{totalPoints}</b> total points
            </span>
            {keyed < answerKey.length && (
              <span className="text-amber-700">
                Unkeyed items are printed on the sheet but not machine-scored.
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
            {answerKey.map((item, index) => (
              <div
                key={item.itemNumber}
                className="flex items-center gap-2 rounded border-b px-1 py-1.5 last:border-b-0"
              >
                <span className="w-8 shrink-0 text-right text-xs font-medium text-muted-foreground">
                  {item.itemNumber}.
                </span>

                <div className="flex gap-1">
                  {Array.from({ length: item.choiceCount }, (_, c) => {
                    const letter = choiceLetter(c);
                    const active = item.correctAnswer === letter;
                    return (
                      <button
                        key={letter}
                        type="button"
                        disabled={!canEdit}
                        aria-label={`Item ${item.itemNumber} answer ${letter}`}
                        aria-pressed={active}
                        onClick={() => setAnswer(index, letter)}
                        className={`h-7 w-7 rounded-full border text-xs font-semibold transition-colors ${
                          active
                            ? "border-green-700 bg-green-600 text-white"
                            : "border-input bg-background text-muted-foreground hover:bg-muted"
                        } ${canEdit ? "cursor-pointer" : "cursor-default opacity-70"}`}
                      >
                        {letter}
                      </button>
                    );
                  })}
                </div>

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
                  onChange={(e) => setPoints(index, Number(e.target.value) || 0)}
                />

                {canEdit && item.correctAnswer && (
                  <button
                    type="button"
                    aria-label={`Clear item ${item.itemNumber}`}
                    onClick={() => setAnswer(index, item.correctAnswer)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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
