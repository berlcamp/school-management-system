"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLearningAreas } from "@/hooks/useCatalogue";
import { CATALOGUE_GRADES, catalogueGradeLabel } from "@/lib/constants/questionBank";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  Archive,
  ArchiveRestore,
  FileSpreadsheet,
  MoreHorizontal,
  Pencil,
  Plus,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AreaNameDialog, AreaPicker } from "./CatalogueAreas";
import { CatalogueCompetencies } from "./CatalogueCompetencies";
import { CatalogueImportDialog } from "./CatalogueImportDialog";

type GradeCounts = Record<number, { active: number; retired: number }>;

/** Active / retired entries per grade of one learning area, for the grade picker. */
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
  const [addOpen, setAddOpen] = useState(false);
  // Open and mode kept apart, so the title does not flip while the dialog animates closed.
  const [areaDialogOpen, setAreaDialogOpen] = useState(false);
  const [renamingArea, setRenamingArea] = useState(false);
  const [areaBusy, setAreaBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [countsVersion, setCountsVersion] = useState(0);
  const counts = useGradeCounts(areaId, countsVersion);

  const selected = areas.find((a) => String(a.id) === String(areaId)) ?? null;

  const openAreaDialog = (rename: boolean) => {
    setRenamingArea(rename);
    setAreaDialogOpen(true);
  };

  // Open on the first active area rather than an empty list.
  useEffect(() => {
    if (areaId || areas.length === 0) return;
    const first = areas.find((a) => a.is_active) ?? areas[0];
    setAreaId(String(first.id));
  }, [areas, areaId]);

  const toggleAreaRetired = async () => {
    if (!selected || areaBusy) return;
    setAreaBusy(true);
    const { error } = await supabase
      .from("sms_learning_areas")
      .update({ is_active: !selected.is_active })
      .eq("id", Number(selected.id));
    setAreaBusy(false);
    if (error) return void toast.error(error.message);
    toast.success(selected.is_active ? "Learning area retired" : "Learning area restored");
    reload();
  };

  const importButton = (
    <Button variant="outline" onClick={() => setImportOpen(true)}>
      <Upload className="mr-1.5 h-4 w-4" /> Import from Excel
    </Button>
  );

  return (
    <div className="space-y-4">
      {areas.length === 0 && !loading ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed bg-background px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
            <FileSpreadsheet className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <p className="font-medium">The catalogue is empty</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Every TOS picks its competencies from here. Import the division list from Excel, or start
              with a learning area.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => openAreaDialog(false)}>
              <Plus className="mr-1.5 h-4 w-4" /> New learning area
            </Button>
            {importButton}
          </div>
        </div>
      ) : (
        <>
          {/* Toolbar: what is being listed, and what can be done to it. */}
          <div className="flex flex-col gap-3 rounded-lg border bg-background p-3 shadow-sm sm:flex-row sm:items-center">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <AreaPicker
                areas={areas}
                loading={loading}
                selectedId={areaId}
                onSelect={setAreaId}
                onCreate={() => openAreaDialog(false)}
              />
              <Select value={String(grade)} onValueChange={(v) => setGrade(Number(v))} disabled={!selected}>
                <SelectTrigger aria-label="Grade level" className="h-10 w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATALOGUE_GRADES.map((g) => {
                    const n = counts[g]?.active ?? 0;
                    return (
                      <SelectItem key={g} value={String(g)}>
                        <span className={cn(n === 0 && "text-muted-foreground")}>{catalogueGradeLabel(g)}</span>
                        <span
                          className={cn(
                            "ml-1 rounded-full px-1.5 text-xs tabular-nums",
                            n > 0
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
                              : "text-muted-foreground/70",
                          )}
                        >
                          {n}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 sm:ml-auto">
              <Button variant="outline" className="hidden md:inline-flex" onClick={() => setImportOpen(true)}>
                <Upload className="mr-1.5 h-4 w-4" /> Import from Excel
              </Button>
              <Button className="flex-1 sm:flex-none" disabled={!selected} onClick={() => setAddOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Add competency
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="More catalogue actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onSelect={() => openAreaDialog(false)}>
                    <Plus className="mr-2 h-4 w-4" /> New learning area
                  </DropdownMenuItem>
                  <DropdownMenuItem className="md:hidden" onSelect={() => setImportOpen(true)}>
                    <Upload className="mr-2 h-4 w-4" /> Import from Excel
                  </DropdownMenuItem>
                  {selected && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => openAreaDialog(true)}>
                        <Pencil className="mr-2 h-4 w-4" /> Rename {selected.name}
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={areaBusy} onSelect={() => void toggleAreaRetired()}>
                        {selected.is_active ? (
                          <><Archive className="mr-2 h-4 w-4" /> Retire {selected.name}</>
                        ) : (
                          <><ArchiveRestore className="mr-2 h-4 w-4" /> Restore {selected.name}</>
                        )}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {selected && !selected.is_active && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <span>
                <strong className="font-semibold">{selected.name}</strong> is retired — new TOS cannot pick it.
                TOS already saved are unaffected.
              </span>
              <Button size="sm" variant="outline" disabled={areaBusy} onClick={() => void toggleAreaRetired()}>
                <ArchiveRestore className="mr-1.5 h-4 w-4" /> Restore
              </Button>
            </div>
          )}

          {selected ? (
            <CatalogueCompetencies
              key={`${areaId}-${grade}-${refreshKey}`}
              areaId={String(selected.id)}
              areaName={selected.name}
              areaActive={selected.is_active}
              gradeLevel={grade}
              addOpen={addOpen}
              onAddOpenChange={setAddOpen}
              onChanged={() => setCountsVersion((v) => v + 1)}
            />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">Loading learning areas…</p>
          )}
        </>
      )}

      <AreaNameDialog
        open={areaDialogOpen}
        onOpenChange={setAreaDialogOpen}
        area={renamingArea ? selected : null}
        onSaved={(id) => {
          reload();
          if (id) setAreaId(id);
        }}
      />
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
