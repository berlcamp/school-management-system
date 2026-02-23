"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { Student } from "@/types";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

type AttendanceStatus = "present" | "absent" | "tardy";

interface AttendanceEntryTableProps {
  sectionId: string;
  schoolYear: string;
  date: string; // YYYY-MM-DD
  schoolId?: string | null;
}

export function AttendanceEntryTable({
  sectionId,
  schoolYear,
  date,
  schoolId,
}: AttendanceEntryTableProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(true);
  const user = useAppSelector((state) => state.user.user);

  useEffect(() => {
    if (!sectionId || !schoolYear || !date) {
      setStudents([]);
      setAttendance({});
      return;
    }
    fetchData();
  }, [sectionId, schoolYear, date]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch students from sms_enrollments (approved) joined with sms_students
      const { data: enrollments, error: enrollmentError } = await supabase
        .from("sms_enrollments")
        .select("student_id")
        .eq("section_id", sectionId)
        .eq("school_year", schoolYear)
        .eq("status", "approved");

      if (enrollmentError) {
        console.error("Error fetching enrollments:", enrollmentError);
        toast.error("Failed to load students");
        setStudents([]);
        setAttendance({});
        return;
      }

      if (!enrollments || enrollments.length === 0) {
        setStudents([]);
        setAttendance({});
        return;
      }

      const studentIds = enrollments.map((e) => e.student_id);
      const { data: studentList, error: studentsError } = await supabase
        .from("sms_students")
        .select("*")
        .in("id", studentIds)
        .order("last_name")
        .order("first_name");

      if (studentsError || !studentList) {
        toast.error("Failed to load students");
        setStudents([]);
        setAttendance({});
        return;
      }

      setStudents(studentList);

      // Fetch existing attendance for this section and date
      const { data: attendanceData } = await supabase
        .from("sms_attendance")
        .select("student_id, status")
        .eq("section_id", sectionId)
        .eq("date", date);

      const attendanceMap: Record<string, AttendanceStatus> = {};
      if (attendanceData) {
        attendanceData.forEach((a) => {
          attendanceMap[a.student_id] = a.status as AttendanceStatus;
        });
      }
      setAttendance(attendanceMap);

      // Only section adviser can edit; others are view-only
      const { data: sectionData } = await supabase
        .from("sms_sections")
        .select("section_adviser_id")
        .eq("id", sectionId)
        .single();

      const isAdviser = sectionData?.section_adviser_id === user?.system_user_id;
      setCanEdit(!!isAdviser);
    } catch (err) {
      console.error("Error fetching attendance data:", err);
      toast.error("Failed to load data");
      setStudents([]);
      setAttendance({});
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (
    studentId: string,
    value: AttendanceStatus | "unrecorded"
  ) => {
    setAttendance((prev) => {
      if (value === "unrecorded") {
        const next = { ...prev };
        delete next[studentId];
        return next;
      }
      return { ...prev, [studentId]: value as AttendanceStatus };
    });
  };

  const handleSave = async () => {
    if (!user?.system_user_id) {
      toast.error("User not authenticated");
      return;
    }

    if (!canEdit) {
      toast.error("You do not have permission to edit this section's attendance");
      return;
    }

    setSaving(true);
    try {
      const entries = students
        .filter((student) => attendance[student.id] != null)
        .map((student) => ({
          student_id: student.id,
          section_id: sectionId,
          school_id: schoolId ?? null,
          school_year: schoolYear,
          date,
          status: attendance[student.id] as AttendanceStatus,
          recorded_by: user.system_user_id,
        }));

      // Upsert: use ON CONFLICT to update if exists
      const { error } = await supabase.from("sms_attendance").upsert(entries, {
        onConflict: "student_id,section_id,date",
        ignoreDuplicates: false,
      });

      if (error) throw error;

      toast.success("Attendance saved successfully!");
    } catch (err) {
      console.error("Error saving attendance:", err);
      toast.error("Failed to save attendance");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAllPresent = () => {
    const updated: Record<string, AttendanceStatus> = {};
    students.forEach((s) => {
      updated[s.id] = "present";
    });
    setAttendance(updated);
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading students...
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No enrolled students in this section for the selected school year.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-md">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium w-12">No.</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Name of Learner</th>
              <th className="px-4 py-3 text-left text-sm font-medium w-24">LRN</th>
              <th className="px-4 py-3 text-left text-sm font-medium w-32">
                Status (Present / Absent / Tardy)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {students.map((student, idx) => (
              <tr key={student.id} className="hover:bg-muted/50">
                <td className="px-4 py-3 text-sm">{idx + 1}</td>
                <td className="px-4 py-3">
                  {student.last_name}, {student.first_name}{" "}
                  {student.middle_name || ""} {student.suffix || ""}
                </td>
                <td className="px-4 py-3 font-mono text-sm">{student.lrn}</td>
                <td className="px-4 py-3">
                  {canEdit ? (
                    <Select
                      value={attendance[student.id] ?? "unrecorded"}
                      onValueChange={(v) =>
                        handleStatusChange(student.id, v as AttendanceStatus | "unrecorded")
                      }
                      disabled={!canEdit}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unrecorded">-</SelectItem>
                        <SelectItem value="present">Present</SelectItem>
                        <SelectItem value="absent">Absent</SelectItem>
                        <SelectItem value="tardy">Tardy</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-muted-foreground">
                      {attendance[student.id]
                        ? (attendance[student.id] as string).charAt(0).toUpperCase() +
                          (attendance[student.id] as string).slice(1)
                        : "-"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between items-center">
        <div>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={handleMarkAllPresent}>
              Mark All Present
            </Button>
          )}
        </div>
        <div>
          {canEdit && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Attendance"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
