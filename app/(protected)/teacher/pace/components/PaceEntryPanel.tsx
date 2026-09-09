"use client";

import { Textarea } from "@/components/ui/textarea";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import {
  GRADE1_NARRATIVE_BLOCKS,
  PACE_RATINGS,
  PACE_RATING_LABELS,
  PACE_TERMS,
  PACE_TERM_LABELS,
  PACE_TERM_LABELS_FILIPINO,
} from "@/lib/constants/pace";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import type { PaceArea, PaceCompetency, PaceRating, PaceTerm } from "@/types";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { PaceRatingSelect } from "./PaceRatingSelect";

/**
 * PACE entry for ONE learner.
 *
 * Per learner rather than per class, and all three terms on screen at once,
 * because that is the shape of the document being filled in: the printed PACE
 * page is one learner's competency list with a T1 / T2 / T3 rating column. The
 * workbook enters these on a class-summary sheet up to ninety columns wide,
 * which is a spreadsheet affordance rather than a form.
 *
 * A cell exists only where the competency is actually rated in that term — the
 * issued form leaves the others blank, and an adviser must not be able to
 * record a Term 3 rating against a Term 1 competency. That comes from
 * `terms`, so it follows the seeded form rather than a rule written here.
 */

const NARRATIVE_TAB = "__narrative";
/** Debounce on the free-text narrative; ratings save on the click itself. */
const NARRATIVE_SAVE_DELAY_MS = 800;

type NarrativeKey = "can_do" | "to_improve";

interface PaceEntryPanelProps {
  studentId: string;
  sectionId: string;
  schoolYear: string;
  fillHeight?: boolean;
  onSavingChange?: (isSaving: boolean) => void;
}

