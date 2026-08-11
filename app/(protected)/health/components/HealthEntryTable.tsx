"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { LearnerHealth } from "@/types";
import { Student } from "@/types";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

type NutritionalStatus =
  | "severely_wasted"
  | "wasted"
  | "normal"
  | "overweight"
  | "obese";

type HeightForAge =
  | "severely_stunted"
  | "stunted"
  | "normal"
  | "tall";

interface HealthRow {
  height_cm: string;
  weight_kg: string;
  nutritional_status: NutritionalStatus | "";
  height_for_age: HeightForAge | "";
  remarks: string;
  measured_at: string;
}

interface HealthEntryTableProps {
  sectionId: string;
  schoolYear: string;
}

const NUTRITIONAL_OPTIONS: { value: NutritionalStatus; label: string }[] = [
  { value: "severely_wasted", label: "Severely Wasted" },
  { value: "wasted", label: "Wasted" },
  { value: "normal", label: "Normal" },
  { value: "overweight", label: "Overweight" },
  { value: "obese", label: "Obese" },
];

const HEIGHT_FOR_AGE_OPTIONS: { value: HeightForAge; label: string }[] = [
  { value: "severely_stunted", label: "Severely Stunted" },
  { value: "stunted", label: "Stunted" },
  { value: "normal", label: "Normal" },
  { value: "tall", label: "Tall" },
];

