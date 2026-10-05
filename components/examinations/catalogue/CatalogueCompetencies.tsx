"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Archive,
  ArchiveRestore,
  Info,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

interface Props {
  areaId: string;
  areaName: string;
  areaActive: boolean;
  gradeLevel: number;
  /** After any write, so the grade counts can refresh. */
  onChanged: () => void;
}

/** Remounted (via `key`) after an import, which reloads it. */
export function CatalogueCompetencies({
  areaId,
  areaName,
  areaActive,
  gradeLevel,
  onChanged,
}: Props) {
  const { competencies, loading, reload } = useCatalogueCompetencies(
    areaId,
    gradeLevel,
    true,
  );
  const [lc, setLc] = useState("");
  const [text, setText] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editLc, setEditLc] = useState("");
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [showRetired, setShowRetired] = useState(false);

  const run = async (
    fn: () => PromiseLike<{ error: { message: string } | null }>,
    ok: string,
  ) => {
    if (busy) return false;
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) {
      toast.error(
        error.message.includes("duplicate key")
          ? "That LC code already exists for this grade."
          : error.message,
      );
      return false;
    }
    toast.success(ok);
    reload();
    onChanged();
    return true;
  };

  const activeCount = competencies.filter((c) => c.is_active).length;
  const retiredCount = competencies.length - activeCount;
  const q = search.trim().toLowerCase();
  const rows = competencies.filter(
    (c) =>
      (showRetired || c.is_active || String(c.id) === editId) &&
      (!q ||
        c.lc_code.toLowerCase().includes(q) ||
        c.competency_text.toLowerCase().includes(q)),
  );
  const gradeLabel = catalogueGradeLabel(gradeLevel);
  const canAdd = !busy && !!normalizeLcCode(lc) && !!text.trim();

  const add = async () => {
    if (!canAdd) return;
    const ok = await run(
      () =>
        supabase.from("sms_competency_catalogue").insert([
          {
            learning_area_id: Number(areaId),
            grade_level: gradeLevel,
            lc_code: lc,
            competency_text: text,
          },
        ]),
      "Competency added",
    );
    if (ok) {
      setLc("");
      setText("");
    }
  };

  const saveEdit = async (id: string) => {
    if (busy || !normalizeLcCode(editLc) || !editText.trim()) return;
    const ok = await run(
      () =>
        supabase
          .from("sms_competency_catalogue")
          .update({ lc_code: editLc, competency_text: editText })
          .eq("id", Number(id)),
      "Saved",
    );
    if (ok) setEditId(null);
  };

  return (
    <div className="space-y-4">
      {/* Add */}
      <form
        className="rounded-lg border bg-muted/30 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <p className="mb-2 text-sm font-medium">
          Add a competency to {areaName} · {gradeLabel}
        </p>
        <div className="grid gap-2 sm:grid-cols-[11rem_1fr_auto]">
          <div>
            <Label htmlFor="cat-new-lc" className="sr-only">
              LC code
            </Label>
            <Input
              id="cat-new-lc"
              value={lc}
              onChange={(e) => setLc(e.target.value)}
              placeholder="LC code"
              className="font-mono"
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="cat-new-text" className="sr-only">
              Competency
            </Label>
            <Input
              id="cat-new-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Competency, as written in the curriculum guide"
              autoComplete="off"
            />
          </div>
          <Button type="submit" disabled={!canAdd}>
            <Plus className="mr-1.5 h-4 w-4" /> Add
          </Button>
        </div>
        {!areaActive && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            This learning area is retired — entries added here are not offered
            to a TOS until it is restored.
          </p>
        )}
      </form>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {loading ? (
            "Loading…"
          ) : (
            <>
              <span className="font-medium text-foreground">{activeCount}</span>{" "}
              active
              {retiredCount > 0 && <>, {retiredCount} retired</>}
              {q && <> · {rows.length} shown</>}
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-3">
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
              className="h-9 pl-8"
            />
          </div>
          {retiredCount > 0 && (
            <div className="flex items-center gap-2">
              <Switch
                id="cat-show-retired"
                checked={showRetired}
                onCheckedChange={setShowRetired}
              />
              <Label htmlFor="cat-show-retired" className="text-sm font-normal">
                Show retired
              </Label>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="hidden w-44 sm:table-cell">
                LC code
              </TableHead>
              <TableHead>Competency</TableHead>
              <TableHead className="w-28 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 4 }, (_, i) => (
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
              rows.map((c) =>
                editId === String(c.id) ? (
                  <TableRow
                    key={c.id}
                    className="bg-emerald-50/50 align-top hover:bg-emerald-50/50 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/30"
                  >
                    <TableCell
                      colSpan={3}
                      className="whitespace-normal pr-2 align-top"
                    >
                      <div className="grid gap-2 sm:grid-cols-[10.5rem_1fr_auto]">
                        <Input
                          autoFocus
                          value={editLc}
                          onChange={(e) => setEditLc(e.target.value)}
                          aria-label="LC code"
                          className="h-9 font-mono text-xs"
                          onKeyDown={(e) =>
                            e.key === "Escape" && setEditId(null)
                          }
                        />
                        <div>
                          <Textarea
                            rows={2}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            aria-label="Competency"
                            onKeyDown={(e) => {
                              if (e.key === "Escape") setEditId(null);
                              if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                                void saveEdit(String(c.id));
                            }}
                          />
                          <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                            <Info
                              className="mt-0.5 h-3 w-3 shrink-0"
                              aria-hidden
                            />
                            For typos only — a curriculum change is a new entry;
                            retire this one. Ctrl+Enter saves, Esc cancels.
                          </p>
                        </div>
                        <div className="flex gap-1 sm:flex-col sm:items-end">
                          <Button
                            size="sm"
                            className="w-20"
                            disabled={
                              busy ||
                              !normalizeLcCode(editLc) ||
                              !editText.trim()
                            }
                            onClick={() => void saveEdit(String(c.id))}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="w-20"
                            onClick={() => setEditId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow
                    key={c.id}
                    className={cn(
                      "group align-top",
                      !c.is_active && "bg-muted/20",
                    )}
                  >
                    <TableCell className="hidden whitespace-nowrap py-2.5 align-top font-mono text-xs sm:table-cell">
                      <span
                        className={cn(
                          !c.is_active && "text-muted-foreground line-through",
                        )}
                      >
                        {c.lc_code}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-normal py-2.5 align-top leading-relaxed">
                      <span
                        className={cn(
                          "mb-0.5 block font-mono text-xs text-muted-foreground sm:hidden",
                          !c.is_active && "line-through",
                        )}
                      >
                        {c.lc_code}
                      </span>
                      <span
                        className={cn(!c.is_active && "text-muted-foreground")}
                      >
                        {c.competency_text}
                      </span>
                      {!c.is_active && (
                        <Badge
                          variant="secondary"
                          className="ml-2 align-middle"
                        >
                          Retired
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-1.5 align-top">
                      <div className="flex justify-end gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9"
                          aria-label={`Fix a typo in ${c.lc_code}`}
                          title="Fix a typo — a curriculum change is a new entry"
                          onClick={() => {
                            setEditId(String(c.id));
                            setEditLc(c.lc_code);
                            setEditText(c.competency_text);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9"
                          disabled={busy}
                          aria-label={`${c.is_active ? "Retire" : "Restore"} ${c.lc_code}`}
                          title={
                            c.is_active
                              ? "Retire — no longer offered to a new TOS"
                              : "Restore"
                          }
                          onClick={() =>
                            run(
                              () =>
                                supabase
                                  .from("sms_competency_catalogue")
                                  .update({ is_active: !c.is_active })
                                  .eq("id", Number(c.id)),
                              c.is_active
                                ? `Retired ${c.lc_code}`
                                : `Restored ${c.lc_code}`,
                            )
                          }
                        >
                          {c.is_active ? (
                            <Archive className="h-4 w-4" />
                          ) : (
                            <ArchiveRestore className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ),
              )}

            {!loading && rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={3}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {q ? (
                    <>No competency matches “{search.trim()}”.</>
                  ) : competencies.length > 0 ? (
                    <>
                      Every {gradeLabel} entry is retired. Turn on “Show
                      retired” to see them.
                    </>
                  ) : (
                    <>
                      No {gradeLabel} competencies for {areaName} yet. Add one
                      above, or import from Excel.
                    </>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Edits are for typos only — a TOS already saved keeps the text it was
        saved with. A curriculum change is a new entry; retire the old one.
      </p>
    </div>
  );
}
