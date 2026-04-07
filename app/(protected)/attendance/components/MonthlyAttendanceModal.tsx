"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { Student } from "@/types";
import { Loader2 } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

interface MonthlyAttendanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionId: string;
  sectionName: string;
  gradeLevel: number;
  schoolId: string | null;
  schoolYear: string;
  month: string; // "YYYY-MM"
}

interface CellData {
  am: boolean;
  pm: boolean;
}

type AttendanceGrid = Record<string, CellData>; // key: "studentId:YYYY-MM-DD"

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getWeekdaysInMonth(yearMonth: string): string[] {
  const [year, month] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow >= 1 && dow <= 5) {
      const dd = String(d).padStart(2, "0");
      const mm = String(month).padStart(2, "0");
      days.push(`${year}-${mm}-${dd}`);
    }
  }
  return days;
}

function gridKey(studentId: string, date: string): string {
  return `${studentId}:${date}`;
}

// Memoized row component for performance
const StudentRow = React.memo(function StudentRow({
  student,
  index,
  weekdays,
  grid,
  canEdit,
  savingKeys,
  onToggle,
}: {
  student: Student;
  index: number;
  weekdays: string[];
  grid: AttendanceGrid;
  canEdit: boolean;
  savingKeys: Set<string>;
  onToggle: (studentId: string, date: string, period: "am" | "pm") => void;
}) {
  let total = 0;
  weekdays.forEach((date) => {
    const cell = grid[gridKey(student.id, date)];
    if (cell?.am ?? true) total += 0.5;
    if (cell?.pm ?? true) total += 0.5;
  });

  return (
    <tr className="border-b border-border hover:bg-muted/30 transition-colors">
      <td className="sticky left-0 z-10 bg-background border-r border-border px-2 py-1.5 text-center text-xs font-medium w-10 min-w-10">
        {index + 1}
      </td>
      <td className="sticky left-10 z-10 bg-background border-r border-border px-2 py-1.5 text-xs min-w-[180px] max-w-[180px] truncate">
        {student.last_name}, {student.first_name} {student.middle_name ? student.middle_name.charAt(0) + "." : ""} {student.suffix || ""}
      </td>
      {weekdays.map((date) => {
        const key = gridKey(student.id, date);
        const cell = grid[key];
        const isSaving = savingKeys.has(key);
        return (
          <React.Fragment key={date}>
            <td className="border-r border-border/50 px-0.5 py-1.5 text-center w-8 min-w-8">
              {isSaving ? (
                <div className="flex justify-center">
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Checkbox
                  checked={!(cell?.am ?? true)}
                  disabled={!canEdit}
                  onChange={() => onToggle(student.id, date, "am")}
                  className="h-4 w-4 mx-auto cursor-pointer accent-emerald-600"
                />
              )}
            </td>
            <td className="border-r border-border px-0.5 py-1.5 text-center w-8 min-w-8">
              {isSaving ? (
                <div className="flex justify-center">
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Checkbox
                  checked={!(cell?.pm ?? true)}
                  disabled={!canEdit}
                  onChange={() => onToggle(student.id, date, "pm")}
                  className="h-4 w-4 mx-auto cursor-pointer accent-emerald-600"
                />
              )}
            </td>
          </React.Fragment>
        );
      })}
      <td className="sticky right-0 z-10 bg-background border-l border-border px-2 py-1.5 text-center text-xs font-semibold min-w-14">
        {total % 1 === 0 ? total : total.toFixed(1)}
      </td>
    </tr>
  );
});

