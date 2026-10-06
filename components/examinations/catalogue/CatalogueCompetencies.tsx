"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useCatalogueCompetencies } from "@/hooks/useCatalogue";
import { catalogueGradeLabel } from "@/lib/constants/questionBank";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { normalizeLcCode } from "@/lib/utils/questionBank";
import type { CatalogueCompetency } from "@/types";
import { Archive, ArchiveRestore, Info, ListChecks, Pencil, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

type Write = () => PromiseLike<{ error: { message: string } | null }>;

function friendly(message: string) {
  return message.includes("duplicate key") ? "That LC code already exists for this grade." : message;
}

interface Props {
  areaId: string;
  areaName: string;
  areaActive: boolean;
  gradeLevel: number;
  /** The Add competency dialog, opened from the page toolbar. */
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
  /** After any write, so the grade counts can refresh. */
  onChanged: () => void;
}

/** Remounted (via `key`) after an import, which reloads it. */
export function CatalogueCompetencies({
  areaId,
  areaName,
  areaActive,
  gradeLevel,
  addOpen,
  onAddOpenChange,
  onChanged,
}: Props) {
  const { competencies, loading, reload } = useCatalogueCompetencies(areaId, gradeLevel, true);
  // Kept after close so the dialog does not change title mid-animation.
  const [editing, setEditing] = useState<CatalogueCompetency | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showRetired, setShowRetired] = useState(false);

  const activeCount = competencies.filter((c) => c.is_active).length;
  const retiredCount = competencies.length - activeCount;
  const q = search.trim().toLowerCase();
  const rows = competencies.filter(
    (c) =>
      (showRetired || c.is_active) &&
      (!q || c.lc_code.toLowerCase().includes(q) || c.competency_text.toLowerCase().includes(q)),
  );
  const gradeLabel = catalogueGradeLabel(gradeLevel);

  const saved = () => {
    reload();
    onChanged();
  };

  const toggleRetired = async (c: CatalogueCompetency) => {
    if (busyId) return;
    setBusyId(String(c.id));
    const { error } = await supabase
      .from("sms_competency_catalogue")
      .update({ is_active: !c.is_active })
      .eq("id", Number(c.id));
    setBusyId(null);
    if (error) return void toast.error(friendly(error.message));
    toast.success(c.is_active ? `Retired ${c.lc_code}` : `Restored ${c.lc_code}`);
    saved();
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {loading ? (
            "Loading…"
          ) : (
            <>
              <span className="font-semibold text-foreground tabular-nums">{activeCount}</span> active
              {retiredCount > 0 && <>, {retiredCount} retired</>}
              {q && <> · {rows.length} shown</>}
            </>
          )}
        </p>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code or text"
              aria-label="Search competencies"
              className="h-9 bg-background pl-8"
            />
          </div>
          {retiredCount > 0 && (
            <div className="flex items-center gap-2">
              <Switch id="cat-show-retired" checked={showRetired} onCheckedChange={setShowRetired} />
              <Label htmlFor="cat-show-retired" className="text-sm font-normal">
                Show retired
              </Label>
            </div>
          )}
        </div>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 text-xs hover:bg-muted/50">
              <TableHead className="hidden w-44 sm:table-cell">LC code</TableHead>
              <TableHead>Competency</TableHead>
              <TableHead className="w-24 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 5 }, (_, i) => (
                <TableRow key={`sk-${i}`}>
                  <TableCell className="hidden sm:table-cell">
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-full max-w-md" />
                  </TableCell>
                  <TableCell />
                </TableRow>
              ))}

            {!loading &&
              rows.map((c) => (
                <TableRow key={c.id} className={cn("align-top", !c.is_active && "bg-muted/20")}>
                  <TableCell className="hidden whitespace-nowrap py-3 align-top font-mono text-xs text-emerald-800 sm:table-cell dark:text-emerald-300">
                    <span className={cn(!c.is_active && "text-muted-foreground line-through")}>{c.lc_code}</span>
                  </TableCell>
                  <TableCell className="whitespace-normal py-3 align-top leading-relaxed">
                    <span
                      className={cn(
                        "mb-0.5 block font-mono text-xs text-emerald-800 sm:hidden dark:text-emerald-300",
                        !c.is_active && "text-muted-foreground line-through",
                      )}
                    >
                      {c.lc_code}
                    </span>
                    <span className={cn(!c.is_active && "text-muted-foreground")}>{c.competency_text}</span>
                    {!c.is_active && (
                      <Badge variant="secondary" className="ml-2 align-middle">
                        Retired
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-2 align-top">
                    <div className="flex justify-end gap-0.5 text-muted-foreground">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 hover:text-foreground"
                        aria-label={`Fix a typo in ${c.lc_code}`}
                        title="Fix a typo — a curriculum change is a new entry"
                        onClick={() => {
                          setEditing(c);
                          setEditOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 hover:text-foreground"
                        disabled={busyId !== null}
                        aria-label={`${c.is_active ? "Retire" : "Restore"} ${c.lc_code}`}
                        title={c.is_active ? "Retire — no longer offered to a new TOS" : "Restore"}
                        onClick={() => void toggleRetired(c)}
                      >
                        {c.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}

            {!loading && rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="py-12 text-center">
                  {q ? (
                    <p className="text-sm text-muted-foreground">No competency matches “{search.trim()}”.</p>
                  ) : competencies.length > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Every {gradeLabel} entry is retired. Turn on “Show retired” to see them.
                    </p>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                        <ListChecks className="h-5 w-5" aria-hidden />
                      </span>
                      <div>
                        <p className="font-medium">No {gradeLabel} competencies yet</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Add the first one for {areaName}, or import the list from Excel.
                        </p>
                      </div>
                      <Button size="sm" onClick={() => onAddOpenChange(true)}>
                        <Plus className="mr-1.5 h-4 w-4" /> Add competency
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Edits are for typos only — a TOS already saved keeps the text it was saved with. A curriculum change
        is a new entry; retire the old one.
      </p>

      <CompetencyDialog
        open={addOpen}
        onOpenChange={onAddOpenChange}
        areaId={areaId}
        areaName={areaName}
        areaActive={areaActive}
        gradeLevel={gradeLevel}
        onSaved={saved}
      />
      <CompetencyDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        competency={editing}
        areaId={areaId}
        areaName={areaName}
        areaActive={areaActive}
        gradeLevel={gradeLevel}
        onSaved={saved}
      />
    </div>
  );
}

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Given: fix a typo in it. Omitted: add a new entry. */
  competency?: CatalogueCompetency | null;
  areaId: string;
  areaName: string;
  areaActive: boolean;
  gradeLevel: number;
  onSaved: () => void;
}

/** Add a competency, or fix a typo in one. */
function CompetencyDialog({
  open,
  onOpenChange,
  competency,
  areaId,
  areaName,
  areaActive,
  gradeLevel,
  onSaved,
}: DialogProps) {
  const [lc, setLc] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const editing = !!competency;

  useEffect(() => {
    if (!open) return;
    setLc(competency?.lc_code ?? "");
    setText(competency?.competency_text ?? "");
  }, [open, competency]);

  const valid = !!normalizeLcCode(lc) && !!text.trim();

  const run = async (write: Write, ok: string) => {
    setBusy(true);
    const { error } = await write();
    setBusy(false);
    if (error) {
      toast.error(friendly(error.message));
      return false;
    }
    toast.success(ok);
    onSaved();
    return true;
  };

  const save = async (keepOpen: boolean) => {
    if (!valid || busy) return;
    const ok = editing
      ? await run(
          () =>
            supabase
              .from("sms_competency_catalogue")
              .update({ lc_code: lc, competency_text: text })
              .eq("id", Number(competency.id)),
          "Saved",
        )
      : await run(
          () =>
            supabase.from("sms_competency_catalogue").insert([
              { learning_area_id: Number(areaId), grade_level: gradeLevel, lc_code: lc, competency_text: text },
            ]),
          "Competency added",
        );
    if (!ok) return;
    if (keepOpen) {
      setLc("");
      setText("");
      document.getElementById("cat-lc")?.focus();
    } else onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(false);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>{editing ? `Fix a typo in ${competency.lc_code}` : "Add competency"}</DialogTitle>
            <DialogDescription>
              {areaName} · {catalogueGradeLabel(gradeLevel)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="cat-lc">LC code</Label>
            <Input
              id="cat-lc"
              autoFocus
              value={lc}
              onChange={(e) => setLc(e.target.value)}
              placeholder="e.g. M1NS-Ia-1.1"
              className="font-mono"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-text">Competency</Label>
            <Textarea
              id="cat-text"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="As written in the curriculum guide"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void save(false);
                }
              }}
            />
          </div>

          {editing ? (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              For typos only — a curriculum change is a new entry; retire this one. TOS already saved keep
              their copy.
            </p>
          ) : (
            !areaActive && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                This learning area is retired — entries added here are not offered to a TOS until it is
                restored.
              </p>
            )
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {!editing && (
              <Button type="button" variant="secondary" disabled={!valid || busy} onClick={() => void save(true)}>
                Add &amp; add another
              </Button>
            )}
            <Button type="submit" disabled={!valid || busy}>
              {busy ? "Saving…" : editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
