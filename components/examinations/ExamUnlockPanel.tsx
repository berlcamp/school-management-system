"use client";

/**
 * The locked state of an exam paper (migration 161).
 *
 * Shown instead of the questionnaire or the answer-sheet workspace when the
 * exam carries a release code the reader has not been given. This is a real
 * gate, not a hidden button: RLS on the question, choice, sub-item, directions
 * and answer-key tables refuses the rows, so nothing behind this panel is
 * fetchable by skipping it.
 *
 * A wrong code says only that it is wrong. The panel never reveals whether the
 * exam exists in a printable state, who holds the code, or how close a guess
 * was — all of which would help someone working through candidates.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { redeemReleaseCode } from "@/lib/utils/examReleaseCode";
import { KeyRound, Loader2, Lock } from "lucide-react";
import { useState } from "react";

interface ExamUnlockPanelProps {
  examId: string | number;
  examTitle?: string;
  onUnlocked: () => void;
}

export function ExamUnlockPanel({
  examId,
  examTitle,
  onUnlocked,
}: ExamUnlockPanelProps) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy || code.trim().length === 0) return;
    setBusy(true);
    setError(null);
    const { ok, error: err } = await redeemReleaseCode(examId, code);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    if (!ok) {
      setError("That code is not right for this exam.");
      return;
    }
    onUnlocked();
  };

  return (
    <div className="mx-auto max-w-md rounded-lg border bg-muted/20 p-6 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
        <Lock className="h-6 w-6 text-amber-700" />
      </div>

      <h3 className="text-base font-semibold">This exam has not been released</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {examTitle ? `“${examTitle}” is ` : "It is "}sealed until whoever manages
        it gives you the release code. Ask the division office, or your school
        head for a school-wide exam.
      </p>

      <div className="mt-5 text-left">
        <Label htmlFor="exam-release-code" className="mb-1.5 block text-sm">
          Release code
        </Label>
        <div className="flex gap-2">
          <Input
            id="exam-release-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            placeholder="e.g. K7QP4M2B"
            className="font-mono tracking-widest uppercase"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={busy || code.trim().length === 0}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            <span className="ml-1.5">Unlock</span>
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <p className="mt-2 text-xs text-muted-foreground">
          You only enter this once — the exam stays open for you afterwards, so
          you can come back to scan the answer sheets.
        </p>
      </div>
    </div>
  );
}
