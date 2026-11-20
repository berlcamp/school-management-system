"use client";

/**
 * The division office's release of an APPROVED division exam (migration 236).
 *
 * 1. "Show to all teachers" — off by default. Off, the exam is listed only to
 *    its author, QA and the division office.
 * 2. Once shown, an optional 6-character school passcode. With one set, every
 *    teacher sees the exam listed but its paper stays sealed until their
 *    school head enters the passcode, which opens it for the whole school.
 *    The passcode is handed to school heads outside the system.
 *
 * Every write is an RPC that checks the role in the database; this card is
 * rendered only for the division office, but that is presentation.
 */

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DIVISION_PASSCODE_LENGTH,
  fetchReleaseCode,
  fetchSchoolUnlocks,
  generateReleaseCode,
  saveDivisionPasscode,
  setDivisionExamPublished,
  type SchoolUnlock,
} from "@/lib/utils/examReleaseCode";
import { format } from "date-fns";
import { Check, Copy, KeyRound, Loader2, RefreshCw, School, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

export function DivisionExamReleaseCard({
  examId,
  published,
  onPublishedChange,
  onSealedChange,
}: {
  examId: string | number;
  published: boolean;
  /** After the switch is saved, so the caller can refresh its exam row. */
  onPublishedChange: (published: boolean) => void;
  /** Reported up so a header can show Sealed / Open. */
  onSealedChange?: (sealed: boolean) => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [schools, setSchools] = useState<SchoolUnlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"publish" | "code" | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<"regenerate" | "clear" | null>(null);

  const onSealedRef = useRef(onSealedChange);
  useEffect(() => {
    onSealedRef.current = onSealedChange;
  }, [onSealedChange]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ code: current, error }, unlocks] = await Promise.all([
      fetchReleaseCode(examId),
      fetchSchoolUnlocks(examId),
    ]);
    if (error) toast.error(error);
    setCode(current);
    if (!error) onSealedRef.current?.(current != null);
    setSchools(unlocks.rows);
    setLoading(false);
  }, [examId]);

  useEffect(() => {
    void load();
  }, [load]);

  const togglePublished = async (next: boolean) => {
    setBusy("publish");
    const error = await setDivisionExamPublished(examId, next);
    setBusy(null);
    if (error) return void toast.error(error);
    toast.success(next ? "Shown to every teacher in the division" : "Hidden from teachers");
    onPublishedChange(next);
  };

  const writeCode = async (next: string) => {
    setBusy("code");
    const error = await saveDivisionPasscode(examId, next);
    setBusy(null);
    setConfirm(null);
    if (error) return void toast.error(error);
    toast.success(next ? "Passcode saved — give it to the school heads" : "Passcode cleared");
    void load();
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy — select the code and copy it by hand");
    }
  };

  const newCode = () => generateReleaseCode(DIVISION_PASSCODE_LENGTH);

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Label htmlFor={`publish-${examId}`} className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
            Show to all teachers in the division
          </Label>
          <p className="mt-1 text-[0.8125rem] text-muted-foreground">
            {published
              ? "Every teacher in the division sees this exam in their list."
              : "Hidden — only its author, QA and the division office see it."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {busy === "publish" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Switch
            id={`publish-${examId}`}
            checked={published}
            disabled={busy !== null}
            onCheckedChange={(v) => void togglePublished(v)}
          />
        </div>
      </div>

      <div className="border-t pt-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden />
          School passcode
        </p>

        {loading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
        ) : code ? (
          <div className="mt-2 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border bg-muted/40 px-3 py-1.5 font-mono text-lg tracking-[0.3em]">
                {code}
              </span>
              <Button size="sm" variant="outline" onClick={() => void copy()}>
                {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null || !published}
                onClick={() => setConfirm("regenerate")}
              >
                <RefreshCw className="mr-1.5 h-4 w-4" /> New passcode
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={busy !== null}
                onClick={() => setConfirm("clear")}
              >
                Clear
              </Button>
            </div>
            <p className="text-[0.8125rem] text-muted-foreground">
              Teachers see the exam but cannot open its paper until their school head enters this
              passcode. Give it to school heads directly.
            </p>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-[0.8125rem] text-muted-foreground">
              {published
                ? "No passcode — every teacher can open the paper now. Generate one to make each school head enable it for their school."
                : "Show the exam to all teachers first, then generate a passcode for school heads."}
            </p>
            <Button size="sm" disabled={!published || busy !== null} onClick={() => void writeCode(newCode())}>
              {busy === "code" ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="mr-1.5 h-4 w-4" />
              )}
              Generate passcode
            </Button>
          </div>
        )}
      </div>

      {code && (
        <div className="border-t pt-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <School className="h-4 w-4 text-muted-foreground" aria-hidden />
            Enabled at {schools.length} {schools.length === 1 ? "school" : "schools"}
          </p>
          {schools.length > 0 && (
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
              {schools.map((s) => (
                <li key={s.school_id} className="flex justify-between gap-3">
                  <span className="truncate">{s.school_name || `School #${s.school_id}`}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {format(new Date(s.unlocked_at), "MMM d, yyyy h:mm a")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && busy === null && setConfirm(null)}
        title={confirm === "clear" ? "Clear the passcode?" : "Replace the passcode?"}
        description={
          confirm === "clear"
            ? "The exam opens to every teacher, and the schools that already entered it lose that — a new passcode later has to be entered again."
            : "Schools that already entered the old passcode stay enabled; the old one stops working for everyone else."
        }
        confirmText={confirm === "clear" ? "Clear" : "Replace"}
        variant={confirm === "clear" ? "destructive" : "default"}
        loading={busy === "code"}
        onConfirm={() => void writeCode(confirm === "clear" ? "" : newCode())}
      />
    </div>
  );
}
