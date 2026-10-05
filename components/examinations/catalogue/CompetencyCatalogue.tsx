"use client";

import { Button } from "@/components/ui/button";
import { useLearningAreas } from "@/hooks/useCatalogue";
import { CATALOGUE_GRADES, catalogueGradeLabel } from "@/lib/constants/questionBank";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { BookOpen, FileSpreadsheet, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { CatalogueAreaHeader, CatalogueAreas } from "./CatalogueAreas";
import { CatalogueCompetencies } from "./CatalogueCompetencies";
import { CatalogueImportDialog } from "./CatalogueImportDialog";

type GradeCounts = Record<number, { active: number; retired: number }>;

/** Active / retired entries per grade of one learning area, for the grade chips. */
function useGradeCounts(areaId: string | null, version: number) {
  const [counts, setCounts] = useState<GradeCounts>({});

  useEffect(() => {
    let isMounted = true;
    if (!areaId) {
      setCounts({});
      return;
    }
    (async () => {
      const next: GradeCounts = {};
      // Paged: PostgREST caps a response at 1000 rows.
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("sms_competency_catalogue")
          .select("grade_level, is_active")
          .eq("learning_area_id", Number(areaId))
          .order("id")
          .range(from, from + 999);
        if (!isMounted) return;
        if (error) {
          console.error(error);
          break;
        }
        for (const r of (data ?? []) as { grade_level: number; is_active: boolean }[]) {
          const c = (next[r.grade_level] ??= { active: 0, retired: 0 });
          if (r.is_active) c.active += 1;
          else c.retired += 1;
        }
        if (!data || data.length < 1000) break;
      }
      if (isMounted) setCounts(next);
    })();
    return () => {
      isMounted = false;
    };
  }, [areaId, version]);

  return counts;
}

/** The division competency catalogue every TOS picks from (migration 195). */
export function CompetencyCatalogue() {
  const { areas, loading, reload } = useLearningAreas(true);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [grade, setGrade] = useState<number>(1);
  const [importOpen, setImportOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [countsVersion, setCountsVersion] = useState(0);
  const counts = useGradeCounts(areaId, countsVersion);

  const selected = areas.find((a) => String(a.id) === String(areaId)) ?? null;

  // Open on the first active area rather than an empty panel.
  useEffect(() => {
    if (areaId || areas.length === 0) return;
    const first = areas.find((a) => a.is_active) ?? areas[0];
    setAreaId(String(first.id));
  }, [areas, areaId]);

  const importButton = (
    <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
      <Upload className="mr-1.5 h-4 w-4" /> Import from Excel
    </Button>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
      <CatalogueAreas
        areas={areas}
        loading={loading}
        selectedId={areaId}
        onSelect={setAreaId}
        onChanged={reload}
      />

      <div className="min-w-0 space-y-4">
        {selected ? (
          <>
            <CatalogueAreaHeader key={selected.id} area={selected} onChanged={reload} action={importButton} />

            <div role="group" aria-label="Grade level" className="flex flex-wrap gap-1.5">
              {CATALOGUE_GRADES.map((g) => {
                const c = counts[g];
                const active = g === grade;
                return (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setGrade(g)}
                    className={cn(
                      "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      active
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "bg-background hover:bg-muted",
                      !active && !c?.active && "text-muted-foreground",
                    )}
                  >
                    {catalogueGradeLabel(g)}
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-xs tabular-nums",
                        active ? "bg-white/20" : c?.active ? "bg-muted font-medium text-foreground" : "",
                      )}
                    >
                      {c?.active ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>

            <CatalogueCompetencies
              key={`${areaId}-${grade}-${refreshKey}`}
              areaId={String(selected.id)}
              areaName={selected.name}
              areaActive={selected.is_active}
              gradeLevel={grade}
              onChanged={() => setCountsVersion((v) => v + 1)}
            />
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading learning areas…</p>
            ) : (
              <>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  {areas.length === 0 ? <FileSpreadsheet className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
                </span>
                <div>
                  <p className="font-medium">
                    {areas.length === 0 ? "The catalogue is empty" : "Pick a learning area"}
                  </p>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    {areas.length === 0
                      ? "Every TOS picks its competencies from here. Import the division list from Excel, or add a learning area on the left."
                      : "Choose a learning area on the left to see its competencies by grade."}
                  </p>
                </div>
                {areas.length === 0 && importButton}
              </>
            )}
          </div>
        )}
      </div>

      <CatalogueImportDialog
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          reload();
          setRefreshKey((k) => k + 1);
          setCountsVersion((v) => v + 1);
        }}
      />
    </div>
  );
}
