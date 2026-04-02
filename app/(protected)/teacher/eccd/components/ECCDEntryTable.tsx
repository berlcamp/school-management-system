"use client";

import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { EccdCompetency, EccdDomain, EccdPeriod, EccdScaleScore, Student } from "@/types";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ECCDRatingCheckbox } from "./ECCDRatingCheckbox";

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
  const [scaleScores, setScaleScores] = useState<EccdScaleScore[]>([]);
  const [activeDomainId, setActiveDomainId] = useState<string>("");
  // ratings: Record<studentId, Record<competencyId, 0 | 1>>
  const [ratings, setRatings] = useState<Record<string, Record<string, number>>>({});
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
      const [domainsRes, competenciesRes, scaleScoresRes] = await Promise.all([
        supabase.from("sms_eccd_domains").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("sms_eccd_competencies").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("sms_eccd_scale_scores").select("*"),
      ]);

      const domainList = domainsRes.data || [];
      const compList = competenciesRes.data || [];
      const scaleList = scaleScoresRes.data || [];

      if (isMounted.current) {
        setDomains(domainList);
        setCompetencies(compList);
        setScaleScores(scaleList);
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

      const ratingsMap: Record<string, Record<string, number>> = {};
      studentList.forEach((s) => { ratingsMap[s.id] = {}; });
      (assessments || []).forEach((a: { student_id: string; competency_id: string; rating: number | null }) => {
        const sid = String(a.student_id);
        if (!ratingsMap[sid]) ratingsMap[sid] = {};
        ratingsMap[sid][String(a.competency_id)] = a.rating ?? 0;
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
      value: number,
      previousValue: number
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
            rating: value,
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
    [sectionId, schoolYear, period, user?.system_user_id, user?.school_id]
  );

  const updateRating = useCallback(
    (studentId: string, competencyId: string, checked: boolean) => {
      if (yearLocked) {
        toast.error("Editing previous school year records is disabled");
        return;
      }
      const previousValue = ratings[studentId]?.[competencyId] ?? 0;
      const newValue = checked ? 1 : 0;
      setRatings((prev) => ({
        ...prev,
        [studentId]: { ...(prev[studentId] || {}), [competencyId]: newValue },
      }));
      autoSave(studentId, competencyId, newValue, previousValue);
    },
    [yearLocked, ratings, autoSave]
  );

  const getStudentRawScore = (studentId: string, domainId: string): number => {
    const studentRatings = ratings[studentId] || {};
    const domainComps = competencies.filter((c) => String(c.domain_id) === String(domainId));
    return domainComps.reduce((sum, comp) => sum + (studentRatings[comp.id] ?? 0), 0);
  };

  const getScaleScore = (domainId: string, rawScore: number): string => {
    const mapping = scaleScores.find(
      (s) => String(s.domain_id) === String(domainId) && s.raw_score === rawScore
    );
    return mapping ? String(mapping.scale_score) : "N/A";
  };

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
          School Settings to make changes.
        </p>
      )}

      {/* Domain Tabs */}
      <div className="flex flex-wrap gap-1 border-b pb-1">
        {domains.map((domain) => {
          const domainComps = competencies.filter(
            (c) => String(c.domain_id) === String(domain.id)
          );
          return (
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
              <span className="ml-1 text-xs opacity-70">({domainComps.length})</span>
            </button>
          );
        })}
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
                  className="px-2 py-3 text-center text-xs font-medium min-w-[4rem] max-w-[7rem]"
                  title={comp.code}
                >
                  <div className="line-clamp-3 leading-tight">{comp.description}</div>
                </th>
              ))}
              <th className="px-2 py-3 text-center text-xs font-medium min-w-[3.5rem] bg-blue-50">
                Raw
              </th>
              <th className="px-2 py-3 text-center text-xs font-medium min-w-[3.5rem] bg-green-50">
                Scale
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {students.map((student, idx) => {
              const studentRatings = ratings[student.id] || {};
              const rawScore = getStudentRawScore(student.id, activeDomainId);
              const scaleScore = getScaleScore(activeDomainId, rawScore);
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
                      <td key={comp.id} className="px-2 py-2 align-middle text-center">
                        <div className="relative inline-flex">
                          <ECCDRatingCheckbox
                            checked={(studentRatings[comp.id] ?? 0) === 1}
                            onChange={(checked) => updateRating(student.id, comp.id, checked)}
                            disabled={isLocked || isSaving}
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
                  <td className="px-2 py-2.5 align-middle text-center text-sm font-semibold bg-blue-50/50">
                    {rawScore}
                  </td>
                  <td className="px-2 py-2.5 align-middle text-center text-sm font-semibold bg-green-50/50">
                    {scaleScore}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