export function HealthEntryTable({
  sectionId,
  schoolYear,
}: HealthEntryTableProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [healthData, setHealthData] = useState<Record<string, HealthRow>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Non-advisers (school head, registrar, division admin) may read a section's
  // SF8 but only the section adviser encodes it.
  const [isAdviser, setIsAdviser] = useState(false);
  const user = useAppSelector((state) => state.user.user);

  const isPreviousYear = schoolYear !== getCurrentSchoolYear();
  const { settings, isLoading: settingsLoading } = useSchoolSettings(true, user?.school_id);
  const yearLocked = isPreviousYear && !settings.allow_edit_previous_school_year;

  useEffect(() => {
    if (!sectionId || !schoolYear) {
      setStudents([]);
      setHealthData({});
      return;
    }
    fetchData();
  }, [sectionId, schoolYear]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: sectionData } = await supabase
        .from("sms_sections")
        .select("section_adviser_id")
        .eq("id", sectionId)
        .single();
      setIsAdviser(
        sectionData?.section_adviser_id != null &&
          String(sectionData.section_adviser_id) === String(user?.system_user_id)
      );

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
        setHealthData({});
        return;
      }

      if (!enrollments || enrollments.length === 0) {
        setStudents([]);
        setHealthData({});
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
        setHealthData({});
        return;
      }

      setStudents(studentList);

      const { data: healthRecords } = await supabase
        .from("sms_learner_health")
        .select("*")
        .eq("section_id", sectionId)
        .eq("school_year", schoolYear)
        .in("student_id", studentIds);

      const healthMap: Record<string, HealthRow> = {};
      studentList.forEach((s) => {
        const rec = (healthRecords || []).find(
          (h: LearnerHealth) => String(h.student_id) === String(s.id)
        );
        healthMap[s.id] = {
          height_cm: rec?.height_cm != null ? String(rec.height_cm) : "",
          weight_kg: rec?.weight_kg != null ? String(rec.weight_kg) : "",
          nutritional_status: (rec?.nutritional_status as NutritionalStatus) ?? "",
          height_for_age: (rec?.height_for_age as HeightForAge) ?? "",
          remarks: rec?.remarks ?? "",
          measured_at: rec?.measured_at
            ? String(rec.measured_at).slice(0, 10)
            : "",
        };
      });
      setHealthData(healthMap);
    } catch (err) {
      console.error("Error fetching health data:", err);
      toast.error("Failed to load data");
      setStudents([]);
      setHealthData({});
    } finally {
      setLoading(false);
    }
  };

  const updateHealth = (
    studentId: string,
    field: keyof HealthRow,
    value: string
  ) => {
    setHealthData((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] ?? {
          height_cm: "",
          weight_kg: "",
          nutritional_status: "",
          height_for_age: "",
          remarks: "",
          measured_at: "",
        }),
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (!isAdviser) {
      toast.error("Only the section adviser can encode this section's health records");
      return;
    }
    if (yearLocked) {
      toast.error("Editing previous school year records is disabled");
      return;
    }
    setSaving(true);
    try {
      const entries = students.map((student) => {
        const row = healthData[student.id] ?? {};
        const heightCm =
          row.height_cm && !Number.isNaN(Number(row.height_cm))
            ? Number(row.height_cm)
            : null;
        const weightKg =
          row.weight_kg && !Number.isNaN(Number(row.weight_kg))
            ? Number(row.weight_kg)
            : null;
        return {
          student_id: student.id,
          section_id: sectionId,
          school_year: schoolYear,
          height_cm: heightCm,
          weight_kg: weightKg,
          nutritional_status: row.nutritional_status || null,
          height_for_age: row.height_for_age || null,
          remarks: row.remarks?.trim() || null,
          measured_at: row.measured_at || null,
        };
      });

      const { error } = await supabase
        .from("sms_learner_health")
        .upsert(entries, {
          onConflict: "student_id,section_id,school_year",
          ignoreDuplicates: false,
        });

      if (error) throw error;

      toast.success("Health records saved successfully!");
      fetchData();
    } catch (err) {
      console.error("Error saving health:", err);
      toast.error("Failed to save health records");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading learners...
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No enrolled learners in this section for the selected school year.
      </div>
    );
  }

  const isLocked = yearLocked || settingsLoading || !isAdviser;

  return (
    <div className="flex flex-col gap-4 min-h-0">
      {!isAdviser && (
        <p className="text-sm text-muted-foreground">
          Read-only — only the section adviser can encode this section&apos;s health records.
        </p>
      )}
      {yearLocked && (
        <p className="text-sm text-muted-foreground">
          Editing records from previous school years is disabled. Enable it in School Settings to make changes.
        </p>
      )}
      {isAdviser && (
        <div className="flex shrink-0 justify-end">
          <Button onClick={handleSave} disabled={saving || isLocked}>
            {saving ? "Saving..." : "Save All"}
          </Button>
        </div>
      )}
      <div className="border rounded-md overflow-x-auto overflow-y-auto max-h-[min(65vh,calc(100dvh-14rem))] min-h-0">
        <table className="w-full min-w-[1110px]">
          <thead className="bg-muted sticky top-0 z-10 border-b border-border">
            <tr>
              <th className="px-3 py-3 text-left text-sm font-medium min-w-[2.75rem] w-12">
                No.
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium w-[12rem] min-w-[12rem] max-w-[12rem]">
                Name of Learner
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium min-w-[7rem]">
                Height (cm)
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium min-w-[7rem]">
                Weight (kg)
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium min-w-[10rem]">
                Nutritional Status
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium min-w-[11rem]">
                Height for Age
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium min-w-[11rem]">
                Measured At
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium min-w-[14rem]">
                Remarks
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {students.map((student, idx) => {
              const row =
                healthData[student.id] ?? ({
                  height_cm: "",
                  weight_kg: "",
                  nutritional_status: "",
                  height_for_age: "",
                  remarks: "",
                  measured_at: "",
                } as HealthRow);
              return (
                <tr key={student.id} className="hover:bg-muted/50">
                  <td className="px-3 py-2.5 align-middle text-sm tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-2.5 align-middle text-sm leading-snug w-[12rem] max-w-[12rem] break-words">
                    {student.last_name}, {student.first_name}{" "}
                    {student.middle_name || ""} {student.suffix || ""}
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      placeholder="—"
                      value={row.height_cm}
                      onChange={(e) =>
                        updateHealth(student.id, "height_cm", e.target.value)
                      }
                      disabled={isLocked}
                      className="h-9 w-full min-w-0 text-sm tabular-nums"
                    />
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      placeholder="—"
                      value={row.weight_kg}
                      onChange={(e) =>
                        updateHealth(student.id, "weight_kg", e.target.value)
                      }
                      disabled={isLocked}
                      className="h-9 w-full min-w-0 text-sm tabular-nums"
                    />
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <Select
                      value={row.nutritional_status || "none"}
                      onValueChange={(v) =>
                        updateHealth(
                          student.id,
                          "nutritional_status",
                          v === "none" ? "" : v
                        )
                      }
                      disabled={isLocked}
                    >
                      <SelectTrigger className="h-9 w-full min-w-0 text-sm">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {NUTRITIONAL_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <Select
                      value={row.height_for_age || "none"}
                      onValueChange={(v) =>
                        updateHealth(
                          student.id,
                          "height_for_age",
                          v === "none" ? "" : v
                        )
                      }
                      disabled={isLocked}
                    >
                      <SelectTrigger className="h-9 w-full min-w-0 text-sm">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {HEIGHT_FOR_AGE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <Input
                      type="date"
                      value={row.measured_at}
                      onChange={(e) =>
                        updateHealth(student.id, "measured_at", e.target.value)
                      }
                      disabled={isLocked}
                      className="h-9 w-full min-w-0 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <Input
                      placeholder="—"
                      value={row.remarks}
                      onChange={(e) =>
                        updateHealth(student.id, "remarks", e.target.value)
                      }
                      disabled={isLocked}
                      className="h-9 w-full min-w-0 text-sm"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {isAdviser && (
        <div className="flex shrink-0 justify-end">
          <Button onClick={handleSave} disabled={saving || isLocked}>
            {saving ? "Saving..." : "Save All"}
          </Button>
        </div>
      )}
    </div>
  );
}
