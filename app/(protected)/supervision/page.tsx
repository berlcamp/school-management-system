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
import { useStaffModuleAccess } from "@/hooks/useStaffModuleAccess";
import {
  SCHEDULE_STATUS_LABELS,
  SUPERVISION_TERMS,
} from "@/lib/constants/supervision";
import { downloadIcs } from "@/lib/utils/calendar";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { fetchSchoolSettings } from "@/lib/utils/schoolSettings";
import { fromDatetimeLocal, scheduleToCalendarEvent } from "@/lib/utils/supervision";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import type { SupervisionScheduleStatusValue } from "@/types";
import {
  CalendarDays,
  Download,
  Loader2,
  Plus,
  Telescope,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ObservationPanel } from "./components/ObservationPanel";
import { ScheduleCard } from "./components/ScheduleCard";
import { ScheduleModal, type ScheduleFormValues } from "./components/ScheduleModal";
import {
  useDesignatedObservers,
  useSupervisionSchedules,
  useSupervisionStaff,
  type ScheduleBundle,
} from "./useSupervision";

type StatusFilter = "all" | SupervisionScheduleStatusValue;

const STATUS_FILTERS: StatusFilter[] = [
  "all",
  "proposed",
  "approved",
  "completed",
  "rejected",
  "cancelled",
];

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const hasAccess = useStaffModuleAccess();
  const schoolId = user?.school_id ?? null;

  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [term, setTerm] = useState<number | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const { staff } = useSupervisionStaff(schoolId);
  const { observers: designated } = useDesignatedObservers(schoolId, schoolYear);
  const { bundles, loading, reload } = useSupervisionSchedules({
    schoolId,
    schoolYear,
    term,
  });

  const [school, setSchool] = useState<{ name: string; address: string } | null>(
    null,
  );
  const [principal, setPrincipal] = useState<{ name: string; title: string }>({
    name: "",
    title: "Principal",
  });

  useEffect(() => {
    let isMounted = true;
    if (schoolId == null) return;
    (async () => {
      const [{ data }, settings] = await Promise.all([
        supabase
          .from("sms_schools")
          .select("name, address")
          .eq("id", Number(schoolId))
          .maybeSingle(),
        fetchSchoolSettings(String(schoolId)),
      ]);
      if (!isMounted) return;
      setSchool({
        name: (data?.name as string) ?? "",
        address: (data?.address as string) ?? "",
      });
      setPrincipal({
        name: settings.principal_name ?? "",
        title: settings.principal_title ?? "Principal",
      });
    })();
    return () => {
      isMounted = false;
    };
  }, [schoolId]);

  const staffById = useMemo(
    () => new Map(staff.map((s) => [s.id, s])),
    [staff],
  );

  /** Only actively designated observers may be assigned to a new slot. */
  const observerPool = useMemo(
    () =>
      designated
        .filter((o) => o.is_active)
        .map((o) => staffById.get(String(o.user_id)))
        .filter((s): s is NonNullable<typeof s> => Boolean(s)),
    [designated, staffById],
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleBundle | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return bundles.filter((b) => {
      if (status !== "all" && b.schedule.status !== status) return false;
      if (!needle) return true;
      const teacher = staffById.get(String(b.schedule.teacher_id))?.name ?? "";
      return `${teacher} ${b.schedule.class_label ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [bundles, status, search, staffById]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const b of bundles) {
      out[b.schedule.status] = (out[b.schedule.status] ?? 0) + 1;
    }
    return out;
  }, [bundles]);

  const saveSchedule = async (values: ScheduleFormValues) => {
    if (schoolId == null) return;
    setSubmitting(true);
    try {
      const payload = {
        school_id: Number(schoolId),
        school_year: schoolYear,
        term: values.term,
        teacher_id: Number(values.teacher_id),
        teacher_position: values.teacher_position || null,
        career_stage: values.career_stage,
        supervision_type: values.supervision_type,
        observation_round: values.observation_round,
        quarter: values.quarter,
        class_label: values.class_label || null,
        pre_conference_at: fromDatetimeLocal(values.pre_conference_at),
        observation_at: fromDatetimeLocal(values.observation_at),
        observation_end_at: fromDatetimeLocal(values.observation_end_at),
        focus_kra: values.focus_kra || null,
        focus_indicator: values.focus_indicator || null,
        lesson_plan_url: values.lesson_plan_url || null,
        notes: values.notes || null,
      };

      let scheduleId = editing?.schedule.id ?? null;
      if (scheduleId) {
        // Editing a slot returns it to 'proposed' and clears the old decision:
        // an approved-then-moved observation must be re-approved, not silently
        // keep an approval that referred to a different date.
        const { error } = await supabase
          .from("sms_supervision_schedules")
          .update({
            ...payload,
            status: "proposed",
            decided_by: null,
            decided_at: null,
            decision_notes: null,
          })
          .eq("id", Number(scheduleId));
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase
          .from("sms_supervision_schedules")
          .insert({
            ...payload,
            status: "proposed",
            proposed_by: user?.id ? Number(user.id) : null,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        scheduleId = String(data.id);
      }

      // Replace the observer assignment wholesale — slots are positional and a
      // partial update would leave gaps in the E-3 signature lines.
      const { error: delErr } = await supabase
        .from("sms_supervision_schedule_observers")
        .delete()
        .eq("schedule_id", Number(scheduleId));
      if (delErr) throw new Error(delErr.message);

      if (values.observer_ids.length > 0) {
        const { error: insErr } = await supabase
          .from("sms_supervision_schedule_observers")
          .insert(
            values.observer_ids.map((id, index) => ({
              schedule_id: Number(scheduleId),
              user_id: Number(id),
              slot: index + 1,
            })),
          );
        if (insErr) throw new Error(insErr.message);
      }

      toast.success(editing ? "Schedule updated." : "Schedule submitted.");
      setModalOpen(false);
      setEditing(null);
      reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save the schedule.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const decide = async (
    bundle: ScheduleBundle,
    next: "approved" | "rejected",
  ) => {
    const notes =
      next === "rejected"
        ? window.prompt("Reason for rejecting this schedule (optional):") ?? ""
        : "";
    const { error } = await supabase
      .from("sms_supervision_schedules")
      .update({
        status: next,
        decided_by: user?.id ? Number(user.id) : null,
        decided_at: new Date().toISOString(),
        decision_notes: notes || null,
      })
      .eq("id", Number(bundle.schedule.id));
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(next === "approved" ? "Schedule approved." : "Schedule rejected.");
    reload();
  };

  /** One .ics holding every approved observation currently in view. */
  const exportAll = () => {
    const approved = filtered.filter(
      (b) => b.schedule.status === "approved" || b.schedule.status === "completed",
    );
    if (approved.length === 0) {
      toast.error("No approved schedules to export.");
      return;
    }
    downloadIcs(
      approved.map((b) =>
        scheduleToCalendarEvent(b.schedule, {
          teacherName: staffById.get(String(b.schedule.teacher_id))?.name ?? "",
          observerNames: b.observers
            .map((o) => staffById.get(String(o.user_id))?.name ?? "")
            .filter(Boolean),
          schoolName: school?.name,
        }),
      ),
      `observation-schedule-${schoolYear}`,
    );
    toast.success(`Exported ${approved.length} observation(s).`);
  };

  if (!hasAccess) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            You do not have access to Instructional Supervision.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Telescope className="h-6 w-6" />
            Instructional Supervision
          </h1>
          <p className="text-sm text-muted-foreground">
            Suggested and approved classroom observations, and the COT forms filed
            against them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/supervision/observers">
              <UserCheck className="mr-2 h-4 w-4" />
              Observers
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/supervision/plan">
              <CalendarDays className="mr-2 h-4 w-4" />
              Supervisory Plan
            </Link>
          </Button>
          <Button variant="outline" onClick={exportAll}>
            <Download className="mr-2 h-4 w-4" />
            Export approved
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New schedule
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-3 p-4">
          <div className="w-40">
            <Select value={schoolYear} onValueChange={setSchoolYear}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getSchoolYearOptions().map((sy) => (
                  <SelectItem key={sy} value={sy}>
                    {sy}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-44">
            <Select
              value={term != null ? String(term) : "all"}
              onValueChange={(v) => setTerm(v === "all" ? null : Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All terms</SelectItem>
                {SUPERVISION_TERMS.map((t) => (
                  <SelectItem key={t.value} value={String(t.value)}>
                    {t.label} ({t.months})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-48">
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as StatusFilter)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "all"
                      ? `All statuses (${bundles.length})`
                      : `${SCHEDULE_STATUS_LABELS[s]} (${counts[s] ?? 0})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            className="w-64"
            placeholder="Search teacher or class…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading schedules…
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No observation schedules for these filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((bundle) => (
            <ScheduleCard
              key={String(bundle.schedule.id)}
              bundle={bundle}
              staffById={staffById}
              schoolName={school?.name}
              schoolAddress={school?.address}
              principalName={principal.name}
              principalTitle={principal.title}
              canDecide
              onEdit={() => {
                setEditing(bundle);
                setModalOpen(true);
              }}
              onDecide={(next) => decide(bundle, next)}
              onExported={reload}
            >
              <ObservationPanel
                bundle={bundle}
                teacherName={
                  staffById.get(String(bundle.schedule.teacher_id))?.name ?? ""
                }
                staffById={staffById}
                schoolName={school?.name}
                schoolAddress={school?.address}
                currentUserId={user?.id ?? null}
                onChanged={reload}
              />
            </ScheduleCard>
          ))}
        </div>
      )}

      <ScheduleModal
        open={modalOpen}
        onOpenChange={(v) => {
          setModalOpen(v);
          if (!v) setEditing(null);
        }}
        schoolYear={schoolYear}
        existing={
          editing
            ? { schedule: editing.schedule, observers: editing.observers }
            : null
        }
        staff={staff}
        observerPool={observerPool}
        submitting={submitting}
        onSubmit={saveSchedule}
      />
    </div>
  );
}
