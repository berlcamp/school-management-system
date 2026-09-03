"use client";

import { Textarea } from "@/components/ui/textarea";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { KINDER_RATINGS, KINDER_RATING_LABELS } from "@/lib/constants/kinderProgress";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import type {
  KinderProgressCompetency,
  KinderProgressDomain,
  KinderProgressRating,
  KinderProgressTerm,
  Student,
} from "@/types";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { KinderRatingCycler } from "./KinderRatingCycler";

const REMARKS_TAB = "__remarks";
/** Debounce on the free-text remarks; ratings save on the click itself. */
const REMARKS_SAVE_DELAY_MS = 800;

interface KinderProgressEntryTableProps {
  sectionId: string;
  schoolYear: string;
  term: KinderProgressTerm;
  fillHeight?: boolean;
  onSavingChange?: (isSaving: boolean) => void;
}

export function KinderProgressEntryTable({
  sectionId,
  schoolYear,
  term,
  fillHeight,
  onSavingChange,
}: KinderProgressEntryTableProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [domains, setDomains] = useState<KinderProgressDomain[]>([]);
  const [competencies, setCompetencies] = useState<KinderProgressCompetency[]>([]);
  const [activeTab, setActiveTab] = useState<string>("");
  // ratings: studentId -> competencyId -> rating
  const [ratings, setRatings] = useState<
    Record<string, Record<string, KinderProgressRating | "">>
  >({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const isMounted = useRef(true);
  const remarkTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const user = useAppSelector((state) => state.user.user);

  const isPreviousYear = schoolYear !== getCurrentSchoolYear();
  const { settings, isLoading: settingsLoading } = useSchoolSettings(
    true,
    user?.school_id,
  );
  const yearLocked = isPreviousYear && !settings.allow_edit_previous_school_year;
  const isLocked = yearLocked || settingsLoading;

  useEffect(() => {
    isMounted.current = true;
    const timers = remarkTimers.current;
    return () => {
      isMounted.current = false;
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    onSavingChange?.(savingKeys.size > 0);
  }, [savingKeys.size, onSavingChange]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [domainsRes, compsRes, enrollmentsRes] = await Promise.all([
        supabase
          .from("sms_kinder_progress_domains")
          .select("*")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("sms_kinder_progress_competencies")
          .select("*")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("sms_enrollments")
          .select("student_id")
          .eq("section_id", sectionId)
          .eq("school_year", schoolYear)
          .eq("status", "approved"),
      ]);

      const domainList = (domainsRes.data || []) as KinderProgressDomain[];
      if (isMounted.current) {
        setDomains(domainList);
        setCompetencies((compsRes.data || []) as KinderProgressCompetency[]);
        setActiveTab((prev) =>
          prev && (prev === REMARKS_TAB || domainList.some((d) => String(d.id) === prev))
            ? prev
            : domainList[0]
              ? String(domainList[0].id)
              : "",
        );
      }

      const studentIds = (enrollmentsRes.data || []).map((e) => e.student_id);
      if (studentIds.length === 0) {
        if (isMounted.current) {
          setStudents([]);
          setRatings({});
          setRemarks({});
        }
        return;
      }

      const [studentsRes, ratingsRes, remarksRes] = await Promise.all([
        supabase
          .from("sms_students")
          .select("*")
          .in("id", studentIds)
          .order("last_name")
          .order("first_name"),
        supabase
          .from("sms_kinder_progress_ratings")
          .select("student_id, competency_id, rating")
          .eq("section_id", sectionId)
          .eq("school_year", schoolYear)
          .eq("term", term)
          .in("student_id", studentIds),
        supabase
          .from("sms_kinder_progress_remarks")
          .select("student_id, remarks")
          .eq("section_id", sectionId)
          .eq("school_year", schoolYear)
          .eq("term", term)
          .in("student_id", studentIds),
      ]);

      if (studentsRes.error || !studentsRes.data) {
        toast.error("Failed to load learners");
        if (isMounted.current) {
          setStudents([]);
          setRatings({});
        }
        return;
      }

      const ratingsMap: Record<string, Record<string, KinderProgressRating | "">> = {};
      studentsRes.data.forEach((s) => {
        ratingsMap[s.id] = {};
      });
      (ratingsRes.data || []).forEach((r) => {
        const sid = String(r.student_id);
        ratingsMap[sid] ??= {};
        ratingsMap[sid][String(r.competency_id)] = r.rating as KinderProgressRating;
      });

      const remarksMap: Record<string, string> = {};
      (remarksRes.data || []).forEach((r) => {
        remarksMap[String(r.student_id)] = (r.remarks as string) ?? "";
      });

      if (isMounted.current) {
        setStudents(studentsRes.data);
        setRatings(ratingsMap);
        setRemarks(remarksMap);
      }
    } catch (err) {
      console.error("Error loading Kindergarten progress data:", err);
      toast.error("Failed to load data");
      if (isMounted.current) {
        setStudents([]);
        setRatings({});
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [sectionId, schoolYear, term]);

  useEffect(() => {
    if (!sectionId || !schoolYear || !term) {
      setStudents([]);
      setRatings({});
      setRemarks({});
      return;
    }
    void fetchData();
  }, [fetchData, sectionId, schoolYear, term]);

  const withSavingKey = useCallback(
    async (key: string, run: () => Promise<void>) => {
      setSavingKeys((prev) => new Set(prev).add(key));
      try {
        await run();
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
    [],
  );

  /**
   * Clearing a rating DELETEs the row rather than writing an empty one: the
   * printed card shows a blank cell for "not yet rated", and a NULL rating
   * would have to be excluded everywhere it is read.
   */
  const saveRating = useCallback(
    (
      studentId: string,
      competencyId: string,
      value: KinderProgressRating | "",
      previous: KinderProgressRating | "",
    ) => {
      const key = `${studentId}:${competencyId}`;
      void withSavingKey(key, async () => {
        try {
          const { error } = value
            ? await supabase.from("sms_kinder_progress_ratings").upsert(
                {
                  student_id: studentId,
                  competency_id: competencyId,
                  section_id: sectionId,
                  school_id: user?.school_id ? Number(user.school_id) : null,
                  school_year: schoolYear,
                  term,
                  rating: value,
                  assessed_by: user?.system_user_id ?? null,
                },
                {
                  onConflict: "student_id,competency_id,section_id,school_year,term",
                  ignoreDuplicates: false,
                },
              )
            : await supabase
                .from("sms_kinder_progress_ratings")
                .delete()
                .eq("student_id", studentId)
                .eq("competency_id", competencyId)
                .eq("section_id", sectionId)
                .eq("school_year", schoolYear)
                .eq("term", term);
          if (error) throw error;
        } catch (err) {
          console.error("Rating save error:", err);
          toast.error("Failed to save. Please try again.");
          if (isMounted.current) {
            setRatings((prev) => ({
              ...prev,
              [studentId]: { ...(prev[studentId] || {}), [competencyId]: previous },
            }));
          }
        }
      });
    },
    [sectionId, schoolYear, term, user?.school_id, user?.system_user_id, withSavingKey],
  );

  const updateRating = useCallback(
    (studentId: string, competencyId: string, value: KinderProgressRating | "") => {
      if (yearLocked) {
        toast.error("Editing previous school year records is disabled");
        return;
      }
      const previous = ratings[studentId]?.[competencyId] ?? "";
      setRatings((prev) => ({
        ...prev,
        [studentId]: { ...(prev[studentId] || {}), [competencyId]: value },
      }));
      saveRating(studentId, competencyId, value, previous);
    },
    [ratings, saveRating, yearLocked],
  );

  const updateRemarks = useCallback(
    (studentId: string, value: string) => {
      if (yearLocked) {
        toast.error("Editing previous school year records is disabled");
        return;
      }
      setRemarks((prev) => ({ ...prev, [studentId]: value }));

      clearTimeout(remarkTimers.current[studentId]);
      remarkTimers.current[studentId] = setTimeout(() => {
        const key = `remarks:${studentId}`;
        void withSavingKey(key, async () => {
          const { error } = await supabase.from("sms_kinder_progress_remarks").upsert(
            {
              student_id: studentId,
              section_id: sectionId,
              school_id: user?.school_id ? Number(user.school_id) : null,
              school_year: schoolYear,
              term,
              remarks: value,
              created_by: user?.system_user_id ?? null,
            },
            {
              onConflict: "student_id,section_id,school_year,term",
              ignoreDuplicates: false,
            },
          );
          if (error) {
            console.error("Remarks save error:", error);
            toast.error("Failed to save remarks");
          }
        });
      }, REMARKS_SAVE_DELAY_MS);
    },
    [sectionId, schoolYear, term, user?.school_id, user?.system_user_id, withSavingKey, yearLocked],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading progress report...
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

  const learnerName = (s: Student) =>
    `${s.last_name}, ${s.first_name} ${s.middle_name || ""} ${s.suffix || ""}`.trim();

  // Strand headings are printed on the card but carry no rating, so they never
  // become a column here.
  const activeDomain = domains.find((d) => String(d.id) === activeTab);
  const activeItems = competencies.filter(
    (c) => String(c.domain_id) === activeTab && !c.is_heading,
  );

  return (
    <div className={`flex flex-col gap-3 ${fillHeight ? "h-full min-h-0" : ""}`}>
      {yearLocked && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-600">
          Editing records from previous school years is disabled. Enable it in
          School Settings to make changes.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-1">
        <div className="flex flex-wrap gap-1">
          {domains.map((domain) => {
            const count = competencies.filter(
              (c) => String(c.domain_id) === String(domain.id) && !c.is_heading,
            ).length;
            const active = activeTab === String(domain.id);
            return (
              <button
                key={domain.id}
                type="button"
                onClick={() => setActiveTab(String(domain.id))}
                title={domain.name}
                className={`rounded-t-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-primary font-medium text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {domain.numeral}. {domain.code}
                <span className="ml-1 text-xs opacity-70">({count})</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setActiveTab(REMARKS_TAB)}
            className={`rounded-t-md px-3 py-1.5 text-sm transition-colors ${
              activeTab === REMARKS_TAB
                ? "bg-primary font-medium text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Comments
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {KINDER_RATINGS.map((r) => (
            <span key={r}>
              <span className="font-semibold">{r}</span> {KINDER_RATING_LABELS[r]}
            </span>
          ))}
        </div>
      </div>

      {activeTab === REMARKS_TAB ? (
        <div
          className={`overflow-y-auto rounded-md border ${
            fillHeight ? "min-h-0 flex-1" : "max-h-[min(65vh,calc(100dvh-18rem))]"
          }`}
        >
          <div className="divide-y">
            {students.map((student, idx) => (
              <div key={student.id} className="flex gap-3 p-3">
                <div className="w-56 shrink-0 text-sm leading-snug">
                  <span className="text-muted-foreground tabular-nums">{idx + 1}.</span>{" "}
                  {learnerName(student)}
                </div>
                <Textarea
                  value={remarks[student.id] ?? ""}
                  onChange={(e) => updateRemarks(student.id, e.target.value)}
                  disabled={isLocked}
                  rows={3}
                  placeholder="Specific observations, strengths, and suggested interventions"
                  className="flex-1 text-sm"
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {activeDomain && (
            <h3 className="text-sm font-medium">
              {activeDomain.numeral}. {activeDomain.name}
            </h3>
          )}
          <div
            className={`overflow-x-auto rounded-md border ${
              fillHeight
                ? "min-h-0 flex-1 overflow-y-auto"
                : "max-h-[min(65vh,calc(100dvh-18rem))] overflow-y-auto"
            }`}
          >
            <table className="w-full">
              <thead className="sticky top-0 z-10 border-b border-border bg-muted">
                <tr>
                  <th className="w-12 min-w-[2.75rem] px-3 py-3 text-left text-sm font-medium">
                    No.
                  </th>
                  <th className="w-[12rem] min-w-[12rem] max-w-[12rem] px-3 py-3 text-left text-sm font-medium">
                    Name of Learner
                  </th>
                  {activeItems.map((c) => (
                    <th
                      key={c.id}
                      title={c.description}
                      className="min-w-[4.5rem] max-w-[7rem] px-2 py-3 text-center text-xs font-medium"
                    >
                      <div className="line-clamp-3 leading-tight">{c.description}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {students.map((student, idx) => (
                  <tr key={student.id} className="transition-colors hover:bg-muted/50">
                    <td className="px-3 py-2.5 align-middle text-sm tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="w-[12rem] max-w-[12rem] break-words px-3 py-2.5 align-middle text-sm leading-snug">
                      {learnerName(student)}
                    </td>
                    {activeItems.map((c) => {
                      const key = `${student.id}:${c.id}`;
                      const saving = savingKeys.has(key);
                      return (
                        <td key={c.id} className="px-2 py-2 text-center align-middle">
                          <div className="relative inline-flex">
                            <KinderRatingCycler
                              value={ratings[student.id]?.[c.id] ?? ""}
                              onChange={(v) => updateRating(student.id, c.id, v)}
                              disabled={isLocked || saving}
                            />
                            {saving && (
                              <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/60">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
