"use client";

/**
 * The manager's side of the release code (migration 161).
 *
 * Setting a code seals the exam: from that moment nobody but this exam's
 * managers and the division office can read its questions, choices, directions
 * or answer key, until they are given the code. Clearing it unseals the exam
 * and drops every unlock, so a later code does not silently readmit whoever
 * held the old one.
 *
 * The code is fetched through `exam_get_release_code`, which refuses anybody
 * who is not a manager — this card is never rendered for them, but the refusal
 * is in the database, not in this decision.
 */

import { ConfirmationModal } from "@/components/ConfirmationModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchReleaseCode,
  generateReleaseCode,
  saveReleaseCode,
} from "@/lib/utils/examReleaseCode";
import { supabase } from "@/lib/supabase/client";
import { Check, Copy, Loader2, Lock, LockOpen, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface Holder {
  id: string;
  unlocked_at: string;
  user: { name: string | null } | null;
}

export function ExamReleaseCodeCard({ examId }: { examId: string | number }) {
  const [code, setCode] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  // Set when the release status could not be read at all. Distinct from "no
  // code set": reporting an unreachable check as "this exam is open" would be
  // a lie in the one place a manager is deciding whether the paper is safe.
  const [statusError, setStatusError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { code: current, error: readError } = await fetchReleaseCode(examId);
    setStatusError(readError);
    setCode(current);
    setDraft(current ?? "");

    // Who has taken the paper. Readable to a manager by the SELECT policy on
    // sms_exam_unlocks; an empty list simply means nobody has unlocked yet.
    const { data } = await supabase
      .from("sms_exam_unlocks")
      .select("id, unlocked_at, user:user_id(name)")
      .eq("exam_id", Number(examId))
      .order("unlocked_at", { ascending: false });
    setHolders((data as unknown as Holder[]) ?? []);
    setLoading(false);
  }, [examId]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = async (value: string, successMessage: string) => {
    setBusy(true);
    const err = await saveReleaseCode(examId, value);
    setBusy(false);
    if (err) {
      toast.error(err);
      return;
    }
    toast.success(successMessage);
    await load();
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy — select the code and copy it by hand.");
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" />
        Checking release status…
      </div>
    );
  }

  if (statusError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
        <p className="text-sm font-semibold text-destructive">
          Release status unavailable
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          The exam is neither confirmed sealed nor confirmed open, so no control
          is offered here rather than one that might do the opposite of what it
          says. Usually this means migration 161 has not been applied to this
          database.
        </p>
        <p className="mt-2 font-mono text-xs text-destructive">{statusError}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => void load()}
        >
          <RefreshCw className="h-4 w-4" />
          <span className="ml-1.5">Try again</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-1 flex items-center gap-2">
        {code ? (
          <Lock className="h-4 w-4 text-amber-600" />
        ) : (
          <LockOpen className="h-4 w-4 text-green-600" />
        )}
        <p className="text-sm font-semibold">Release code</p>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        {code
          ? "This exam is sealed. Only people you give the code to can print the questionnaire or the answer sheets."
          : "This exam is open — anyone who can see it can print it right now. Set a code to hold it back until you are ready."}
      </p>

      {code ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded border bg-muted px-3 py-2 font-mono text-lg tracking-[0.3em]">
              {code}
            </code>
            <Button type="button" size="sm" variant="outline" onClick={copy}>
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              <span className="ml-1.5">{copied ? "Copied" : "Copy"}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void persist(
                  generateReleaseCode(),
                  "New code set — the old one no longer works.",
                )
              }
            >
              <RefreshCw className="h-4 w-4" />
              <span className="ml-1.5">New code</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmClear(true)}
            >
              <LockOpen className="h-4 w-4" />
              <span className="ml-1.5">Unseal</span>
            </Button>
          </div>

          <p className="mt-3 text-xs font-medium">
            {holders.length === 0
              ? "Nobody has entered this code yet."
              : `${holders.length} ${holders.length === 1 ? "person has" : "people have"} unlocked this exam`}
          </p>
          {holders.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {holders.slice(0, 8).map((h) => (
                <li key={h.id}>
                  {h.user?.name ?? "Unknown"} ·{" "}
                  {new Date(h.unlocked_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </li>
              ))}
              {holders.length > 8 && <li>…and {holders.length - 8} more</li>}
            </ul>
          )}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value.toUpperCase())}
            placeholder="4–32 characters"
            className="h-9 w-48 font-mono tracking-widest uppercase"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setDraft(generateReleaseCode())}
            disabled={busy}
          >
            <RefreshCw className="h-4 w-4" />
            <span className="ml-1.5">Generate</span>
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || draft.trim().length < 4}
            onClick={() => void persist(draft, "Exam sealed.")}
          >
            <Lock className="h-4 w-4" />
            <span className="ml-1.5">Seal this exam</span>
          </Button>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={async () => {
          setConfirmClear(false);
          await persist("", "Exam unsealed — anyone who can see it can print it.");
        }}
        message="Unseal this exam? Everyone who can see it will be able to print the questionnaire and the answer sheets immediately. Every unlock already granted is also cleared, so if you seal it again nobody keeps their old access."
      />
    </div>
  );
}