export function PaceEntryPanel({
  studentId,
  sectionId,
  schoolYear,
  fillHeight,
  onSavingChange,
}: PaceEntryPanelProps) {
  const [areas, setAreas] = useState<PaceArea[]>([]);
  const [competencies, setCompetencies] = useState<PaceCompetency[]>([]);
  const [activeTab, setActiveTab] = useState<string>("");
  // ratings: competencyId -> term -> rating
  const [ratings, setRatings] = useState<
    Record<string, Partial<Record<PaceTerm, PaceRating | "">>>
  >({});
  // narrative: term -> { can_do, to_improve }
  const [narrative, setNarrative] = useState<
    Record<number, Record<NarrativeKey, string>>
  >({});
  const [loading, setLoading] = useState(false);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const isMounted = useRef(true);
  const narrativeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
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
    const timers = narrativeTimers.current;
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
      const [areasRes, compsRes, ratingsRes, narrativeRes] = await Promise.all([
        supabase
          .from("sms_pace_areas")
          .select("*")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("sms_pace_competencies")
          .select("*")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("sms_pace_ratings")
          .select("competency_id, term, rating")
          .eq("student_id", studentId)
          .eq("section_id", sectionId)
          .eq("school_year", schoolYear),
        supabase
          .from("sms_grade1_progress_narratives")
          .select("term, can_do, to_improve")
          .eq("student_id", studentId)
          .eq("section_id", sectionId)
          .eq("school_year", schoolYear),
      ]);

      const areaList = (areasRes.data || []) as PaceArea[];
      const ratingsMap: Record<
        string,
        Partial<Record<PaceTerm, PaceRating | "">>
      > = {};
      (ratingsRes.data || []).forEach((r) => {
        const cid = String(r.competency_id);
        ratingsMap[cid] ??= {};
        ratingsMap[cid][r.term as PaceTerm] = r.rating as PaceRating;
      });

      const narrativeMap: Record<number, Record<NarrativeKey, string>> = {};
      (narrativeRes.data || []).forEach((n) => {
        narrativeMap[n.term as number] = {
          can_do: (n.can_do as string) ?? "",
          to_improve: (n.to_improve as string) ?? "",
        };
      });

      if (!isMounted.current) return;
      setAreas(areaList);
      setCompetencies((compsRes.data || []) as PaceCompetency[]);
      setRatings(ratingsMap);
      setNarrative(narrativeMap);
      setActiveTab((prev) =>
        prev &&
        (prev === NARRATIVE_TAB || areaList.some((a) => String(a.id) === prev))
          ? prev
          : areaList[0]
            ? String(areaList[0].id)
            : "",
      );
    } catch (err) {
      console.error("Error loading PACE data:", err);
      toast.error("Failed to load the PACE form");
      if (isMounted.current) {
        setCompetencies([]);
        setRatings({});
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [studentId, sectionId, schoolYear]);

  useEffect(() => {
    if (!studentId || !sectionId || !schoolYear) return;
    void fetchData();
  }, [fetchData, studentId, sectionId, schoolYear]);

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
   * printed form shows a blank cell for "not yet rated" (migration 180).
   */
  const saveRating = useCallback(
    (
      competencyId: string,
      term: PaceTerm,
      value: PaceRating | "",
      previous: PaceRating | "",
    ) => {
      const key = `${competencyId}:${term}`;
      void withSavingKey(key, async () => {
        try {
          const { error } = value
            ? await supabase.from("sms_pace_ratings").upsert(
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
                  onConflict:
                    "student_id,competency_id,section_id,school_year,term",
                  ignoreDuplicates: false,
                },
              )
            : await supabase
                .from("sms_pace_ratings")
                .delete()
                .eq("student_id", studentId)
                .eq("competency_id", competencyId)
                .eq("section_id", sectionId)
                .eq("school_year", schoolYear)
                .eq("term", term);
          if (error) throw error;
        } catch (err) {
          console.error("PACE rating save error:", err);
          toast.error("Failed to save. Please try again.");
          if (isMounted.current) {
            setRatings((prev) => ({
              ...prev,
              [competencyId]: { ...(prev[competencyId] || {}), [term]: previous },
            }));
          }
        }
      });
    },
    [studentId, sectionId, schoolYear, user?.school_id, user?.system_user_id, withSavingKey],
  );

  const updateRating = useCallback(
    (competencyId: string, term: PaceTerm, value: PaceRating | "") => {
      if (yearLocked) {
        toast.error("Editing previous school year records is disabled");
        return;
      }
      const previous = ratings[competencyId]?.[term] ?? "";
      setRatings((prev) => ({
        ...prev,
        [competencyId]: { ...(prev[competencyId] || {}), [term]: value },
      }));
      saveRating(competencyId, term, value, previous);
    },
    [ratings, saveRating, yearLocked],
  );

  const updateNarrative = useCallback(
    (term: PaceTerm, field: NarrativeKey, value: string) => {
      if (yearLocked) {
        toast.error("Editing previous school year records is disabled");
        return;
      }
      setNarrative((prev) => ({
        ...prev,
        [term]: {
          can_do: prev[term]?.can_do ?? "",
          to_improve: prev[term]?.to_improve ?? "",
          [field]: value,
        },
      }));

      const timerKey = `${term}:${field}`;
      clearTimeout(narrativeTimers.current[timerKey]);
      narrativeTimers.current[timerKey] = setTimeout(() => {
        void withSavingKey(`narrative:${timerKey}`, async () => {
          // Send both fields: the row is unique per (learner, section, year,
          // term) and an upsert of one column would blank the other.
          const current = {
            can_do: narrative[term]?.can_do ?? "",
            to_improve: narrative[term]?.to_improve ?? "",
            [field]: value,
          } as Record<NarrativeKey, string>;
          const { error } = await supabase
            .from("sms_grade1_progress_narratives")
            .upsert(
              {
                student_id: studentId,
                section_id: sectionId,
                school_id: user?.school_id ? Number(user.school_id) : null,
                school_year: schoolYear,
                term,
                can_do: current.can_do,
                to_improve: current.to_improve,
                created_by: user?.system_user_id ?? null,
              },
              {
                onConflict: "student_id,section_id,school_year,term",
                ignoreDuplicates: false,
              },
            );
          if (error) {
            console.error("PACE narrative save error:", error);
            toast.error("Failed to save the narrative");
          }
        });
      }, NARRATIVE_SAVE_DELAY_MS);
    },
    [narrative, studentId, sectionId, schoolYear, user?.school_id, user?.system_user_id, withSavingKey, yearLocked],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading PACE form...
      </div>
    );
  }

  const activeArea = areas.find((a) => String(a.id) === activeTab);
  const activeItems = competencies.filter((c) => String(c.area_id) === activeTab);

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
          {areas.map((area) => {
            const count = competencies.filter(
              (c) => String(c.area_id) === String(area.id) && c.terms.length > 0,
            ).length;
            const active = activeTab === String(area.id);
            return (
              <button
                key={area.id}
                type="button"
                onClick={() => setActiveTab(String(area.id))}
                title={area.name}
                className={`rounded-t-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-primary font-medium text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {area.code}
                <span className="ml-1 text-xs opacity-70">({count})</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setActiveTab(NARRATIVE_TAB)}
            className={`rounded-t-md px-3 py-1.5 text-sm transition-colors ${
              activeTab === NARRATIVE_TAB
                ? "bg-primary font-medium text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Progress Card
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {PACE_RATINGS.map((r) => (
            <span key={r}>
              <span className="font-semibold">{r}</span> {PACE_RATING_LABELS[r]}
            </span>
          ))}
        </div>
      </div>

      {activeTab === NARRATIVE_TAB ? (
        <div
          className={`space-y-4 overflow-y-auto rounded-md border p-4 ${
            fillHeight ? "min-h-0 flex-1" : "max-h-[min(65vh,calc(100dvh-18rem))]"
          }`}
        >
          <p className="text-xs text-muted-foreground">
            Grade 1 reports no numeric grades. These two blocks are what the
            parent&rsquo;s card prints for each term; the competency detail
            above is attached to it as the PACE form.
          </p>
          {PACE_TERMS.map((term) => (
            <div key={term} className="rounded-md border">
              <div className="border-b bg-muted/50 px-3 py-2 text-sm font-medium">
                {PACE_TERM_LABELS[term]} ({PACE_TERM_LABELS_FILIPINO[term]})
              </div>
              <div className="grid gap-3 p-3 md:grid-cols-2">
                {GRADE1_NARRATIVE_BLOCKS.map((block) => (
                  <div key={block.key} className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium">
                      {block.title}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({block.filipino})
                      </span>
                    </label>
                    <Textarea
                      value={narrative[term]?.[block.key] ?? ""}
                      onChange={(e) =>
                        updateNarrative(term, block.key, e.target.value)
                      }
                      disabled={isLocked}
                      rows={4}
                      className="text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {activeArea && (
            <h3 className="text-sm font-medium">{activeArea.name}</h3>
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
                  <th className="w-12 min-w-[3rem] px-3 py-2.5 text-left text-sm font-medium">
                    No.
                  </th>
                  <th className="px-3 py-2.5 text-left text-sm font-medium">
                    Learning Competencies
                  </th>
                  {PACE_TERMS.map((t) => (
                    <th
                      key={t}
                      className="w-[5rem] min-w-[5rem] px-2 py-2.5 text-center text-sm font-medium"
                    >
                      T{t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {activeItems.map((c) => {
                  // A heading spans the row, exactly as it does on the paper.
                  if (c.is_heading) {
                    return (
                      <tr key={c.id} className="bg-muted/40">
                        <td
                          colSpan={2 + PACE_TERMS.length}
                          className="px-3 py-2 text-sm font-semibold"
                        >
                          {c.description}
                        </td>
                      </tr>
                    );
                  }
                  const isParent = c.terms.length === 0;
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-muted/50">
                      <td className="px-3 py-2 align-top text-sm tabular-nums">
                        {c.item_number ?? ""}
                      </td>
                      <td
                        className={`px-3 py-2 align-top text-sm leading-snug ${
                          isParent ? "font-medium" : ""
                        }`}
                      >
                        {c.description}
                      </td>
                      {PACE_TERMS.map((t) => {
                        // Blank where the issued form has no cell at all.
                        if (!c.terms.includes(t)) {
                          return (
                            <td
                              key={t}
                              className="bg-muted/30 px-2 py-2 text-center align-middle"
                            />
                          );
                        }
                        const key = `${c.id}:${t}`;
                        const saving = savingKeys.has(key);
                        return (
                          <td key={t} className="px-2 py-2 text-center align-middle">
                            <div className="relative inline-flex">
                              <PaceRatingSelect
                                value={ratings[c.id]?.[t] ?? ""}
                                onChange={(v) => updateRating(String(c.id), t, v)}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