export function MonthlyAttendanceModal({
  open,
  onOpenChange,
  sectionId,
  sectionName,
  gradeLevel,
  schoolId,
  schoolYear,
  month,
}: MonthlyAttendanceModalProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [grid, setGrid] = useState<AttendanceGrid>({});
  const [loading, setLoading] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const user = useAppSelector((state) => state.user.user);
  const isMounted = useRef(true);

  const isPreviousYear = schoolYear !== getCurrentSchoolYear();
  const { settings, isLoading: settingsLoading } = useSchoolSettings(true, user?.school_id);
  const yearLocked = isPreviousYear && !settings.allow_edit_previous_school_year;

  const weekdays = useMemo(() => getWeekdaysInMonth(month), [month]);

  const [parsedYear, parsedMonth] = useMemo(() => {
    const parts = month.split("-").map(Number);
    return [parts[0], parts[1]];
  }, [month]);

  const gradeLevelLabel = gradeLevel === -1 ? "SNED" : gradeLevel === 0 ? "Kinder" : `Grade ${gradeLevel}`;
  const monthLabel = `${MONTH_NAMES[parsedMonth - 1]} ${parsedYear}`;

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
  }, [open, sectionId, schoolYear, month]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch enrolled students
      const { data: enrollments } = await supabase
        .from("sms_enrollments")
        .select("student_id")
        .eq("section_id", sectionId)
        .eq("school_year", schoolYear)
        .eq("status", "approved");

      if (!enrollments || enrollments.length === 0) {
        if (isMounted.current) {
          setStudents([]);
          setGrid({});
        }
        return;
      }

      const studentIds = enrollments.map((e) => e.student_id);
      const { data: studentList } = await supabase
        .from("sms_students")
        .select("*")
        .in("id", studentIds)
        .order("last_name")
        .order("first_name");

      if (!studentList) {
        if (isMounted.current) {
          setStudents([]);
          setGrid({});
        }
        return;
      }

      // Fetch attendance for the month
      const mm = String(parsedMonth).padStart(2, "0");
      const daysInMonth = new Date(parsedYear, parsedMonth, 0).getDate();
      const startDate = `${parsedYear}-${mm}-01`;
      const endDate = `${parsedYear}-${mm}-${String(daysInMonth).padStart(2, "0")}`;

      const { data: attendanceData } = await supabase
        .from("sms_attendance")
        .select("student_id, date, am_present, pm_present")
        .eq("section_id", sectionId)
        .gte("date", startDate)
        .lte("date", endDate);

      const newGrid: AttendanceGrid = {};
      if (attendanceData) {
        attendanceData.forEach((a) => {
          const key = gridKey(String(a.student_id), a.date);
          newGrid[key] = {
            am: a.am_present ?? false,
            pm: a.pm_present ?? false,
          };
        });
      }

      // Check section adviser permission
      const { data: sectionData } = await supabase
        .from("sms_sections")
        .select("section_adviser_id")
        .eq("id", sectionId)
        .single();

      if (isMounted.current) {
        setStudents(studentList);
        setGrid(newGrid);
        setCanEdit(sectionData?.section_adviser_id === user?.system_user_id);
      }
    } catch (err) {
      console.error("Error fetching attendance data:", err);
      toast.error("Failed to load attendance data");
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const saveCell = useCallback(
    async (studentId: string, date: string, am: boolean, pm: boolean) => {
      const key = gridKey(studentId, date);
      setSavingKeys((prev) => new Set(prev).add(key));
      try {
        const { error } = await supabase.from("sms_attendance").upsert(
          {
            student_id: studentId,
            section_id: sectionId,
            school_id: schoolId,
            school_year: schoolYear,
            date,
            am_present: am,
            pm_present: pm,
            recorded_by: user?.system_user_id ?? null,
          },
          { onConflict: "student_id,section_id,date", ignoreDuplicates: false }
        );
        if (error) throw error;
      } catch (err) {
        console.error("Auto-save error:", err);
        toast.error("Failed to save. Please try again.");
        // Revert optimistic update
        setGrid((prev) => {
          const next = { ...prev };
          const cell = next[key];
          if (cell) {
            // Toggle back
            next[key] = { ...cell };
          } else {
            delete next[key];
          }
          return next;
        });
      } finally {
        setSavingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [sectionId, schoolId, schoolYear, user?.system_user_id]
  );

  const handleToggle = useCallback(
    (studentId: string, date: string, period: "am" | "pm") => {
      setGrid((prev) => {
        const key = gridKey(studentId, date);
        const current = prev[key] ?? { am: true, pm: true };
        const updated = {
          ...current,
          [period]: !current[period],
        };
        const next = { ...prev, [key]: updated };

        // Fire auto-save
        saveCell(studentId, date, updated.am, updated.pm);

        return next;
      });
    },
    [saveCell]
  );

  const handleMarkAllPresent = useCallback(async () => {
    if (!canEdit || yearLocked) return;

    setGrid((prev) => {
      const next = { ...prev };
      students.forEach((student) => {
        weekdays.forEach((date) => {
          const key = gridKey(student.id, date);
          next[key] = { am: true, pm: true };
        });
      });
      return next;
    });

    // Batch save all cells
    const entries = students.flatMap((student) =>
      weekdays.map((date) => ({
        student_id: student.id,
        section_id: sectionId,
        school_id: schoolId,
        school_year: schoolYear,
        date,
        am_present: true,
        pm_present: true,
        recorded_by: user?.system_user_id ?? null,
      }))
    );

    // Upsert in batches of 500
    const batchSize = 500;
    let hasError = false;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      const { error } = await supabase.from("sms_attendance").upsert(batch, {
        onConflict: "student_id,section_id,date",
        ignoreDuplicates: false,
      });
      if (error) {
        console.error("Batch save error:", error);
        hasError = true;
        break;
      }
    }

    if (hasError) {
      toast.error("Failed to mark all present. Please try again.");
      fetchData(); // Re-fetch to get correct state
    } else {
      toast.success("All students marked present for the month");
    }
  }, [canEdit, yearLocked, students, weekdays, sectionId, schoolId, schoolYear, user?.system_user_id]);

  const effectiveCanEdit = canEdit && !yearLocked && !settingsLoading;
  const isSaving = savingKeys.size > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-none !w-[calc(100vw-2rem)] !h-[calc(100vh-2rem)] !translate-x-[-50%] !translate-y-[-50%] flex flex-col p-0 gap-0"
      >
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="text-base">
              {gradeLevelLabel} - {sectionName} | {monthLabel}
            </DialogTitle>
            <div className="flex items-center gap-3">
              {isSaving && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving...
                </span>
              )}
              {yearLocked && (
                <span className="text-xs text-orange-600">
                  Previous year locked
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
            <span>Unchecked = Present (0.5 per period) | Checked = Absent | AM + PM = 1.0 day</span>
            <span>|</span>
            <span>{students.length} students | {weekdays.length} school days</span>
          </div>
        </DialogHeader>

        {/* Grid */}
        <div className="flex-1 overflow-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading attendance data...
              </div>
            </div>
          ) : students.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No enrolled students in this section.
            </div>
          ) : (
            <table className="border-collapse w-max min-w-full">
              <thead className="sticky top-0 z-30">
                {/* Day numbers row */}
                <tr className="bg-muted border-b border-border">
                  <th className="sticky left-0 z-40 bg-muted border-r border-border px-2 py-1 text-xs font-medium w-10 min-w-10">
                    #
                  </th>
                  <th className="sticky left-10 z-40 bg-muted border-r border-border px-2 py-1 text-xs font-medium text-left min-w-[180px]">
                    Student Name
                  </th>
                  {weekdays.map((date) => {
                    const day = parseInt(date.split("-")[2]);
                    const dow = new Date(
                      parseInt(date.split("-")[0]),
                      parseInt(date.split("-")[1]) - 1,
                      day
                    ).getDay();
                    const dayNames = ["", "M", "T", "W", "Th", "F"];
                    return (
                      <th
                        key={date}
                        colSpan={2}
                        className="border-r border-border px-0 py-1 text-center text-[10px] font-medium min-w-16"
                      >
                        <div className="font-semibold">{day}</div>
                        <div className="text-muted-foreground">{dayNames[dow]}</div>
                      </th>
                    );
                  })}
                  <th className="sticky right-0 z-40 bg-muted border-l border-border px-2 py-1 text-xs font-medium min-w-14">
                    Total
                  </th>
                </tr>
                {/* AM/PM sub-header row */}
                <tr className="bg-muted/80 border-b border-border">
                  <th className="sticky left-0 z-40 bg-muted/80 border-r border-border" />
                  <th className="sticky left-10 z-40 bg-muted/80 border-r border-border" />
                  {weekdays.map((date) => (
                    <React.Fragment key={date}>
                      <th className="border-r border-border/50 px-0 py-0.5 text-[9px] text-center font-medium text-blue-600 w-8 min-w-8">
                        AM
                      </th>
                      <th className="border-r border-border px-0 py-0.5 text-[9px] text-center font-medium text-orange-600 w-8 min-w-8">
                        PM
                      </th>
                    </React.Fragment>
                  ))}
                  <th className="sticky right-0 z-40 bg-muted/80 border-l border-border px-2 py-0.5 text-[9px] font-medium">
                    Days
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((student, idx) => (
                  <StudentRow
                    key={student.id}
                    student={student}
                    index={idx}
                    weekdays={weekdays}
                    grid={grid}
                    canEdit={effectiveCanEdit}
                    savingKeys={savingKeys}
                    onToggle={handleToggle}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {effectiveCanEdit && students.length > 0 && !loading && (
          <div className="px-4 py-2.5 border-t border-border flex-shrink-0 flex items-center justify-between bg-muted/30">
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllPresent}
              disabled={isSaving}
            >
              Mark All Present for Entire Month
            </Button>
            <span className="text-xs text-muted-foreground">
              Changes are saved automatically
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
