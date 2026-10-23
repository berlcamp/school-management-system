"use client";

import { ConfirmDialog } from "@/components/ConfirmDialog";
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
import {
  Archive,
  ArchiveRestore,
  FileSpreadsheet,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { AreaGroupsDialog } from "./CatalogueAreaGroups";
import { AreaNameDialog, AreaPicker } from "./CatalogueAreas";
import { CatalogueCompetencies } from "./CatalogueCompetencies";
import { CatalogueImportDialog } from "./CatalogueImportDialog";

/** Active / retired entries per learning area at one grade, for the area picker. */
type AreaCounts = Record<string, { active: number; retired: number }>;

/**
 * Excel import is hidden for now: the catalogue is seeded from the MATATAG
 * list (migration 208). Flip to bring it back.
 */
const IMPORT_ENABLED = false;

function useAreaCounts(grade: number | null, version: number) {
  const [counts, setCounts] = useState<AreaCounts>({});
  // The grade `counts` belongs to, so a stale list is never read as the new grade's.
  const [loadedGrade, setLoadedGrade] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (grade == null) {
      setCounts({});
      setLoadedGrade(null);
      return;
    }
    (async () => {
      const next: AreaCounts = {};
      // Paged: PostgREST caps a response at 1000 rows.
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("sms_competency_catalogue")
          .select("learning_area_id, is_active")
          .eq("grade_level", grade)
          .order("id")
          .range(from, from + 999);
        if (!isMounted) return;
        if (error) {
          console.error(error);
          break;
        }
        for (const r of (data ?? []) as { learning_area_id: number; is_active: boolean }[]) {
          const c = (next[String(r.learning_area_id)] ??= { active: 0, retired: 0 });
          if (r.is_active) c.active += 1;
          else c.retired += 1;
        }
        if (!data || data.length < 1000) break;
      }
      if (isMounted) {
        setCounts(next);
        setLoadedGrade(grade);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [grade, version]);

  return { counts, loaded: grade != null && loadedGrade === grade };
}

/** The division competency catalogue every TOS picks from (migration 195). */
export function CompetencyCatalogue() {
  const { areas, loading, reload } = useLearningAreas(true);
  const [areaId, setAreaId] = useState<string | null>(null);
  // No grade until one is picked: the learning areas listed depend on it.
  const [grade, setGrade] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // Open and mode kept apart, so the title does not flip while the dialog animates closed.
  const [areaDialogOpen, setAreaDialogOpen] = useState(false);
  const [renamingArea, setRenamingArea] = useState(false);
  const [areaBusy, setAreaBusy] = useState(false);
  const [retireAreaOpen, setRetireAreaOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  // Snapshot of what the dialog will do, so its wording holds while it closes.
  const [areaWillRetire, setAreaWillRetire] = useState(true);
  const askRetireArea = () => {
    setAreaWillRetire(!!selected?.is_active);
    setRetireAreaOpen(true);
  };
  const [refreshKey, setRefreshKey] = useState(0);
  const [countsVersion, setCountsVersion] = useState(0);
  const { counts, loaded: countsLoaded } = useAreaCounts(grade, countsVersion);

  // Groups (migration 219) hold no competencies; they are managed in their own dialog.
  const entryAreas = useMemo(() => areas.filter((a) => !a.is_group), [areas]);
  const selected = entryAreas.find((a) => String(a.id) === String(areaId)) ?? null;

  const openAreaDialog = (rename: boolean) => {
    setRenamingArea(rename);
    setAreaDialogOpen(true);
  };

  const changeGrade = (g: number) => {
    if (g === grade) return;
    setGrade(g);
    setAreaId(null);
  };

  // Open on the first active area that has competencies at this grade rather than an empty list.
  useEffect(() => {
    if (areaId || !countsLoaded || entryAreas.length === 0) return;
    const first = entryAreas.find((a) => a.is_active && counts[String(a.id)]);
    if (first) setAreaId(String(first.id));
  }, [entryAreas, areaId, counts, countsLoaded]);

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
    setRetireAreaOpen(false);
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
              Every TOS picks its competencies from here. Start with a learning area.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => openAreaDialog(false)}>
              <Plus className="mr-1.5 h-4 w-4" /> New learning area
            </Button>
            {IMPORT_ENABLED && importButton}
          </div>
        </div>
      ) : (
        <>
          {/* Toolbar: what is being listed, and what can be done to it. */}
          <div className="flex flex-col gap-3 rounded-lg border bg-background p-3 shadow-sm sm:flex-row sm:items-center">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={grade == null ? undefined : String(grade)} onValueChange={(v) => changeGrade(Number(v))}>
                <SelectTrigger aria-label="Grade level" className="h-10 w-full sm:w-48">
                  <SelectValue placeholder="Choose a grade level" />
                </SelectTrigger>
                <SelectContent>
                  {CATALOGUE_GRADES.map((g) => (
                    <SelectItem key={g} value={String(g)}>
                      {catalogueGradeLabel(g)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <AreaPicker
                areas={entryAreas}
                loading={loading || (grade != null && !countsLoaded)}
                disabled={grade == null}
                counts={counts}
                gradeLabel={grade == null ? "" : catalogueGradeLabel(grade)}
                selectedId={areaId}
                onSelect={setAreaId}
                onCreate={() => openAreaDialog(false)}
              />
            </div>

            <div className="flex items-center gap-2 sm:ml-auto">
              {IMPORT_ENABLED && (
                <Button variant="outline" className="hidden md:inline-flex" onClick={() => setImportOpen(true)}>
                  <Upload className="mr-1.5 h-4 w-4" /> Import from Excel
                </Button>
              )}
              <Button className="flex-1 sm:flex-none" disabled={!selected || grade == null} onClick={() => setAddOpen(true)}>
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
                  <DropdownMenuItem onSelect={() => setGroupsOpen(true)}>
                    <Layers className="mr-2 h-4 w-4" /> Learning area groups
                  </DropdownMenuItem>
                  {IMPORT_ENABLED && (
                    <DropdownMenuItem className="md:hidden" onSelect={() => setImportOpen(true)}>
                      <Upload className="mr-2 h-4 w-4" /> Import from Excel
                    </DropdownMenuItem>
                  )}
                  {selected && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => openAreaDialog(true)}>
                        <Pencil className="mr-2 h-4 w-4" /> Rename {selected.name}
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={areaBusy} onSelect={askRetireArea}>
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
              <Button size="sm" variant="outline" disabled={areaBusy} onClick={askRetireArea}>
                <ArchiveRestore className="mr-1.5 h-4 w-4" /> Restore
              </Button>
            </div>
          )}

          {grade == null ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Choose a grade level to see its learning areas.
            </p>
          ) : selected ? (
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
            <p className="py-12 text-center text-sm text-muted-foreground">
              {loading || !countsLoaded
                ? "Loading learning areas…"
                : `Choose a learning area for ${catalogueGradeLabel(grade)}.`}
            </p>
          )}
        </>
      )}

      <ConfirmDialog
        open={retireAreaOpen}
        onOpenChange={(o) => !areaBusy && setRetireAreaOpen(o)}
        title={`${areaWillRetire ? "Retire" : "Restore"} ${selected?.name ?? ""}?`}
        description={
          areaWillRetire
            ? "New TOS will no longer be able to pick this learning area or its competencies. TOS already saved are unaffected, and you can restore it later."
            : "New TOS will be able to pick this learning area and its active competencies again."
        }
        confirmText={areaWillRetire ? "Retire" : "Restore"}
        variant={areaWillRetire ? "destructive" : "default"}
        loading={areaBusy}
        onConfirm={() => void toggleAreaRetired()}
      />

      <AreaNameDialog
        open={areaDialogOpen}
        onOpenChange={setAreaDialogOpen}
        area={renamingArea ? selected : null}
        onSaved={(id) => {
          reload();
          if (id) setAreaId(id);
        }}
      />
      <AreaGroupsDialog open={groupsOpen} onOpenChange={setGroupsOpen} areas={areas} onChanged={reload} />
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
