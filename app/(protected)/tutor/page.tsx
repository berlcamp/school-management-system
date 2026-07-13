"use client";

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
  aralProgramLabel,
  aralTierColor,
  ARAL_STATUSES,
  ARAL_TIERS,
  getGradeLevelLabel,
} from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { formatLrn } from "@/lib/utils";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { Check, GraduationCap, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { type TutorLearnerRow, useTutorLearners } from "./useTutorLearners";

type Row = TutorLearnerRow;

type SaveState = "idle" | "saving" | "saved" | "error";
const NOTE_DEBOUNCE_MS = 600;

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const router = useRouter();
  const isTutor = user?.type === "tutor" || user?.is_tutor === true;

  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const { rows: loadedRows, loading, reload } = useTutorLearners(schoolYear);
  const [rows, setRows] = useState<Row[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const noteTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );

  useEffect(() => {
    if (user && !isTutor) router.replace("/home");
  }, [user, isTutor, router]);

  // Mirror the loaded roster into local state so notes can be edited in place.
  useEffect(() => {
    setSaveState("idle");
    setRows(loadedRows);
  }, [loadedRows]);

  useEffect(
    () => () => {
      Object.values(noteTimersRef.current).forEach(clearTimeout);
      noteTimersRef.current = {};
    },
    [],
  );

  const setNote = (
    id: string,
    field: "pre_note" | "post_note",
    value: string,
  ) => {
    const v = value === "" ? null : value;
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: v } : r)),
    );
    const key = `${id}:${field}`;
    if (noteTimersRef.current[key]) clearTimeout(noteTimersRef.current[key]);
    noteTimersRef.current[key] = setTimeout(async () => {
      delete noteTimersRef.current[key];
      setSaveState("saving");
      const { error } = await supabase
        .from("sms_aral_enrollments")
        .update({ [field]: v })
        .eq("id", id);
      if (error) {
        setSaveState("error");
        toast.error("Failed to save note.");
        reload();
      } else {
        setSaveState("saved");
      }
    }, NOTE_DEBOUNCE_MS);
  };

  if (!isTutor) return null;

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <GraduationCap className="h-5 w-5" />
          My Learners
        </h1>
        <p className="text-sm text-muted-foreground">
          Learners assigned to you in the ARAL intervention program. Record your
          progress in the note columns.
        </p>
      </div>

      <div className="app__content space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
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

        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                No learners assigned to you for {schoolYear}.
              </p>
            ) : (
              <div className="overflow-x-auto border rounded-md">
                <table className="text-sm border-collapse min-w-full">
                  <thead>
                    <tr className="bg-muted/60">
                      <th className="border px-3 py-2 text-left min-w-48">
                        Name of Learner
                      </th>
                      <th className="border px-3 py-2 text-left">Program</th>
                      <th className="border px-3 py-2 text-left">Section</th>
                      <th className="border px-3 py-2 text-center">Tier</th>
                      <th className="border px-3 py-2 text-center">Status</th>
                      <th className="border px-3 py-2 text-left w-48">
                        Baseline note
                      </th>
                      <th className="border px-3 py-2 text-left w-48">
                        Outcome note
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
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
                        <td className="border px-3 py-1.5">
                          {aralProgramLabel(r.program)}
                        </td>
                        <td className="border px-3 py-1.5">
                          {r.sectionName ?? "—"}
                          {r.grade_level != null && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              {getGradeLevelLabel(r.grade_level)}
                            </span>
                          )}
                        </td>
                        <td
                          className={`border px-3 py-1.5 text-center font-semibold ${aralTierColor(
                            r.tier,
                          )}`}
                        >
                          {ARAL_TIERS.find((t) => t.value === r.tier)?.label ??
                            r.tier}
                        </td>
                        <td className="border px-3 py-1.5 text-center text-xs">
                          {ARAL_STATUSES.find((s) => s.value === r.status)
                            ?.label ?? r.status}
                        </td>
                        <td className="border p-0">
                          <Input
                            className="h-8 rounded-none border-0 px-2 text-xs"
                            value={r.pre_note ?? ""}
                            placeholder="—"
                            onChange={(e) =>
                              setNote(r.id, "pre_note", e.target.value)
                            }
                          />
                        </td>
                        <td className="border p-0">
                          <Input
                            className="h-8 rounded-none border-0 px-2 text-xs"
                            value={r.post_note ?? ""}
                            placeholder="—"
                            onChange={(e) =>
                              setNote(r.id, "post_note", e.target.value)
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
