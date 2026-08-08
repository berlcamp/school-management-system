"use client";

import { AddModal as AddScheduleModal } from "@/app/(protected)/schedules/AddModal";
import { ManageMadrasahStudentsModal } from "./ManageMadrasahStudentsModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SharedSlotBadge } from "@/components/SharedSlotBadge";
import { TemporaryScheduleBadge } from "@/components/TemporaryScheduleBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getGradeLevelLabel } from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { formatDays, formatTimeRange } from "@/lib/utils/scheduleConflicts";
import { Section, Subject, SubjectSchedule } from "@/types";
import {
  CalendarPlus,
  DoorOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  section: Section | null;
  onScheduleUpdate?: () => void;
}

export const ViewSubjectsModal = ({ isOpen, onClose, section, onScheduleUpdate }: ModalProps) => {
  const user = useAppSelector((state) => state.user.user);
  const [loading, setLoading] = useState(false);
  const [addScheduleOpen, setAddScheduleOpen] = useState(false);
  const [addScheduleSubjectId, setAddScheduleSubjectId] = useState<
    string | null
  >(null);
  const [addScheduleSubjectLabel, setAddScheduleSubjectLabel] = useState<
    string | null
  >(null);
  const [editScheduleData, setEditScheduleData] =
    useState<SubjectSchedule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    schedule: SubjectSchedule;
    subjectLabel: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [manageMadrasahOpen, setManageMadrasahOpen] = useState(false);
  const [selectedMadrasahSubject, setSelectedMadrasahSubject] =
    useState<Subject | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [schedules, setSchedules] = useState<SubjectSchedule[]>([]);
  const [teacherNames, setTeacherNames] = useState<Record<string, string>>({});
  const [roomNames, setRoomNames] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [onlyUnscheduled, setOnlyUnscheduled] = useState(false);

  const fetchData = useCallback(async () => {
    if (!section) return;

    setLoading(true);
    try {
      // 1. Fetch subjects (school-scoped)
      let subjectsQuery = supabase
        .from("sms_subjects")
        .select("*")
        .eq("grade_level", section.grade_level)
        .eq("is_active", true)
        .order("code", { ascending: true });
      if (user?.school_id != null) {
        subjectsQuery = subjectsQuery.eq("school_id", user.school_id);
      }
      const { data: subjectsData, error: subjectsError } = await subjectsQuery;
      if (subjectsError) throw subjectsError;
      setSubjects(subjectsData || []);

      // 2. Fetch schedules with teacher and room names in a single joined query
      let schedulesQuery = supabase
        .from("sms_subject_schedules")
        .select(
          `
          *,
          teacher:teacher_id (id, name),
          room:room_id (id, name)
        `,
        )
        .eq("section_id", section.id)
        .eq("school_year", section.school_year)
        .order("start_time", { ascending: true });
      if (user?.school_id != null) {
        schedulesQuery = schedulesQuery.eq("school_id", user.school_id);
      }
      const { data: schedulesData, error: schedulesError } = await schedulesQuery;
      if (schedulesError) throw schedulesError;

      // Extract teacher/room name maps from the joined data
      const tNames: Record<string, string> = {};
      const rNames: Record<string, string> = {};
      const cleanSchedules = (schedulesData || []).map((s) => {
        const teacher = s.teacher as { id: string; name: string } | null;
        const room = s.room as { id: string; name: string } | null;
        if (teacher) tNames[teacher.id] = teacher.name;
        if (room) rNames[room.id] = room.name;
        // Strip joined fields so the schedule type stays clean
        const { teacher: _t, room: _r, ...schedule } = s;
        return schedule as SubjectSchedule;
      });
      setSchedules(cleanSchedules);
      setTeacherNames(tNames);
      setRoomNames(rNames);
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  }, [section, user?.school_id]);

  useEffect(() => {
    if (isOpen && section) {
      fetchData();
    }
  }, [isOpen, section, fetchData]);

  // Reset the toolbar between openings so a stale filter never hides subjects
  useEffect(() => {
    if (!isOpen) {
      setSearch("");
      setOnlyUnscheduled(false);
    }
  }, [isOpen]);

  // Deletes one time block only — a subject that meets on several days at
  // different hours is several rows, so the rest of its schedule stays.
  const handleDeleteSchedule = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      let deleteQuery = supabase
        .from("sms_subject_schedules")
        .delete()
        .eq("id", deleteTarget.schedule.id);
      if (user?.school_id != null) {
        deleteQuery = deleteQuery.eq("school_id", user.school_id);
      }
      const { error } = await deleteQuery;
      if (error) throw error;

      toast.success("Schedule deleted successfully!");
      setDeleteTarget(null);
      await fetchData();
      onScheduleUpdate?.();
    } catch (err) {
      console.error("Error deleting schedule:", err);
      toast.error("Failed to delete schedule. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const getSubjectName = (subject: Subject) => {
    if (!subject) return "-";
    return `${subject.code} - ${subject.name}`;
  };

  const openScheduleModal = (subject: Subject, schedule?: SubjectSchedule) => {
    setEditScheduleData(schedule ?? null);
    setAddScheduleSubjectId(subject.id);
    setAddScheduleSubjectLabel(getSubjectName(subject));
    setAddScheduleOpen(true);
  };

  // Get schedules for a given subject
  const getSchedulesForSubject = useCallback(
    (subjectId: string) => schedules.filter((s) => s.subject_id === subjectId),
    [schedules],
  );

  const scheduledCount = useMemo(
    () =>
      subjects.filter((s) => getSchedulesForSubject(s.id).length > 0).length,
    [subjects, getSchedulesForSubject],
  );
  const unscheduledCount = subjects.length - scheduledCount;

  const visibleSubjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    return subjects.filter((subject) => {
      if (onlyUnscheduled && getSchedulesForSubject(subject.id).length > 0) {
        return false;
      }
      if (!term) return true;
      return (
        subject.code?.toLowerCase().includes(term) ||
        subject.name?.toLowerCase().includes(term)
      );
    });
  }, [subjects, search, onlyUnscheduled, getSchedulesForSubject]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle className="text-xl font-semibold">
            Manage Schedules — {section?.name}
          </DialogTitle>
          <DialogDescription>
            {section?.grade_level != null
              ? getGradeLevelLabel(section.grade_level)
              : "-"}{" "}
            · SY {section?.school_year}
            {!loading && subjects.length > 0 && (
              <>
                {" "}
                ·{" "}
                <span
                  className={
                    unscheduledCount > 0
                      ? "font-medium text-amber-700"
                      : "font-medium text-emerald-700"
                  }
                >
                  {scheduledCount} of {subjects.length} subjects scheduled
                </span>
              </>
            )}
          </DialogDescription>

          {/* Toolbar — a grade level can carry a dozen subjects, and the usual
              task is "which ones still have no schedule?" */}
          {!loading && subjects.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search subject code or name..."
                  className="h-9 pl-8"
                />
              </div>
              <Button
                type="button"
                variant={onlyUnscheduled ? "default" : "outline"}
                size="sm"
                className="h-9 shrink-0"
                onClick={() => setOnlyUnscheduled((v) => !v)}
                aria-pressed={onlyUnscheduled}
              >
                Needs schedule ({unscheduledCount})
              </Button>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-3 rounded-lg border p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </div>
          ) : subjects.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center">
              <p className="text-sm font-medium">
                No subjects for this grade level
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add subjects for{" "}
                {section?.grade_level != null
                  ? getGradeLevelLabel(section.grade_level)
                  : "this grade level"}{" "}
                first, then come back to schedule them.
              </p>
            </div>
          ) : visibleSubjects.length === 0 ? (
            <div className="rounded-lg border border-dashed py-12 text-center">
              <p className="text-sm font-medium">No subjects match</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {onlyUnscheduled
                  ? "Every subject here already has a schedule."
                  : "Try a different search term."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
              {visibleSubjects.map((subject) => {
                const subjectSchedules = getSchedulesForSubject(subject.id);
                return (
                  <div
                    key={subject.id}
                    className="flex flex-col overflow-hidden rounded-lg border bg-card"
                  >
                    {/* Subject header */}
                    <div className="flex items-start justify-between gap-2 border-b bg-muted/40 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground ring-1 ring-border">
                            {subject.code}
                          </span>
                          {subject.is_madrasah && (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                              MEP
                            </span>
                          )}
                        </div>
                        <div
                          className="mt-1 truncate text-sm font-semibold"
                          title={subject.name}
                        >
                          {subject.name}
                        </div>
                        {subject.description && (
                          <div
                            className="truncate text-xs text-muted-foreground"
                            title={subject.description}
                          >
                            {subject.description}
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border">
                        {subjectSchedules.length === 0
                          ? "No schedule"
                          : `${subjectSchedules.length} ${
                              subjectSchedules.length === 1 ? "block" : "blocks"
                            }`}
                      </span>
                    </div>

                    {/* Time blocks */}
                    <div className="flex flex-1 flex-col gap-2 p-3">
                      {subjectSchedules.length > 0 ? (
                        subjectSchedules.map((schedule) => (
                          <div
                            key={schedule.id}
                            className="rounded-md border border-l-2 border-l-emerald-500 bg-background px-3 py-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="text-sm font-semibold">
                                    {formatDays(schedule.days_of_week)}
                                  </span>
                                  <span className="text-sm text-muted-foreground tabular-nums">
                                    {formatTimeRange(
                                      schedule.start_time,
                                      schedule.end_time,
                                    )}
                                  </span>
                                  {schedule.conflict_override && (
                                    <SharedSlotBadge />
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                  {schedule.teacher_id == null ? (
                                    <TemporaryScheduleBadge />
                                  ) : (
                                    <span className="inline-flex min-w-0 items-center gap-1">
                                      <UserRound className="h-3 w-3 shrink-0" />
                                      <span className="truncate">
                                        {teacherNames[schedule.teacher_id] ||
                                          "-"}
                                      </span>
                                    </span>
                                  )}
                                  <span className="inline-flex min-w-0 items-center gap-1">
                                    <DoorOpen className="h-3 w-3 shrink-0" />
                                    <span className="truncate">
                                      {roomNames[schedule.room_id] || "-"}
                                    </span>
                                  </span>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title="Edit this time block"
                                  aria-label={`Edit ${formatDays(
                                    schedule.days_of_week,
                                  )} ${formatTimeRange(
                                    schedule.start_time,
                                    schedule.end_time,
                                  )} for ${getSubjectName(subject)}`}
                                  onClick={() =>
                                    openScheduleModal(subject, schedule)
                                  }
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  title="Delete this time block"
                                  aria-label={`Delete ${formatDays(
                                    schedule.days_of_week,
                                  )} ${formatTimeRange(
                                    schedule.start_time,
                                    schedule.end_time,
                                  )} for ${getSubjectName(subject)}`}
                                  onClick={() =>
                                    setDeleteTarget({
                                      schedule,
                                      subjectLabel: getSubjectName(subject),
                                    })
                                  }
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <button
                          type="button"
                          onClick={() => openScheduleModal(subject)}
                          className="flex w-full cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed px-3 py-6 text-center transition-colors hover:border-emerald-400 hover:bg-emerald-50/50"
                        >
                          <CalendarPlus className="h-5 w-5 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            Add schedule
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Set days, time, teacher and room
                          </span>
                        </button>
                      )}
                    </div>

                    {/* Card actions — a subject may meet at different hours on
                        different days, and each such slot is its own entry, so
                        adding stays reachable once the first one exists */}
                    {subjectSchedules.length > 0 && (
                      <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
                        {subject.is_madrasah ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                            onClick={() => {
                              setSelectedMadrasahSubject(subject);
                              setManageMadrasahOpen(true);
                            }}
                          >
                            <Users className="h-3.5 w-3.5" />
                            MEP Students
                          </Button>
                        ) : (
                          <span />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                          onClick={() => openScheduleModal(subject)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add time block
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
      {section && (
        <AddScheduleModal
          isOpen={addScheduleOpen}
          onClose={() => {
            setAddScheduleOpen(false);
            setAddScheduleSubjectId(null);
            setAddScheduleSubjectLabel(null);
            setEditScheduleData(null);
          }}
          initialSectionId={String(section.id)}
          initialSchoolYear={section.school_year}
          initialSubjectId={
            addScheduleSubjectId != null
              ? String(addScheduleSubjectId)
              : undefined
          }
          initialSubjectLabel={addScheduleSubjectLabel ?? undefined}
          subjectLocked={!!addScheduleSubjectId}
          conflictCheckSchoolYear={section.school_year}
          onSuccess={() => {
            fetchData();
            onScheduleUpdate?.();
          }}
          skipReduxUpdate
          editData={editScheduleData}
        />
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Schedule Block"
        description={
          deleteTarget ? (
            <>
              Remove{" "}
              <span className="font-medium">
                {formatDays(deleteTarget.schedule.days_of_week)}{" "}
                {formatTimeRange(
                  deleteTarget.schedule.start_time,
                  deleteTarget.schedule.end_time,
                )}
              </span>{" "}
              for {deleteTarget.subjectLabel}? Other time blocks of this subject
              are not affected. This cannot be undone.
            </>
          ) : undefined
        }
        confirmText="Delete"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDeleteSchedule}
      />
      {section && (
        <ManageMadrasahStudentsModal
          isOpen={manageMadrasahOpen}
          onClose={() => {
            setManageMadrasahOpen(false);
            setSelectedMadrasahSubject(null);
          }}
          subject={selectedMadrasahSubject}
          section={section}
          onSuccess={fetchData}
        />
      )}
    </Dialog>
  );
};
