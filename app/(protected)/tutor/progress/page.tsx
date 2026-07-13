"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ARAL_PROGRESS_LEVELS,
  ARAL_PROGRESS_WEEKS,
  aralProgramLabel,
  aralProgressLevelColor,
  getGradeLevelLabel,
} from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import type {
  AralProgressLevel,
  AralProgressMark,
  AralProgressSession,
} from "@/types";
import { Check, Loader2, Plus, TrendingUp, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { learnerName, useTutorLearners } from "../useTutorLearners";

type SaveState = "idle" | "saving" | "saved" | "error";
const DEBOUNCE_MS = 600;
const markKey = (sessionId: string, enrollmentId: string) =>
  `${sessionId}:${enrollmentId}`;

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const router = useRouter();
  const isTutor = user?.type === "tutor";

  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [week, setWeek] = useState<number>(1);
  const { rows, loading, tutorId, schoolId } = useTutorLearners(schoolYear);

  const [sessions, setSessions] = useState<AralProgressSession[]>([]);
  const [marks, setMarks] = useState<Map<string, AralProgressMark>>(new Map());
  const [gridLoading, setGridLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (user && !isTutor) router.replace("/home");
  }, [user, isTutor, router]);

  const loadGrid = useCallback(async () => {
    if (!tutorId) {
      setSessions([]);
      setMarks(new Map());
      return;
    }
    setGridLoading(true);
    try {
      const { data: sessionRows, error: sErr } = await supabase
        .from("sms_aral_progress_sessions")
        .select("*")
        .eq("tutor_id", tutorId)
        .eq("school_year", schoolYear)
        .order("week", { ascending: true })
        .order("session_no", { ascending: true });
      if (sErr) throw new Error(sErr.message);
      const sl = (sessionRows || []) as AralProgressSession[];
      setSessions(sl);

      const map = new Map<string, AralProgressMark>();
      if (sl.length > 0) {
        const { data: markRows, error: mErr } = await supabase
          .from("sms_aral_progress_marks")
          .select("*")
          .in(
            "session_id",
            sl.map((s) => s.id),
          );
        if (mErr) throw new Error(mErr.message);
        ((markRows || []) as AralProgressMark[]).forEach((m) =>
          map.set(markKey(m.session_id, m.enrollment_id), m),
        );
      }
      setMarks(map);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load progress tracker.",
      );
    } finally {
      setGridLoading(false);
    }
  }, [tutorId, schoolYear]);

  useEffect(() => {
    loadGrid();
  }, [loadGrid]);

  useEffect(
    () => () => {
      Object.values(timersRef.current).forEach(clearTimeout);
      timersRef.current = {};
    },
    [],
  );

  const weekSessions = sessions
    .filter((s) => s.week === week)
    .sort((a, b) => a.session_no - b.session_no);

  const addSession = async () => {
    if (!tutorId || schoolId == null) return;
    const nextNo =
      weekSessions.reduce((max, s) => Math.max(max, s.session_no), 0) + 1;
    setAdding(true);
    const { data, error } = await supabase
      .from("sms_aral_progress_sessions")
      .insert({
        tutor_id: tutorId,
        school_id: Number(schoolId),
        school_year: schoolYear,
        week,
        session_no: nextNo,
        label: null,
      })
      .select()
      .single();
    setAdding(false);
    if (error) {
      toast.error("Failed to add session.");
      return;
    }
    setSessions((prev) => [...prev, data as AralProgressSession]);
  };

  const removeSession = async (sessionId: string) => {
    if (
      !window.confirm(
        "Remove this session column? All learner marks for it will be deleted.",
      )
    )
      return;
    const { error } = await supabase
      .from("sms_aral_progress_sessions")
      .delete()
      .eq("id", sessionId);
    if (error) {
      toast.error("Failed to remove session.");
      return;
    }
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    setMarks((prev) => {
      const next = new Map(prev);
      for (const key of next.keys()) {
        if (key.startsWith(`${sessionId}:`)) next.delete(key);
      }
      return next;
    });
  };

  const setSessionLabel = (sessionId: string, label: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, label } : s)),
    );
    const key = `label:${sessionId}`;
    if (timersRef.current[key]) clearTimeout(timersRef.current[key]);
    timersRef.current[key] = setTimeout(async () => {
      delete timersRef.current[key];
      setSaveState("saving");
      const { error } = await supabase
        .from("sms_aral_progress_sessions")
        .update({ label: label === "" ? null : label })
        .eq("id", sessionId);
      setSaveState(error ? "error" : "saved");
    }, DEBOUNCE_MS);
  };

  const upsertMark = async (
    sessionId: string,
    enrollmentId: string,
    patch: Partial<Pick<AralProgressMark, "level" | "note">>,
  ) => {
    const key = markKey(sessionId, enrollmentId);
    const existing = marks.get(key);
    const merged: AralProgressMark = {
      id: existing?.id ?? `tmp-${key}`,
      session_id: sessionId,
      enrollment_id: enrollmentId,
      level: patch.level !== undefined ? patch.level : (existing?.level ?? null),
      note: patch.note !== undefined ? patch.note : (existing?.note ?? null),
      created_at: existing?.created_at ?? "",
      updated_at: existing?.updated_at ?? "",
    };
    setMarks((m) => new Map(m).set(key, merged));
    setSaveState("saving");
    const { data, error } = await supabase
      .from("sms_aral_progress_marks")
      .upsert(
        {
          session_id: sessionId,
          enrollment_id: enrollmentId,
          level: merged.level,
          note: merged.note,
        },
        { onConflict: "session_id,enrollment_id" },
      )
      .select()
      .single();
    if (error) {
      setSaveState("error");
      toast.error("Failed to save.");
      return;
    }
    setSaveState("saved");
    setMarks((m) => new Map(m).set(key, data as AralProgressMark));
  };

  const setLevel = (
    sessionId: string,
    enrollmentId: string,
    level: AralProgressLevel | null,
  ) => upsertMark(sessionId, enrollmentId, { level });

  const setNote = (sessionId: string, enrollmentId: string, note: string) => {
    const key = markKey(sessionId, enrollmentId);
    const v = note === "" ? null : note;
    // optimistic local update
    setMarks((m) => {
      const existing = m.get(key);
      const merged: AralProgressMark = {
        id: existing?.id ?? `tmp-${key}`,
        session_id: sessionId,
        enrollment_id: enrollmentId,
        level: existing?.level ?? null,
        note: v,
        created_at: existing?.created_at ?? "",
        updated_at: existing?.updated_at ?? "",
      };
      return new Map(m).set(key, merged);
    });
    const tkey = `note:${key}`;
    if (timersRef.current[tkey]) clearTimeout(timersRef.current[tkey]);
    timersRef.current[tkey] = setTimeout(() => {
      delete timersRef.current[tkey];
      upsertMark(sessionId, enrollmentId, { note: v });
    }, DEBOUNCE_MS);
  };

  if (!isTutor) return null;

  const isLoading = loading || gridLoading;

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Individual Progress Tracker
        </h1>
        <p className="text-sm text-muted-foreground">
          Track each learner&apos;s reading level per session across Weeks 1–8.
          Add session columns as needed and label them with the session focus.
        </p>
      </div>

      <div className="app__content space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-36">
              <label className="text-sm font-medium mb-1.5 block">
                School Year
              </label>
              <Select value={schoolYear} onValueChange={setSchoolYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getSchoolYearOptions().map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Week</label>
              <div className="flex flex-wrap gap-1">
                {ARAL_PROGRESS_WEEKS.map((w) => (
                  <button
                    key={w}
                    onClick={() => setWeek(w)}
                    className={cn(
                      "h-9 w-9 rounded-md border text-sm font-medium transition-colors",
                      w === week
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-accent",
                    )}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="text-xs">
            {saveState === "saving" && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
              </span>
            )}
            {saveState === "saved" && (
              <span className="inline-flex items-center gap-1 text-green-600">
                <Check className="h-3.5 w-3.5" /> Saved
              </span>
            )}
            {saveState === "error" && (
              <span className="text-red-600">Save failed</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {ARAL_PROGRESS_LEVELS.map((l) => (
            <span key={l.value} className="inline-flex items-center gap-1.5">
              <span
                className={`inline-flex h-5 items-center justify-center rounded px-1.5 font-semibold ${l.color}`}
              >
                {l.value}
              </span>
              {l.label.split("— ")[1]}
            </span>
          ))}
        </div>

        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="flex items-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                No learners assigned to you for {schoolYear}.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Week {week}</h2>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={addSession}
                    disabled={adding}
                  >
                    {adding ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Add session
                  </Button>
                </div>
                <div className="overflow-x-auto border rounded-md">
                  <table className="text-sm border-collapse min-w-full">
                    <thead>
                      <tr className="bg-muted/60 align-top">
                        <th className="border px-3 py-2 text-left min-w-48 sticky left-0 bg-muted/60 z-10">
                          Name of Tutee
                        </th>
                        {weekSessions.map((s) => (
                          <th
                            key={s.id}
                            className="border px-2 py-2 text-center min-w-36"
                          >
                            <div className="flex items-center justify-center gap-1">
                              <span className="font-semibold whitespace-nowrap">
                                Session {s.session_no}
                              </span>
                              <button
                                onClick={() => removeSession(s.id)}
                                className="text-muted-foreground hover:text-red-600"
                                title="Remove session"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                            <Input
                              value={s.label ?? ""}
                              onChange={(e) =>
                                setSessionLabel(s.id, e.target.value)
                              }
                              placeholder="Session focus…"
                              className="mt-1 h-7 text-xs font-normal"
                            />
                          </th>
                        ))}
                        {weekSessions.length === 0 && (
                          <th className="border px-3 py-2 text-center text-muted-foreground font-normal">
                            No sessions yet — click “Add session” →
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="hover:bg-muted/30 align-top">
                          <td className="border px-3 py-1.5 whitespace-nowrap sticky left-0 bg-background z-10">
                            {learnerName(r)}
                            <span className="ml-2 text-xs text-muted-foreground">
                              {aralProgramLabel(r.program)}
                              {r.grade_level != null &&
                                ` · ${getGradeLevelLabel(r.grade_level)}`}
                            </span>
                          </td>
                          {weekSessions.map((s) => {
                            const mark = marks.get(markKey(s.id, r.id));
                            return (
                              <td key={s.id} className="border p-1 align-top">
                                <Select
                                  value={mark?.level ?? "none"}
                                  onValueChange={(v) =>
                                    setLevel(
                                      s.id,
                                      r.id,
                                      v === "none"
                                        ? null
                                        : (v as AralProgressLevel),
                                    )
                                  }
                                >
                                  <SelectTrigger
                                    className={cn(
                                      "h-7 w-full justify-center gap-1 font-semibold",
                                      aralProgressLevelColor(mark?.level),
                                    )}
                                  >
                                    <span>{mark?.level ?? "—"}</span>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">—</SelectItem>
                                    {ARAL_PROGRESS_LEVELS.map((l) => (
                                      <SelectItem key={l.value} value={l.value}>
                                        {l.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Input
                                  value={mark?.note ?? ""}
                                  onChange={(e) =>
                                    setNote(s.id, r.id, e.target.value)
                                  }
                                  placeholder="note"
                                  className="mt-1 h-6 px-1.5 text-[11px]"
                                />
                              </td>
                            );
                          })}
                          {weekSessions.length === 0 && (
                            <td className="border" />
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
