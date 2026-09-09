"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  getCurrentSchoolYear,
  getGradingPeriods,
  getGradingPeriodType,
} from "@/lib/utils/schoolYear";
import type { Student } from "@/types";
import { Loader2, MessageSquareText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

/**
 * TEACHER'S COMMENTS / REMARKS for the MATATAG report card (migration 182).
 *
 * The whole section at once, one grading period at a time, because that is how
 * the task actually arrives: an adviser writes a comment for every learner in
 * the class three times a year. Entering them one at a time through the
 * learner menu would be forty round-trips per term — the same reason the
 * Kindergarten Comments tab is a list rather than a per-learner dialog.
 *
 * The period buttons come from `getGradingPeriods(schoolYear)`, the same helper
 * the printed card builds its boxes from, so the screen and the paper cannot
 * disagree about how many there are: three headed "Term" from SY 2026-2027,
 * four headed "Quarter" before it.
 *
 * `focusStudentId` scrolls to and highlights one learner, which is what the
 * per-learner menu entry uses — it opens the same list rather than a second,
 * narrower surface that could drift from it.
 */

/** Debounce on the free text; the same delay the other remarks screens use. */
const SAVE_DELAY_MS = 800;

interface ReportCardRemarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  sectionId: string;
  sectionName: string;
  schoolYear: string;
  students: Student[];
  /** Optional learner to scroll to and highlight on open. */
  focusStudentId?: string | null;
}

