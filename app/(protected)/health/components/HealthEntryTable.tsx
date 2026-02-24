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
import { supabase } from "@/lib/supabase/client";
import { LearnerHealth } from "@/types";
import { Student } from "@/types";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

type NutritionalStatus =
  | "underweight"
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
  { value: "underweight", label: "Underweight" },
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

  return (
    <div className="space-y-4">
      <div className="border rounded-md overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium w-12">
                No.
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium">
                Name of Learner
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium w-20">
                Height (cm)
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium w-20">
                Weight (kg)
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium w-32">
                Nutritional Status
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium w-32">
                Height for Age
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium w-28">
                Measured At
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium">
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
                  <td className="px-4 py-2 text-sm">{idx + 1}</td>
                  <td className="px-4 py-2">
                    {student.last_name}, {student.first_name}{" "}
                    {student.middle_name || ""} {student.suffix || ""}
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      placeholder="—"
                      value={row.height_cm}
                      onChange={(e) =>
                        updateHealth(student.id, "height_cm", e.target.value)
                      }
                      className="h-8 w-full"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      placeholder="—"
                      value={row.weight_kg}
                      onChange={(e) =>
                        updateHealth(student.id, "weight_kg", e.target.value)
                      }
                      className="h-8 w-full"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Select
                      value={row.nutritional_status || "none"}
                      onValueChange={(v) =>
                        updateHealth(
                          student.id,
                          "nutritional_status",
                          v === "none" ? "" : v
                        )
                      }
                    >
                      <SelectTrigger className="h-8 w-full">
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
                  <td className="px-4 py-2">
                    <Select
                      value={row.height_for_age || "none"}
                      onValueChange={(v) =>
                        updateHealth(
                          student.id,
                          "height_for_age",
                          v === "none" ? "" : v
                        )
                      }
                    >
                      <SelectTrigger className="h-8 w-full">
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
                  <td className="px-4 py-2">
                    <Input
                      type="date"
                      value={row.measured_at}
                      onChange={(e) =>
                        updateHealth(student.id, "measured_at", e.target.value)
                      }
                      className="h-8 w-full"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      placeholder="—"
                      value={row.remarks}
                      onChange={(e) =>
                        updateHealth(student.id, "remarks", e.target.value)
                      }
                      className="h-8 w-full"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save All"}
        </Button>
      </div>
    </div>
  );
}
