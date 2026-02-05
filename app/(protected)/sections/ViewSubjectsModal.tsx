"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase/client";
import { formatDays, formatTimeRange } from "@/lib/utils/scheduleConflicts";
import { Section, Subject, SubjectSchedule } from "@/types";
import { useEffect, useState } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  section: Section | null;
}

export const ViewSubjectsModal = ({ isOpen, onClose, section }: ModalProps) => {
  const [loading, setLoading] = useState(false);
  const [schedules, setSchedules] = useState<
    (SubjectSchedule & { subject: Subject })[]
  >([]);
  const [teacherNames, setTeacherNames] = useState<Record<string, string>>({});
  const [roomNames, setRoomNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen && section) {
      fetchSchedules();
    }
  }, [isOpen, section]);

  const fetchSchedules = async () => {
    if (!section) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sms_subject_schedules")
        .select(
          `
          *,
          subject:sms_subjects!sms_subject_schedules_subject_id_fkey(*)
        `
        )
        .eq("section_id", section.id)
        .eq("school_year", section.school_year)
        .order("start_time", { ascending: true });

      if (error) throw error;

      setSchedules(data || []);

      // Fetch teacher and room names
      const teacherIds = Array.from(
        new Set((data || []).map((s) => s.teacher_id))
      );
      const roomIds = Array.from(new Set((data || []).map((s) => s.room_id)));

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
      console.error("Error fetching schedules:", err);
    } finally {
      setLoading(false);
    }
  };

  const getSubjectName = (subject: Subject) => {
    if (!subject) return "-";
    return `${subject.code} - ${subject.name}`;
  };

  // Group schedules by subject to show unique subjects
  const uniqueSubjects = Array.from(
    new Map(
      schedules.map((schedule) => [
        schedule.subject_id,
        {
          subject: schedule.subject,
          schedules: schedules.filter(
            (s) => s.subject_id === schedule.subject_id
          ),
        },
      ])
    ).values()
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            View Subjects - {section?.name}
          </DialogTitle>
          <DialogDescription>
            Subjects scheduled for this section in {section?.school_year}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Subjects List */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Scheduled Subjects ({uniqueSubjects.length})
            </label>
            <div className="border rounded-md">
              {loading ? (
                <div className="p-8 text-center text-muted-foreground">
                  Loading...
                </div>
              ) : uniqueSubjects.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No subjects scheduled for this section
                </div>
              ) : (
                <div className="divide-y">
                  {uniqueSubjects.map(
                    ({ subject, schedules: subjectSchedules }) => (
                      <div
                        key={subject.id}
                        className="p-4 space-y-2 hover:bg-muted/50"
                      >
                        <div className="font-medium text-base">
                          {getSubjectName(subject)}
                        </div>
                        {subject.description && (
                          <div className="text-sm text-muted-foreground">
                            {subject.description}
                          </div>
                        )}
                        <div className="space-y-1 mt-2">
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
                                    schedule.end_time
                                  )}
                                </span>
                                <span className="text-muted-foreground">
                                  • {teacherNames[schedule.teacher_id] || "-"}
                                </span>
                                <span className="text-muted-foreground">
                                  • Room: {roomNames[schedule.room_id] || "-"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