export function ReportCardRemarksModal({
  isOpen,
  onClose,
  sectionId,
  sectionName,
  schoolYear,
  students,
  focusStudentId,
}: ReportCardRemarksModalProps) {
  const periods = getGradingPeriods(schoolYear);
  const periodNoun = getGradingPeriodType(schoolYear) === "term" ? "Term" : "Quarter";

  const [period, setPeriod] = useState<number>(periods[0]?.value ?? 1);
  // remarks: studentId -> period -> text
  const [remarks, setRemarks] = useState<Record<string, Record<number, string>>>({});
  const [loading, setLoading] = useState(false);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const isMounted = useRef(true);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const user = useAppSelector((state) => state.user.user);

  const isPreviousYear = schoolYear !== getCurrentSchoolYear();
  const { settings, isLoading: settingsLoading } = useSchoolSettings(
    true,
    user?.school_id,
  );
  const yearLocked = isPreviousYear && !settings.allow_edit_previous_school_year;
  const isLocked = yearLocked || settingsLoading;

  useEffect(() => {
    isMounted.current = true;
    const pending = timers.current;
    return () => {
      isMounted.current = false;
      Object.values(pending).forEach(clearTimeout);
    };
  }, []);

  const fetchRemarks = useCallback(async () => {
    if (!isOpen || !sectionId || !schoolYear) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("sms_report_card_remarks")
      .select("student_id, term, remarks")
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear);

    if (!isMounted.current) return;
    if (error) {
      console.error("Report card remarks load:", error);
      toast.error("Failed to load remarks");
      setLoading(false);
      return;
    }

    const map: Record<string, Record<number, string>> = {};
    (data || []).forEach((row) => {
      const sid = String(row.student_id);
      map[sid] ??= {};
      map[sid][row.term as number] = (row.remarks as string) ?? "";
    });
    setRemarks(map);
    setLoading(false);
  }, [isOpen, sectionId, schoolYear]);

  useEffect(() => {
    void fetchRemarks();
  }, [fetchRemarks]);

  // A period that does not exist on this school year would leave the list
  // editing a box the card never prints.
  useEffect(() => {
    if (!periods.some((p) => p.value === period)) {
      setPeriod(periods[0]?.value ?? 1);
    }
  }, [periods, period]);

  useEffect(() => {
    if (!isOpen || !focusStudentId || loading) return;
    const row = rowRefs.current[focusStudentId];
    row?.scrollIntoView({ block: "center" });
  }, [isOpen, focusStudentId, loading]);

  const save = useCallback(
    (studentId: string, value: string) => {
      const key = `${studentId}:${period}`;
      clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => {
        setSavingKeys((prev) => new Set(prev).add(key));
        void (async () => {
          const { error } = await supabase.from("sms_report_card_remarks").upsert(
            {
              student_id: Number(studentId),
              section_id: Number(sectionId),
              school_id: user?.school_id ? Number(user.school_id) : null,
              school_year: schoolYear,
              term: period,
              remarks: value,
              created_by: user?.system_user_id ?? null,
            },
            {
              onConflict: "student_id,section_id,school_year,term",
              ignoreDuplicates: false,
            },
          );
          if (error) {
            console.error("Report card remarks save:", error);
            toast.error("Failed to save remarks");
          }
          if (isMounted.current) {
            setSavingKeys((prev) => {
              const next = new Set(prev);
              next.delete(key);
              return next;
            });
          }
        })();
      }, SAVE_DELAY_MS);
    },
    [period, sectionId, schoolYear, user?.school_id, user?.system_user_id],
  );

  const update = useCallback(
    (studentId: string, value: string) => {
      if (yearLocked) {
        toast.error("Editing previous school year records is disabled");
        return;
      }
      setRemarks((prev) => ({
        ...prev,
        [studentId]: { ...(prev[studentId] || {}), [period]: value },
      }));
      save(studentId, value);
    },
    [period, save, yearLocked],
  );

  const learnerName = (s: Student) =>
    `${s.last_name}, ${s.first_name} ${s.middle_name || ""} ${s.suffix || ""}`
      .replace(/\s+/g, " ")
      .trim();

  const filled = students.filter((s) =>
    (remarks[s.id]?.[period] ?? "").trim().length > 0,
  ).length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!h-[calc(100vh-2rem)] !w-[calc(100vw-2rem)] !max-w-4xl !translate-x-[-50%] !translate-y-[-50%] flex flex-col gap-0 p-0">
        <DialogHeader className="flex-shrink-0 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
            <DialogTitle className="flex items-center gap-2 text-base">
              <MessageSquareText className="h-4 w-4 shrink-0" />
              Report Card Remarks
              <span className="font-normal text-muted-foreground">|</span>
              <span className="font-normal text-muted-foreground">
                {sectionName}
              </span>
            </DialogTitle>
            <div className="flex items-center gap-3">
              <Select
                value={String(period)}
                onValueChange={(v) => setPeriod(Number(v))}
              >
                <SelectTrigger size="sm" className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.value} value={String(p.value)}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {savingKeys.size > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving...
                </span>
              )}
            </div>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            School Year {schoolYear} &mdash; printed in the TEACHER&rsquo;S
            COMMENTS / REMARKS block of the card, under {periodNoun}{" "}
            {period}. {filled} of {students.length} written.
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          {yearLocked && (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-600">
              Editing records from previous school years is disabled. Enable it
              in School Settings to make changes.
            </p>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading remarks...
            </div>
          ) : students.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              No enrolled learners in this section.
            </div>
          ) : (
            <div className="divide-y rounded-md border">
              {students.map((student, idx) => (
                <div
                  key={student.id}
                  ref={(el) => {
                    rowRefs.current[student.id] = el;
                  }}
                  className={`flex gap-3 p-3 ${
                    focusStudentId === student.id ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="w-56 shrink-0 text-sm leading-snug">
                    <span className="text-muted-foreground tabular-nums">
                      {idx + 1}.
                    </span>{" "}
                    {learnerName(student)}
                  </div>
                  <Textarea
                    value={remarks[student.id]?.[period] ?? ""}
                    onChange={(e) => update(student.id, e.target.value)}
                    disabled={isLocked}
                    rows={3}
                    placeholder={`${periodNoun} ${period} comment for the parent`}
                    className="flex-1 text-sm"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center justify-end border-t border-border bg-muted/30 px-4 py-2.5">
          <span className="text-xs text-muted-foreground">
            Changes are saved automatically
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
