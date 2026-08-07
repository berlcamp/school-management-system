"use client";

import { AddModal as AddScheduleModal } from "@/app/(protected)/schedules/AddModal";
import { ManageMadrasahStudentsModal } from "./ManageMadrasahStudentsModal";
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
import { getGradeLevelLabel } from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { formatDays, formatTimeRange } from "@/lib/utils/scheduleConflicts";
import { Section, Subject, SubjectSchedule } from "@/types";
import { useCallback, useEffect, useState } from "react";

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
  const [manageMadrasahOpen, setManageMadrasahOpen] = useState(false);
  const [selectedMadrasahSubject, setSelectedMadrasahSubject] =
    useState<Subject | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [schedules, setSchedules] = useState<SubjectSchedule[]>([]);
  const [teacherNames, setTeacherNames] = useState<Record<string, string>>({});
  const [roomNames, setRoomNames] = useState<Record<string, string>>({});

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

  const getSubjectName = (subject: Subject) => {
    if (!subject) return "-";
    return `${subject.code} - ${subject.name}`;
  };

  // Get schedules for a given subject
  const getSchedulesForSubject = (subjectId: string) =>
    schedules.filter((s) => s.subject_id === subjectId);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            View Subjects - {section?.name}
          </DialogTitle>
          <DialogDescription>
            Subjects for this grade level with their schedules in{" "}
            {section?.school_year}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Subjects List from sms_subjects (grade level = section grade level) with their schedules */}
          <div className="space-y-4">
            <label className="text-sm font-medium">
              Subjects for {section?.grade_level != null ? getGradeLevelLabel(section.grade_level) : "-"} ({subjects.length})
            </label>
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">
                Loading...
              </div>
            ) : subjects.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No subjects found for this grade level
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {subjects.map((subject) => {
                  const subjectSchedules = getSchedulesForSubject(subject.id);
                  return (
                    <div
                      key={subject.id}
                      className="border rounded-md p-4 space-y-2 hover:bg-muted/50"
                    >
                      <div className="font-medium text-base flex items-center gap-2">
                        {getSubjectName(subject)}
                        {subject.is_madrasah && (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
                            MEP
                          </span>
                        )}
                      </div>
                      {subject.description && (
                        <div className="text-sm text-muted-foreground line-clamp-2">
                          {subject.description}
                        </div>
                      )}
                      {subject.is_madrasah && subjectSchedules.length > 0 && (
                        <div className="mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-amber-700 border-amber-300 hover:bg-amber-50"
                            onClick={() => {
                              setSelectedMadrasahSubject(subject);
                              setManageMadrasahOpen(true);
                            }}
                          >
                            Manage MEP Students
                          </Button>
                        </div>
                      )}
                      <div className="space-y-1 mt-2">
                        {subjectSchedules.length > 0 ? (
                          <>
                          {subjectSchedules.map((schedule) => (
                            <div
                              key={schedule.id}
                              className="text-sm pl-4 border-l-2 border-primary/20"
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">
                                  {formatDays(schedule.days_of_week)}
                                </span>
                                <span className="text-muted-foreground">
                                  {formatTimeRange(
                                    schedule.start_time,
                                    schedule.end_time,
                                  )}
                                </span>
                                {schedule.teacher_id == null ? (
                                  <TemporaryScheduleBadge />
                                ) : (
                                  <span className="text-muted-foreground">
                                    • {teacherNames[schedule.teacher_id] || "-"}
                                  </span>
                                )}
                                <span className="text-muted-foreground">
                                  • Room: {roomNames[schedule.room_id] || "-"}
                                </span>
                                {schedule.conflict_override && (
                                  <SharedSlotBadge />
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 ml-auto"
                                  onClick={() => {
                                    setEditScheduleData(schedule);
                                    setAddScheduleSubjectId(subject.id);
                                    setAddScheduleSubjectLabel(
                                      getSubjectName(subject)
                                    );
                                    setAddScheduleOpen(true);
                                  }}
                                >
                                  Edit Schedule
                                </Button>
                              </div>
                            </div>
                          ))}
                          {/* A subject may meet at different hours on
                              different days — each such slot is its own
                              schedule entry, so this stays reachable once the
                              first one exists */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 mt-2"
                            onClick={() => {
                              setEditScheduleData(null);
                              setAddScheduleSubjectId(subject.id);
                              setAddScheduleSubjectLabel(
                                getSubjectName(subject)
                              );
                              setAddScheduleOpen(true);
                            }}
                          >
                            + Add another time
                          </Button>
                          </>
                        ) : (
                          <div className="space-y-2 pl-4 border-l-2 border-transparent">
                            <div className="text-sm text-muted-foreground italic">
                              No schedule assigned
                            </div>
                            <Button
                              variant="green"
                              size="sm"
                              onClick={() => {
                                setAddScheduleSubjectId(subject.id);
                                setAddScheduleSubjectLabel(
                                  getSubjectName(subject)
                                );
                                setAddScheduleOpen(true);
                              }}
                              className="h-8"
                            >
                              <svg
                                className="w-3.5 h-3.5 mr-1.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 4v16m8-8H4"
                                />
                              </svg>
                              Add Schedule
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
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
