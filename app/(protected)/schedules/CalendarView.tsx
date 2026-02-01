"use client";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";
import { formatTimeRange } from "@/lib/utils/scheduleConflicts";
import { SubjectSchedule } from "@/types";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { AddModal } from "./AddModal";

interface CalendarViewProps {
  schedules: SubjectSchedule[];
  schoolYear?: string;
  onScheduleClick?: (schedule: SubjectSchedule) => void;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIME_SLOTS = Array.from({ length: 14 }, (_, i) => {
  const hour = 7 + i;
  return `${hour.toString().padStart(2, "0")}:00`;
});

export const CalendarView = ({
  schedules,
  schoolYear,
  onScheduleClick,
}: CalendarViewProps) => {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedSchedule, setSelectedSchedule] =
    useState<SubjectSchedule | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [subjectNames, setSubjectNames] = useState<Record<string, string>>({});
  const [sectionNames, setSectionNames] = useState<Record<string, string>>({});
  const [roomNames, setRoomNames] = useState<Record<string, string>>({});

  // Get start of week (Monday)
  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(d.setDate(diff));
  };

  const weekStart = getWeekStart(currentWeek);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + i);
    return day;
  });

  // Filter schedules by school year and get schedules for current week
  const filteredSchedules = schedules.filter((schedule) => {
    if (schoolYear && schedule.school_year !== schoolYear) return false;
    return true;
  });

  // Fetch related data
  useEffect(() => {
    const fetchRelatedData = async () => {
      const subjectIds = Array.from(
        new Set(filteredSchedules.map((s) => s.subject_id)),
      );
      const sectionIds = Array.from(
        new Set(filteredSchedules.map((s) => s.section_id)),
      );
      const roomIds = Array.from(
        new Set(filteredSchedules.map((s) => s.room_id)),
      );

      if (subjectIds.length > 0) {
        const { data } = await supabase
          .from("sms_subjects")
          .select("id, name, code")
          .in("id", subjectIds);
        if (data) {
          const names: Record<string, string> = {};
          data.forEach((subject) => {
            names[subject.id] = `${subject.code} - ${subject.name}`;
          });
          setSubjectNames(names);
        }
      }

      if (sectionIds.length > 0) {
        const { data } = await supabase
          .from("sms_sections")
          .select("id, name")
          .in("id", sectionIds);
        if (data) {
          const names: Record<string, string> = {};
          data.forEach((section) => {
            names[section.id] = section.name;
          });
          setSectionNames(names);
        }
      }

      if (roomIds.length > 0) {
        const { data } = await supabase
          .from("sms_rooms")
          .select("id, name")
          .in("id", roomIds);
        if (data) {
          const names: Record<string, string> = {};
          data.forEach((room) => {
            names[room.id] = room.name;
          });
          setRoomNames(names);
        }
      }
    };

    fetchRelatedData();
  }, [filteredSchedules]);

  // Get schedules for a specific day and time slot
  // Note: days_of_week uses 0=Sunday, 1=Monday, ..., 6=Saturday
  // Calendar grid uses: Mon=0, Tue=1, ..., Sun=6
  const getSchedulesForSlot = (dayIndex: number, timeSlot: string) => {
    // Convert calendar day index to database day number
    // Calendar: Mon=0, Tue=1, ..., Sun=6
    // Database: Sun=0, Mon=1, ..., Sat=6
    const dayOfWeek = dayIndex === 6 ? 0 : dayIndex + 1;
    return filteredSchedules.filter((schedule) => {
      if (!schedule.days_of_week.includes(dayOfWeek)) return false;

      // Check if schedule overlaps with this time slot
      const [slotHour] = timeSlot.split(":").map(Number);
      const [startHour] = schedule.start_time.split(":").map(Number);
      const [endHour] = schedule.end_time.split(":").map(Number);

      // Schedule overlaps if it starts before slot ends and ends after slot starts
      return startHour < slotHour + 1 && endHour >= slotHour;
    });
  };

  // Convert time to grid position
  const getTimePosition = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    const totalMinutes = hours * 60 + minutes;
    const startMinutes = 7 * 60; // 7:00 AM
    return ((totalMinutes - startMinutes) / 60) * 100; // Percentage from top
  };

  // Get schedule height
  const getScheduleHeight = (startTime: string, endTime: string) => {
    const [startHours, startMinutes] = startTime.split(":").map(Number);
    const [endHours, endMinutes] = endTime.split(":").map(Number);
    const startTotal = startHours * 60 + startMinutes;
    const endTotal = endHours * 60 + endMinutes;
    const duration = endTotal - startTotal;
    return (duration / 60) * 100; // Percentage height
  };

  const handlePreviousWeek = () => {
    const newDate = new Date(currentWeek);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentWeek(newDate);
  };

  const handleNextWeek = () => {
    const newDate = new Date(currentWeek);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentWeek(newDate);
  };

  const handleToday = () => {
    setCurrentWeek(new Date());
  };

  return (
    <div className="space-y-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePreviousWeek}
            className="h-9 w-9"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleToday}
            className="h-9"
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleNextWeek}
            className="h-9 w-9"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="ml-4 text-lg font-semibold">
            {weekStart.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
            })}{" "}
            -{" "}
            {weekDays[6].toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="grid grid-cols-8 border-b">
          <div className="p-2 border-r font-medium text-sm text-muted-foreground">
            Time
          </div>
          {DAYS.map((day, index) => (
            <div
              key={index}
              className="p-2 border-r last:border-r-0 text-center font-medium text-sm"
            >
              <div>{day}</div>
              <div className="text-xs text-muted-foreground">
                {weekDays[index].getDate()}
              </div>
            </div>
          ))}
        </div>

        <div className="relative">
          {/* Time slots */}
          {TIME_SLOTS.map((timeSlot, slotIndex) => (
            <div
              key={timeSlot}
              className="grid grid-cols-8 border-b last:border-b-0 min-h-[60px]"
            >
              <div className="p-2 border-r text-xs text-muted-foreground font-mono">
                {timeSlot}
              </div>
              {DAYS.map((_, dayIndex) => {
                // Convert calendar day index to database day number
                // Calendar: Mon=0, Tue=1, ..., Sun=6
                // Database: Sun=0, Mon=1, ..., Sat=6
                const dayOfWeek = dayIndex === 6 ? 0 : dayIndex + 1;
                const slotSchedules = filteredSchedules.filter((schedule) => {
                  if (!schedule.days_of_week.includes(dayOfWeek)) return false;
                  const [slotHour] = timeSlot.split(":").map(Number);
                  const [startHour] = schedule.start_time
                    .split(":")
                    .map(Number);
                  const [endHour] = schedule.end_time.split(":").map(Number);
                  return startHour <= slotHour && endHour > slotHour;
                });

                return (
                  <div
                    key={dayIndex}
                    className="border-r last:border-r-0 relative min-h-[60px]"
                  >
                    {slotSchedules.map((schedule, idx) => {
                      const top = getTimePosition(schedule.start_time);
                      const height = getScheduleHeight(
                        schedule.start_time,
                        schedule.end_time,
                      );
                      const colors = [
                        "bg-blue-100 border-blue-300 text-blue-800",
                        "bg-green-100 border-green-300 text-green-800",
                        "bg-purple-100 border-purple-300 text-purple-800",
                        "bg-orange-100 border-orange-300 text-orange-800",
                        "bg-pink-100 border-pink-300 text-pink-800",
                      ];
                      const colorClass = colors[idx % colors.length];

                      return (
                        <div
                          key={schedule.id}
                          className={`absolute left-0 right-0 border rounded px-2 py-1 text-xs cursor-pointer hover:opacity-80 ${colorClass}`}
                          style={{
                            top: `${top}%`,
                            height: `${height}%`,
                            zIndex: 10,
                          }}
                          onClick={() => {
                            setSelectedSchedule(schedule);
                            setIsModalOpen(true);
                            if (onScheduleClick) {
                              onScheduleClick(schedule);
                            }
                          }}
                          title={`${subjectNames[schedule.subject_id] || ""} - ${sectionNames[schedule.section_id] || ""} - ${roomNames[schedule.room_id] || ""}`}
                        >
                          <div className="font-medium truncate">
                            {subjectNames[schedule.subject_id]?.split(
                              " - ",
                            )[0] || "Subject"}
                          </div>
                          <div className="text-[10px] opacity-75 truncate">
                            {sectionNames[schedule.section_id] || ""} -{" "}
                            {roomNames[schedule.room_id] || ""}
                          </div>
                          <div className="text-[10px] opacity-75 font-mono">
                            {formatTimeRange(
                              schedule.start_time,
                              schedule.end_time,
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Edit Modal */}
      <AddModal
        isOpen={isModalOpen}
        editData={selectedSchedule}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedSchedule(null);
        }}
      />
    </div>
  );
};
