"use client";

import { Button } from "@/components/ui/button";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { EccdCompetency, EccdDomain, EccdPeriod, Student } from "@/types";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ECCDRatingSelect } from "./ECCDRatingSelect";

interface ECCDEntryTableProps {
  sectionId: string;
  schoolYear: string;
  period: EccdPeriod;
}

export function ECCDEntryTable({
  sectionId,
  schoolYear,
  period,
}: ECCDEntryTableProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [domains, setDomains] = useState<EccdDomain[]>([]);
  const [competencies, setCompetencies] = useState<EccdCompetency[]>([]);
  const [activeDomainId, setActiveDomainId] = useState<string>("");
  // ratings: Record<studentId, Record<competencyId, ratingString>>
  const [ratings, setRatings] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const user = useAppSelector((state) => state.user.user);

  const isPreviousYear = schoolYear !== getCurrentSchoolYear();
  const { settings, isLoading: settingsLoading } = useSchoolSettings(
    true,
    user?.school_id
  );
  const yearLocked = isPreviousYear && !settings.allow_edit_previous_school_year;

  useEffect(() => {
    if (!sectionId || !schoolYear || !period) {
      setStudents([]);
      setRatings({});
      return;
    }
    fetchData();
  }, [sectionId, schoolYear, period]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch domains and competencies
      const [domainsRes, competenciesRes] = await Promise.all([
        supabase
          .from("sms_eccd_domains")
          .select("*")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("sms_eccd_competencies")
          .select("*")
          .eq("is_active", true)
          .order("sort_order"),
      ]);

      const domainList = domainsRes.data || [];
      const compList = competenciesRes.data || [];
      setDomains(domainList);
      setCompetencies(compList);

      if (domainList.length > 0 && !activeDomainId) {
        setActiveDomainId(domainList[0].id);
      }

      // Fetch enrolled students
      const { data: enrollments, error: enrollmentError } = await supabase
        .from("sms_enrollments")
        .select("student_id")
        .eq("section_id", sectionId)
        .eq("school_year", schoolYear)
        .eq("status", "approved");

      if (enrollmentError) {
        toast.error("Failed to load students");
        setStudents([]);
        setRatings({});
        return;
      }

      if (!enrollments || enrollments.length === 0) {
        setStudents([]);
        setRatings({});
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
        setRatings({});
        return;
      }

      setStudents(studentList);

      // Fetch existing assessments for this section/year/period
      const { data: assessments } = await supabase
        .from("sms_eccd_assessments")
        .select("*")
        .eq("section_id", sectionId)
        .eq("school_year", schoolYear)
        .eq("period", period)
        .in("student_id", studentIds);

      // Build ratings map
      const ratingsMap: Record<string, Record<string, string>> = {};
      studentList.forEach((s) => {
        ratingsMap[s.id] = {};
      });
      (assessments || []).forEach((a: { student_id: string; competency_id: string; rating: number | null }) => {
        const sid = String(a.student_id);
        if (!ratingsMap[sid]) ratingsMap[sid] = {};
        ratingsMap[sid][String(a.competency_id)] =
          a.rating != null ? String(a.rating) : "";
      });
      setRatings(ratingsMap);
    } catch (err) {
      console.error("Error fetching ECCD data:", err);
      toast.error("Failed to load data");
      setStudents([]);
      setRatings({});
    } finally {
      setLoading(false);
    }
  };

  const updateRating = (
    studentId: string,
    competencyId: string,
    value: string
  ) => {
    setRatings((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [competencyId]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (yearLocked) {
      toast.error("Editing previous school year records is disabled");
      return;
    }
    setSaving(true);
    try {
      // Build upsert entries for all students and all competencies that have ratings
      const entries: Array<{
        student_id: string;
        competency_id: string;
        section_id: string;
        school_year: string;
        period: EccdPeriod;
        rating: number | null;
        assessed_by: string | null;
        school_id: string | null;
      }> = [];

      // Only upsert competencies in the active domain
      const domainCompetencies = competencies.filter(
        (c) => String(c.domain_id) === String(activeDomainId)
      );

      students.forEach((student) => {
        const studentRatings = ratings[student.id] || {};
        domainCompetencies.forEach((comp) => {
          const ratingStr = studentRatings[comp.id];
          entries.push({
            student_id: student.id,
            competency_id: comp.id,
            section_id: sectionId,
            school_year: schoolYear,
            period,
            rating:
              ratingStr && !Number.isNaN(Number(ratingStr))
                ? Number(ratingStr)
                : null,
            assessed_by: user?.id ?? null,
            school_id: (user?.school_id as string) ?? null,
          });
        });
      });

      const { error } = await supabase
        .from("sms_eccd_assessments")
        .upsert(entries, {
          onConflict:
            "student_id,competency_id,section_id,school_year,period",
          ignoreDuplicates: false,
        });

      if (error) throw error;

      toast.success("ECCD assessments saved successfully!");
      fetchData();
    } catch (err) {
      console.error("Error saving ECCD assessments:", err);
      toast.error("Failed to save assessments");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading ECCD checklist...
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

  const domainCompetencies = competencies.filter(
    (c) => String(c.domain_id) === String(activeDomainId)
  );

  const isLocked = yearLocked || settingsLoading;

  return (
    <div className="flex flex-col gap-4 min-h-0">
      {yearLocked && (
        <p className="text-sm text-muted-foreground">
          Editing records from previous school years is disabled. Enable it in
          System Settings to make changes.
        </p>
      )}

      {/* Rating Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>
          <strong>1</strong> = Cannot yet perform
        </span>
        <span>
          <strong>2</strong> = With some assistance
        </span>
        <span>
          <strong>3</strong> = Can perform independently
        </span>
      </div>

      {/* Domain Tabs */}
      <div className="flex flex-wrap gap-1 border-b pb-1">
        {domains.map((domain) => (
          <button
            key={domain.id}
            onClick={() => setActiveDomainId(domain.id)}
            className={`px-3 py-1.5 text-sm rounded-t-md transition-colors ${
              String(activeDomainId) === String(domain.id)
                ? "bg-primary text-primary-foreground font-medium"
                : "bg-muted hover:bg-muted/80 text-muted-foreground"
            }`}
          >
            {domain.code}
          </button>
        ))}
      </div>

      {/* Active Domain Title */}
      {domains.find((d) => String(d.id) === String(activeDomainId)) && (
        <div>
          <h3 className="text-sm font-medium">
            {domains.find((d) => String(d.id) === String(activeDomainId))?.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {
              domains.find((d) => String(d.id) === String(activeDomainId))
                ?.description
            }
          </p>
        </div>
      )}

      <div className="flex shrink-0 justify-end">
        <Button onClick={handleSave} disabled={saving || isLocked}>
          {saving ? "Saving..." : "Save All"}
        </Button>
      </div>

      <div className="border rounded-md overflow-x-auto overflow-y-auto max-h-[min(65vh,calc(100dvh-14rem))] min-h-0">
        <table className="w-full">
          <thead className="bg-muted sticky top-0 z-10 border-b border-border">
            <tr>
              <th className="px-3 py-3 text-left text-sm font-medium min-w-[2.75rem] w-12">
                No.
              </th>
              <th className="px-3 py-3 text-left text-sm font-medium w-[12rem] min-w-[12rem] max-w-[12rem]">
                Name of Learner
              </th>
              {domainCompetencies.map((comp) => (
                <th
                  key={comp.id}
                  className="px-2 py-3 text-left text-xs font-medium min-w-[7rem] max-w-[10rem]"
                  title={comp.description}
                >
                  <div className="truncate">{comp.code}</div>
                  <div className="font-normal text-muted-foreground truncate">
                    {comp.description}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {students.map((student, idx) => {
              const studentRatings = ratings[student.id] || {};
              return (
                <tr key={student.id} className="hover:bg-muted/50">
                  <td className="px-3 py-2.5 align-middle text-sm tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-2.5 align-middle text-sm leading-snug w-[12rem] max-w-[12rem] break-words">
                    {student.last_name}, {student.first_name}{" "}
                    {student.middle_name || ""} {student.suffix || ""}
                  </td>
                  {domainCompetencies.map((comp) => (
                    <td key={comp.id} className="px-2 py-2.5 align-middle">
                      <ECCDRatingSelect
                        value={studentRatings[comp.id] || ""}
                        onChange={(v) => updateRating(student.id, comp.id, v)}
                        disabled={isLocked}
                        compact
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 justify-end">
        <Button onClick={handleSave} disabled={saving || isLocked}>
          {saving ? "Saving..." : "Save All"}
        </Button>
      </div>
    </div>
  );
}
