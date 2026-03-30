"use client";

import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { EccdCompetency, EccdDomain, EccdPeriod, Student } from "@/types";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ECCDRatingSelect } from "./ECCDRatingSelect";

interface ECCDEntryTableProps {
  sectionId: string;
  schoolYear: string;
  period: EccdPeriod;
  fillHeight?: boolean;
  onSavingChange?: (isSaving: boolean) => void;
}

export function ECCDEntryTable({
  sectionId,
  schoolYear,
  period,
  fillHeight,
  onSavingChange,
}: ECCDEntryTableProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [domains, setDomains] = useState<EccdDomain[]>([]);
  const [competencies, setCompetencies] = useState<EccdCompetency[]>([]);
  const [activeDomainId, setActiveDomainId] = useState<string>("");
  // ratings: Record<studentId, Record<competencyId, ratingString>>
  const [ratings, setRatings] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(false);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const isMounted = useRef(true);
  const user = useAppSelector((state) => state.user.user);

  const isPreviousYear = schoolYear !== getCurrentSchoolYear();
  const { settings, isLoading: settingsLoading } = useSchoolSettings(
    true,
    user?.school_id
  );
  const yearLocked = isPreviousYear && !settings.allow_edit_previous_school_year;
  const isLocked = yearLocked || settingsLoading;

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    if (onSavingChange) onSavingChange(savingKeys.size > 0);
  }, [savingKeys.size, onSavingChange]);

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
      const [domainsRes, competenciesRes] = await Promise.all([
        supabase.from("sms_eccd_domains").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("sms_eccd_competencies").select("*").eq("is_active", true).order("sort_order"),
      ]);

      const domainList = domainsRes.data || [];
      const compList = competenciesRes.data || [];

      if (isMounted.current) {
        setDomains(domainList);
        setCompetencies(compList);
        if (domainList.length > 0 && !activeDomainId) {
          setActiveDomainId(domainList[0].id);
        }
      }

      const { data: enrollments, error: enrollmentError } = await supabase
        .from("sms_enrollments")
        .select("student_id")
        .eq("section_id", sectionId)
        .eq("school_year", schoolYear)
        .eq("status", "approved");

      if (enrollmentError || !enrollments || enrollments.length === 0) {
        if (isMounted.current) { setStudents([]); setRatings({}); }
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
        if (isMounted.current) { setStudents([]); setRatings({}); }
        return;
      }

      const { data: assessments } = await supabase
        .from("sms_eccd_assessments")
        .select("*")
        .eq("section_id", sectionId)
        .eq("school_year", schoolYear)
        .eq("period", period)
        .in("student_id", studentIds);

      const ratingsMap: Record<string, Record<string, string>> = {};
      studentList.forEach((s) => { ratingsMap[s.id] = {}; });
      (assessments || []).forEach((a: { student_id: string; competency_id: string; rating: number | null }) => {
        const sid = String(a.student_id);
        if (!ratingsMap[sid]) ratingsMap[sid] = {};
        ratingsMap[sid][String(a.competency_id)] =
          a.rating != null ? String(a.rating) : "";
      });

      if (isMounted.current) {
        setStudents(studentList);
        setRatings(ratingsMap);
      }
    } catch (err) {
      console.error("Error fetching ECCD data:", err);
      toast.error("Failed to load data");
      if (isMounted.current) { setStudents([]); setRatings({}); }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  const autoSave = useCallback(
    async (
      studentId: string,
      competencyId: string,
      value: string,
      previousValue: string
    ) => {
      const key = `${studentId}:${competencyId}`;
      setSavingKeys((prev) => new Set(prev).add(key));
      try {
        const { error } = await supabase.from("sms_eccd_assessments").upsert(
          {
            student_id: studentId,
            competency_id: competencyId,
            section_id: sectionId,
            school_year: schoolYear,
            period,
            rating: value && !Number.isNaN(Number(value)) ? Number(value) : null,
            assessed_by: user?.system_user_id ?? null,
            school_id: (user?.school_id as string) ?? null,
          },
          {
            onConflict: "student_id,competency_id,section_id,school_year,period",
            ignoreDuplicates: false,
          }
        );
        if (error) throw error;
      } catch (err) {
        console.error("Auto-save error:", err);
        toast.error("Failed to save. Please try again.");
        // Revert to previous value
        if (isMounted.current) {
          setRatings((prev) => ({
            ...prev,
            [studentId]: { ...(prev[studentId] || {}), [competencyId]: previousValue },
          }));
        }
      } finally {
        if (isMounted.current) {
          setSavingKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      }
    },
    [sectionId, schoolYear, period, user?.id, user?.school_id]
  );

  const updateRating = useCallback(
    (studentId: string, competencyId: string, value: string) => {
      if (yearLocked) {
        toast.error("Editing previous school year records is disabled");
        return;
      }
      const previousValue =
        ratings[studentId]?.[competencyId] ?? "";
      setRatings((prev) => ({
        ...prev,
        [studentId]: { ...(prev[studentId] || {}), [competencyId]: value },
      }));
      autoSave(studentId, competencyId, value, previousValue);
    },
    [yearLocked, ratings, autoSave]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading ECCD checklist...
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        No enrolled learners in this section for the selected school year.
      </div>
    );
  }

  const activeDomain = domains.find((d) => String(d.id) === String(activeDomainId));
  const domainCompetencies = competencies.filter(
    (c) => String(c.domain_id) === String(activeDomainId)
  );

  return (
    <div className={`flex flex-col gap-3 ${fillHeight ? "h-full min-h-0" : ""}`}>
      {yearLocked && (
        <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Editing records from previous school years is disabled. Enable it in
          System Settings to make changes.
        </p>
      )}

      {/* Rating Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span><strong>1</strong> = Cannot yet perform</span>
        <span><strong>2</strong> = With some assistance</span>
        <span><strong>3</strong> = Can perform independently</span>
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
      {activeDomain && (
        <div>
          <h3 className="text-sm font-medium">{activeDomain.name}</h3>
          <p className="text-xs text-muted-foreground">{activeDomain.description}</p>
        </div>
      )}

      {/* Table */}
      <div
        className={`border rounded-md overflow-x-auto ${
          fillHeight
            ? "flex-1 min-h-0 overflow-y-auto"
            : "overflow-y-auto max-h-[min(65vh,calc(100dvh-18rem))]"
        }`}
      >
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
                <tr key={student.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-3 py-2.5 align-middle text-sm tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-2.5 align-middle text-sm leading-snug w-[12rem] max-w-[12rem] break-words">
                    {student.last_name}, {student.first_name}{" "}
                    {student.middle_name || ""} {student.suffix || ""}
                  </td>
                  {domainCompetencies.map((comp) => {
                    const key = `${student.id}:${comp.id}`;
                    const isSaving = savingKeys.has(key);
                    return (
                      <td key={comp.id} className="px-2 py-2 align-middle">
                        <div className="relative">
                          <ECCDRatingSelect
                            value={studentRatings[comp.id] || ""}
                            onChange={(v) => updateRating(student.id, comp.id, v)}
                            disabled={isLocked || isSaving}
                            compact
                          />
                          {isSaving && (
                            <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-md">
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
