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
  ARAL_ATTENDANCE_STATUSES,
  aralProgramLabel,
  getGradeLevelLabel,
} from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import type {
  AralAttendanceDate,
  AralAttendanceMark,
  AralAttendanceStatus,
} from "@/types";
import { format, parseISO } from "date-fns";
import { CalendarCheck, Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { learnerName, useTutorLearners } from "../useTutorLearners";

const markKey = (dateId: string, enrollmentId: string) =>
  `${dateId}:${enrollmentId}`;

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const router = useRouter();
  const isTutor = user?.type === "tutor" || user?.is_tutor === true;

  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const { rows, loading, tutorId, schoolId } = useTutorLearners(schoolYear);

  const [dates, setDates] = useState<AralAttendanceDate[]>([]);
  const [marks, setMarks] = useState<Map<string, AralAttendanceMark>>(
    new Map(),
  );
  const [gridLoading, setGridLoading] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (user && !isTutor) router.replace("/home");
  }, [user, isTutor, router]);

  const loadGrid = useCallback(async () => {
    if (!tutorId) {
      setDates([]);
      setMarks(new Map());
      return;
    }
    setGridLoading(true);
    try {
      const { data: dateRows, error: dErr } = await supabase
        .from("sms_aral_attendance_dates")
        .select("*")
        .eq("tutor_id", tutorId)
        .eq("school_year", schoolYear)
        .order("session_date", { ascending: true });
      if (dErr) throw new Error(dErr.message);
      const dl = (dateRows || []) as AralAttendanceDate[];
      setDates(dl);

      const map = new Map<string, AralAttendanceMark>();
      if (dl.length > 0) {
        const { data: markRows, error: mErr } = await supabase
          .from("sms_aral_attendance")
          .select("*")
          .in(
            "date_id",
            dl.map((d) => d.id),
          );
        if (mErr) throw new Error(mErr.message);
        ((markRows || []) as AralAttendanceMark[]).forEach((m) =>
          map.set(markKey(m.date_id, m.enrollment_id), m),
        );
      }
      setMarks(map);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load attendance.",
      );
    } finally {
      setGridLoading(false);
    }
  }, [tutorId, schoolYear]);

  useEffect(() => {
    loadGrid();
  }, [loadGrid]);

  const addDate = async () => {
    if (!newDate || !tutorId || schoolId == null) return;
    if (dates.some((d) => d.session_date === newDate)) {
      toast.error("That date already exists.");
      return;
    }
    setAdding(true);
    const { data, error } = await supabase
      .from("sms_aral_attendance_dates")
      .insert({
        tutor_id: tutorId,
        school_id: Number(schoolId),
        school_year: schoolYear,
        session_date: newDate,
      })
      .select()
      .single();
    setAdding(false);
    if (error) {
      toast.error("Failed to add date.");
      return;
    }
    setDates((prev) =>
      [...prev, data as AralAttendanceDate].sort((a, b) =>
        a.session_date.localeCompare(b.session_date),
      ),
    );
    setNewDate("");
  };

  const removeDate = async (dateId: string) => {
    if (
      !window.confirm(
        "Remove this session date? All attendance marks for it will be deleted.",
      )
    )
      return;
    const { error } = await supabase
      .from("sms_aral_attendance_dates")
      .delete()
      .eq("id", dateId);
    if (error) {
      toast.error("Failed to remove date.");
      return;
    }
    setDates((prev) => prev.filter((d) => d.id !== dateId));
    setMarks((prev) => {
      const next = new Map(prev);
      for (const key of next.keys()) {
        if (key.startsWith(`${dateId}:`)) next.delete(key);
      }
      return next;
    });
  };

  const setStatus = async (
    dateId: string,
    enrollmentId: string,
    status: AralAttendanceStatus,
  ) => {
    const key = markKey(dateId, enrollmentId);
    const prev = marks.get(key);
    // optimistic
    const optimistic: AralAttendanceMark = {
      id: prev?.id ?? `tmp-${key}`,
      date_id: dateId,
      enrollment_id: enrollmentId,
      status,
      created_at: prev?.created_at ?? "",
      updated_at: prev?.updated_at ?? "",
    };
    setMarks((m) => new Map(m).set(key, optimistic));
    const { data, error } = await supabase
      .from("sms_aral_attendance")
      .upsert(
        { date_id: dateId, enrollment_id: enrollmentId, status },
        { onConflict: "date_id,enrollment_id" },
      )
      .select()
      .single();
    if (error) {
      toast.error("Failed to save.");
      setMarks((m) => {
        const next = new Map(m);
        if (prev) next.set(key, prev);
        else next.delete(key);
        return next;
      });
      return;
    }
    setMarks((m) => {
      const next = new Map(m);
      next.set(key, data as AralAttendanceMark);
      return next;
    });
  };

  if (!isTutor) return null;

  const isLoading = loading || gridLoading;

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <CalendarCheck className="h-5 w-5" />
          Attendance
        </h1>
        <p className="text-sm text-muted-foreground">
          Mark attendance for your ARAL learners per session date. Add a date,
          then set each learner Present, Absent, Late, or Excused.
        </p>
      </div>

      <div className="app__content space-y-4">
        <div className="flex flex-wrap items-end gap-3">
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
            <label className="text-sm font-medium mb-1.5 block">
              Add session date
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-40"
              />
              <Button
                onClick={addDate}
                disabled={!newDate || adding}
                size="sm"
              >
                {adding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {ARAL_ATTENDANCE_STATUSES.map((s) => (
            <span key={s.value} className="inline-flex items-center gap-1.5">
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded font-semibold ${s.color}`}
              >
                {s.short}
              </span>
              {s.label}
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
              <div className="overflow-x-auto border rounded-md">
                <table className="text-sm border-collapse min-w-full">
                  <thead>
                    <tr className="bg-muted/60">
                      <th className="border px-3 py-2 text-left min-w-48 sticky left-0 bg-muted/60 z-10">
                        Name of Learner
                      </th>
                      {dates.map((d) => (
                        <th
                          key={d.id}
                          className="border px-2 py-2 text-center whitespace-nowrap"
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span>
                              {format(parseISO(d.session_date), "MMM d")}
                            </span>
                            <button
                              onClick={() => removeDate(d.id)}
                              className="text-muted-foreground hover:text-red-600"
                              title="Remove date"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </th>
                      ))}
                      {dates.length === 0 && (
                        <th className="border px-3 py-2 text-center text-muted-foreground font-normal">
                          Add a session date to begin →
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="border px-3 py-1.5 whitespace-nowrap sticky left-0 bg-background z-10">
                          {learnerName(r)}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {aralProgramLabel(r.program)}
                            {r.grade_level != null &&
                              ` · ${getGradeLevelLabel(r.grade_level)}`}
                          </span>
                        </td>
                        {dates.map((d) => {
                          const mark = marks.get(markKey(d.id, r.id));
                          const status = mark?.status;
                          const cfg = ARAL_ATTENDANCE_STATUSES.find(
                            (s) => s.value === status,
                          );
                          return (
                            <td
                              key={d.id}
                              className={`border p-0 text-center ${cfg?.color ?? ""}`}
                            >
                              <Select
                                value={status ?? ""}
                                onValueChange={(v) =>
                                  setStatus(d.id, r.id, v as AralAttendanceStatus)
                                }
                              >
                                <SelectTrigger className="h-8 w-16 mx-auto rounded-none border-0 bg-transparent justify-center gap-1 font-semibold shadow-none">
                                  <span>{cfg?.short ?? "—"}</span>
                                </SelectTrigger>
                                <SelectContent>
                                  {ARAL_ATTENDANCE_STATUSES.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>
                                      {s.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                          );
                        })}
                        {dates.length === 0 && <td className="border" />}
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
