"use client";

import { AddModal as AddScheduleModal } from "@/app/(protected)/schedules/AddModal";
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
import { supabase } from "@/lib/supabase/client";
import { formatDays, formatTimeRange } from "@/lib/utils/scheduleConflicts";
import { Section, Subject, SubjectSchedule } from "@/types";
import { useCallback, useEffect, useState } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  section: Section | null;
}

export const ViewSubjectsModal = ({ isOpen, onClose, section }: ModalProps) => {
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
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [schedules, setSchedules] = useState<SubjectSchedule[]>([]);
  const [teacherNames, setTeacherNames] = useState<Record<string, string>>({});
  const [roomNames, setRoomNames] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    if (!section) return;

    setLoading(true);
    try {
      // 1. Fetch subjects from sms_subjects where grade_level = section grade_level
      const { data: subjectsData, error: subjectsError } = await supabase
        .from("sms_subjects")
        .select("*")
        .eq("grade_level", section.grade_level)
        .eq("is_active", true)
        .order("code", { ascending: true });

      if (subjectsError) throw subjectsError;
      setSubjects(subjectsData || []);

      // 2. Fetch schedules for this section
      const { data: schedulesData, error: schedulesError } = await supabase
        .from("sms_subject_schedules")
        .select("*")
        .eq("section_id", section.id)
        .eq("school_year", section.school_year)
        .order("start_time", { ascending: true });

      if (schedulesError) throw schedulesError;
      setSchedules(schedulesData || []);

      // Fetch teacher and room names
      const teacherIds = Array.from(
        new Set((schedulesData || []).map((s) => s.teacher_id)),
      );
      const roomIds = Array.from(new Set((schedulesData || []).map((s) => s.room_id)));

      if (teacherIds.length > 0) {
        const { data: teachers } = await supabase
          .from("sms_users")
          .select("id, name")
          .in("id", teacherIds);
        if (teachers) {
          const names: Record<string, string> = {};
          teachers.forEach((teacher) => {
            names[teacher.id] = teacher.name;
          });
          setTeacherNames(names);
        }
      }

      if (roomIds.length > 0) {
        const { data: rooms } = await supabase
          .from("sms_rooms")
          .select("id, name")
          .in("id", roomIds);
        if (rooms) {
          const names: Record<string, string> = {};
          rooms.forEach((room) => {
            names[room.id] = room.name;
          });
          setRoomNames(names);
        }
      }
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  }, [section]);

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
                      <div className="font-medium text-base">
                        {getSubjectName(subject)}
                      </div>
                      {subject.description && (
                        <div className="text-sm text-muted-foreground line-clamp-2">
                          {subject.description}
                        </div>
                      )}
                      <div className="space-y-1 mt-2">
                        {subjectSchedules.length > 0 ? (
                          subjectSchedules.map((schedule) => (
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
                                <span className="text-muted-foreground">
                                  • {teacherNames[schedule.teacher_id] || "-"}
                                </span>
                                <span className="text-muted-foreground">
                                  • Room: {roomNames[schedule.room_id] || "-"}
                                </span>
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
                          ))
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
          onSuccess={fetchData}
          skipReduxUpdate
          editData={editScheduleData}
        />
      )}
    </Dialog>
  );
};
