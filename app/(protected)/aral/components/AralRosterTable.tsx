"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  aralSourceLabel,
  aralTierColor,
  ARAL_STATUSES,
  ARAL_TIERS,
  getGradeLevelLabel,
  suggestedStartGrade,
} from "@/lib/constants";
import { supabase } from "@/lib/supabase/client";
import { formatLrn } from "@/lib/utils";
import type { AralEnrollment, AralProgram, AralStatus, Student } from "@/types";
import { Check, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import type { AdviserSection } from "../[program]/page";

interface Props {
  program: AralProgram;
  gradeLevel: number;
  sections: AdviserSection[];
  schoolYear: string;
  reloadKey: number;
  readOnly?: boolean;
}

interface TutorOption {
  id: string;
  name: string;
}

interface RosterRow extends AralEnrollment {
  student: Student | null;
  sectionName: string | null;
}

type SaveState = "idle" | "saving" | "saved" | "error";

const NOTE_DEBOUNCE_MS = 600;
// A terminal status records the exit timestamp; the active ones clear it.
const TERMINAL_STATUSES: AralStatus[] = ["completed", "dropped"];

export function AralRosterTable({
  program,
  gradeLevel,
  sections,
  schoolYear,
  reloadKey,
  readOnly = false,
}: Props) {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [tutors, setTutors] = useState<TutorOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const noteTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );

  const clearNoteTimers = () => {
    Object.values(noteTimersRef.current).forEach(clearTimeout);
    noteTimersRef.current = {};
  };

  const load = useCallback(async () => {
    clearNoteTimers();
    setSaveState("idle");
    setLoading(true);
    try {
      const { data: enrollments } = await supabase
        .from("sms_aral_enrollments")
        .select("*")
        .eq("program", program)
        .in(
          "section_id",
          sections.map((s) => s.id),
        )
        .eq("school_year", schoolYear)
        .order("created_at", { ascending: true });
      const list = (enrollments || []) as AralEnrollment[];
      const nameById = new Map(sections.map((s) => [s.id, s.name]));
      let studentById = new Map<string, Student>();
      if (list.length > 0) {
        const { data: students } = await supabase
          .from("sms_students")
          .select("*")
          .in(
            "id",
            list.map((e) => e.student_id),
          );
        studentById = new Map(
          ((students || []) as Student[]).map((s) => [String(s.id), s]),
        );
      }
      const built: RosterRow[] = list
        .map((e) => ({
          ...e,
          student: studentById.get(String(e.student_id)) ?? null,
          sectionName:
            e.section_id != null
              ? (nameById.get(String(e.section_id)) ?? null)
              : null,
        }))
        .sort((a, b) => {
          const an = a.student
            ? `${a.student.last_name}, ${a.student.first_name}`
            : "";
          const bn = b.student
            ? `${b.student.last_name}, ${b.student.first_name}`
            : "";
          return an.localeCompare(bn);
        });
      setRows(built);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load roster.");
    } finally {
      setLoading(false);
    }
  }, [program, sections, schoolYear]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  // Tutors assigned to this program + grade level (for the per-learner dropdown).
  const loadTutors = useCallback(async () => {
    const { data: assignments } = await supabase
      .from("sms_aral_tutors")
      .select("user_id")
      .eq("program", program)
      .eq("grade_level", gradeLevel);
    const userIds = [
      ...new Set(
        (assignments || [])
          .map((a) => a.user_id)
          .filter((id): id is number => id != null),
      ),
    ];
    if (userIds.length === 0) {
      setTutors([]);
      return;
    }
    const { data: users } = await supabase
      .from("sms_users")
      .select("id, name")
      .in("id", userIds);
    setTutors(
      ((users || []) as { id: number; name: string }[]).map((u) => ({
        id: String(u.id),
        name: u.name,
      })),
    );
  }, [program, gradeLevel]);

  useEffect(() => {
    loadTutors();
  }, [loadTutors]);

  useEffect(() => () => clearNoteTimers(), []);

  const tutorName = (id: string | null) =>
    id == null ? "—" : (tutors.find((t) => t.id === id)?.name ?? `#${id}`);

  const patchLocal = (id: string, patch: Partial<AralEnrollment>) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  };

  const persist = async (id: string, patch: Partial<AralEnrollment>) => {
    setSaveState("saving");
    try {
      const { error } = await supabase
        .from("sms_aral_enrollments")
        .update(patch)
        .eq("id", id);
      if (error) throw new Error(error.message);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      toast.error(err instanceof Error ? err.message : "Failed to save.");
      // Reload to resync the row with the server.
      load();
    }
  };

  const changeStatus = (id: string, status: AralStatus) => {
    const exited_at = TERMINAL_STATUSES.includes(status)
      ? new Date().toISOString()
      : null;
    patchLocal(id, { status, exited_at });
    persist(id, { status, exited_at });
  };

  const changeTutor = (id: string, value: string) => {
    const tutor_id = value === "none" ? null : value;
    patchLocal(id, { tutor_id });
    persist(id, { tutor_id });
  };

  const setNote = (
    id: string,
    field: "pre_note" | "post_note",
    value: string,
  ) => {
    const v = value === "" ? null : value;
    patchLocal(id, { [field]: v } as Partial<AralEnrollment>);
    const key = `${id}:${field}`;
    if (noteTimersRef.current[key]) clearTimeout(noteTimersRef.current[key]);
    noteTimersRef.current[key] = setTimeout(() => {
      delete noteTimersRef.current[key];
      persist(id, { [field]: v } as Partial<AralEnrollment>);
    }, NOTE_DEBOUNCE_MS);
  };

  const drop = async (id: string) => {
    if (!window.confirm("Remove this learner from the ARAL program?")) return;
    try {
      const { error } = await supabase
        .from("sms_aral_enrollments")
        .delete()
        .eq("id", id);
      if (error) throw new Error(error.message);
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success("Removed from program.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading roster…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {readOnly
          ? "No learners enrolled for this grade level yet."
          : "No learners enrolled yet. Use the Candidates tab to enroll eligible learners."}
      </p>
    );
  }

  const byTier = ARAL_TIERS.map((t) => ({
    ...t,
    count: rows.filter((r) => r.tier === t.value).length,
  }));
  const byStatus = ARAL_STATUSES.map((s) => ({
    ...s,
    count: rows.filter((r) => r.status === s.value).length,
  }));

  return (
    <div className="space-y-4">
      {!readOnly && tutors.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No tutors assigned to this grade level yet. Add one in{" "}
          <Link href="/aral/tutors" className="underline hover:text-foreground">
            ARAL &gt; Tutors
          </Link>{" "}
          to assign learners to a tutor.
        </p>
      )}
      <div className="flex items-center justify-end gap-3 text-xs">
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

      <div className="overflow-x-auto border rounded-md">
        <table className="text-sm border-collapse min-w-full">
          <thead>
            <tr className="bg-muted/60">
              <th className="border px-3 py-2 text-left min-w-48">
                Name of Learner
              </th>
              <th className="border px-2 py-2 text-center w-12">Sex</th>
              <th className="border px-3 py-2 text-left">Section</th>
              <th className="border px-3 py-2 text-center">Tier</th>
              <th className="border px-3 py-2 text-left">Source · Level</th>
              <th className="border px-3 py-2 text-center">Suggested Start</th>
              <th className="border px-3 py-2 text-center w-36">Status</th>
              <th className="border px-3 py-2 text-center w-40">Tutor</th>
              <th className="border px-3 py-2 text-left w-44">Baseline note</th>
              <th className="border px-3 py-2 text-left w-44">Outcome note</th>
              {!readOnly && <th className="border px-2 py-2 text-center w-12"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const tierLabel =
                ARAL_TIERS.find((t) => t.value === r.tier)?.label ?? r.tier;
              return (
                <tr key={r.id} className="hover:bg-muted/30 align-top">
                  <td className="border px-3 py-1.5 whitespace-nowrap">
                    {r.student
                      ? `${r.student.last_name}, ${r.student.first_name}`
                      : `Student #${r.student_id}`}
                    {r.student && (
                      <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                        {formatLrn(r.student.lrn)}
                      </span>
                    )}
                  </td>
                  <td className="border px-2 py-1.5 text-center text-xs">
                    {r.student
                      ? r.student.gender === "female"
                        ? "F"
                        : "M"
                      : "-"}
                  </td>
                  <td className="border px-3 py-1.5 text-xs">
                    {r.sectionName ?? "—"}
                  </td>
                  <td
                    className={`border px-3 py-1.5 text-center font-semibold ${aralTierColor(
                      r.tier,
                    )}`}
                  >
                    {tierLabel}
                  </td>
                  <td className="border px-3 py-1.5 text-xs">
                    <span className="font-medium">
                      {aralSourceLabel(r.source_assessment)}
                    </span>
                    {r.source_level ? ` · ${r.source_level}` : ""}
                  </td>
                  <td className="border px-3 py-1.5 text-center">
                    {(() => {
                      const g =
                        r.suggested_start_grade ??
                        suggestedStartGrade(
                          r.source_assessment,
                          r.source_level,
                          r.grade_level,
                        );
                      return g != null ? getGradeLevelLabel(g) : "—";
                    })()}
                  </td>
                  <td className="border px-2 py-1">
                    {readOnly ? (
                      <span className="block px-1 text-center text-xs">
                        {ARAL_STATUSES.find((s) => s.value === r.status)
                          ?.label ?? r.status}
                      </span>
                    ) : (
                      <Select
                        value={r.status}
                        onValueChange={(v) =>
                          changeStatus(r.id, v as AralStatus)
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ARAL_STATUSES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="border px-2 py-1">
                    {readOnly ? (
                      <span className="block px-1 text-center text-xs">
                        {tutorName(r.tutor_id)}
                      </span>
                    ) : (
                      <Select
                        value={r.tutor_id ?? "none"}
                        onValueChange={(v) => changeTutor(r.id, v)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Unassigned</SelectItem>
                          {tutors.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="border p-0">
                    {readOnly ? (
                      <span className="block px-2 py-1.5 text-xs">
                        {r.pre_note ?? "—"}
                      </span>
                    ) : (
                      <Input
                        className="h-8 rounded-none border-0 px-2 text-xs"
                        value={r.pre_note ?? ""}
                        placeholder="—"
                        onChange={(e) =>
                          setNote(r.id, "pre_note", e.target.value)
                        }
                      />
                    )}
                  </td>
                  <td className="border p-0">
                    {readOnly ? (
                      <span className="block px-2 py-1.5 text-xs">
                        {r.post_note ?? "—"}
                      </span>
                    ) : (
                      <Input
                        className="h-8 rounded-none border-0 px-2 text-xs"
                        value={r.post_note ?? ""}
                        placeholder="—"
                        onChange={(e) =>
                          setNote(r.id, "post_note", e.target.value)
                        }
                      />
                    )}
                  </td>
                  {!readOnly && (
                    <td className="border px-2 py-1.5 text-center">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-600 hover:text-red-700"
                        onClick={() => drop(r.id)}
                        aria-label="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border">
          <div className="border-b px-3 py-2 text-sm font-semibold">
            By tier
          </div>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b">
                <td className="px-3 py-1.5">Enrolled learners</td>
                <td className="px-3 py-1.5 text-right font-semibold">
                  {rows.length}
                </td>
              </tr>
              {byTier.map((t) => (
                <tr key={t.value} className="border-b last:border-0">
                  <td className={`px-3 py-1.5 ${aralTierColor(t.value)}`}>
                    {t.label}
                  </td>
                  <td className="px-3 py-1.5 text-right">{t.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-md border">
          <div className="border-b px-3 py-2 text-sm font-semibold">
            By status
          </div>
          <table className="w-full text-sm">
            <tbody>
              {byStatus.map((s) => (
                <tr key={s.value} className="border-b last:border-0">
                  <td className="px-3 py-1.5">{s.label}</td>
                  <td className="px-3 py-1.5 text-right">{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
