"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { LearningArea } from "@/types";
import { Archive, ArchiveRestore, Check, MoreHorizontal, Pencil, Plus, Search, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import toast from "react-hot-toast";

type Run = (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => Promise<boolean>;

function useAreaWrite(onChanged: () => void): [Run, boolean] {
  const [busy, setBusy] = useState(false);
  const run: Run = async (fn, ok) => {
    if (busy) return false;
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) {
      toast.error(error.message.includes("uq_sms_learning_areas_name") ? "That learning area already exists." : error.message);
      return false;
    }
    toast.success(ok);
    onChanged();
    return true;
  };
  return [run, busy];
}

interface Props {
  areas: LearningArea[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}

/** Left rail: pick a learning area, or add one. */
export function CatalogueAreas({ areas, loading, selectedId, onSelect, onChanged }: Props) {
  const [run, busy] = useAreaWrite(onChanged);
  const [newName, setNewName] = useState("");
  const [filter, setFilter] = useState("");

  const q = filter.trim().toLowerCase();
  const shown = q ? areas.filter((a) => a.name.toLowerCase().includes(q)) : areas;
  const active = shown.filter((a) => a.is_active);
  const retired = shown.filter((a) => !a.is_active);

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    const ok = await run(() => supabase.from("sms_learning_areas").insert([{ name }]), "Learning area added");
    if (ok) setNewName("");
  };

  const item = (a: LearningArea) => {
    const isSelected = String(a.id) === String(selectedId);
    return (
      <li key={a.id}>
        <button
          type="button"
          aria-current={isSelected ? "true" : undefined}
          onClick={() => onSelect(String(a.id))}
          className={cn(
            "flex min-h-9 w-full items-center rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isSelected
              ? "bg-emerald-50 font-medium text-emerald-900 shadow-[inset_3px_0_0] shadow-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-100 dark:shadow-emerald-500"
              : "hover:bg-muted",
            !a.is_active && !isSelected && "text-muted-foreground",
          )}
        >
          {a.name}
        </button>
      </li>
    );
  };

  return (
    <aside className="flex flex-col gap-3 rounded-lg border bg-background p-3 lg:sticky lg:top-4 lg:self-start">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">Learning areas</h2>
        <span className="text-xs tabular-nums text-muted-foreground">{areas.filter((a) => a.is_active).length}</span>
      </div>

      {/* Below lg the rail stacks above the list, so a long column of areas would
          push the competencies off-screen; a picker keeps them in reach. */}
      <div className="lg:hidden">
        <Select value={selectedId ?? undefined} onValueChange={onSelect} disabled={areas.length === 0}>
          <SelectTrigger aria-label="Learning area" className="h-10 w-full">
            <SelectValue placeholder={loading ? "Loading…" : "Choose a learning area"} />
          </SelectTrigger>
          <SelectContent>
            {areas.some((a) => a.is_active) && (
              <SelectGroup>
                {areas.filter((a) => a.is_active).map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {areas.some((a) => !a.is_active) && (
              <SelectGroup>
                <SelectLabel>Retired</SelectLabel>
                {areas.filter((a) => !a.is_active).map((a) => (
                  <SelectItem key={a.id} value={String(a.id)} className="text-muted-foreground">
                    {a.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
      </div>

      {areas.length > 8 && (
        <div className="relative hidden lg:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter areas"
            aria-label="Filter learning areas"
            className="h-9 pl-8"
          />
        </div>
      )}

      <div className="hidden overflow-y-auto lg:block lg:max-h-[55vh]">
        {loading && areas.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">Loading…</p>
        ) : (
          <>
            <ul className="space-y-0.5">{active.map(item)}</ul>
            {retired.length > 0 && (
              <>
                <p className="mt-3 px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Retired
                </p>
                <ul className="space-y-0.5">{retired.map(item)}</ul>
              </>
            )}
            {shown.length === 0 && (
              <p className="px-1 py-2 text-xs text-muted-foreground">
                {areas.length === 0 ? "No learning areas yet." : "No area matches that filter."}
              </p>
            )}
          </>
        )}
      </div>

      <form
        className="flex gap-2 border-t pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New learning area"
          aria-label="New learning area name"
          className="h-9"
        />
        <Button type="submit" size="sm" className="h-9 shrink-0" disabled={busy || !newName.trim()}>
          <Plus className="h-4 w-4" />
          <span className="sr-only sm:not-sr-only sm:ml-1">Add</span>
        </Button>
      </form>
    </aside>
  );
}

/** Title of the selected learning area, with rename and retire / restore. */
export function CatalogueAreaHeader({
  area,
  onChanged,
  action,
}: {
  area: LearningArea;
  onChanged: () => void;
  action?: ReactNode;
}) {
  const [run, busy] = useAreaWrite(onChanged);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(area.name);
  // Rename is picked from the menu; keep focus in the name field instead of
  // letting the menu hand it back to its trigger as it closes.
  const renaming = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);

  const save = async () => {
    const next = name.trim();
    if (!next || next === area.name) return setEditing(false);
    const ok = await run(
      () => supabase.from("sms_learning_areas").update({ name: next }).eq("id", Number(area.id)),
      "Renamed",
    );
    if (ok) setEditing(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              className="flex max-w-lg items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <Input
                ref={nameInput}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setName(area.name);
                    setEditing(false);
                  }
                }}
                aria-label="Learning area name"
                className="h-9 text-base font-semibold"
              />
              <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={busy || !name.trim()} aria-label="Save name">
                <Check className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-9 w-9 shrink-0"
                aria-label="Cancel rename"
                onClick={() => {
                  setName(area.name);
                  setEditing(false);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold leading-9">{area.name}</h2>
              {!area.is_active && <Badge variant="secondary">Retired</Badge>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {action}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" disabled={busy} aria-label={`More actions for ${area.name}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48"
              onCloseAutoFocus={(e) => {
                if (!renaming.current) return;
                renaming.current = false;
                e.preventDefault();
                nameInput.current?.focus();
                nameInput.current?.select();
              }}
            >
              <DropdownMenuItem
                disabled={editing}
                onSelect={() => {
                  renaming.current = true;
                  setName(area.name);
                  setEditing(true);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  void run(
                    () => supabase.from("sms_learning_areas").update({ is_active: !area.is_active }).eq("id", Number(area.id)),
                    area.is_active ? "Learning area retired" : "Learning area restored",
                  )
                }
              >
                {area.is_active ? (
                  <><Archive className="mr-2 h-4 w-4" /> Retire area</>
                ) : (
                  <><ArchiveRestore className="mr-2 h-4 w-4" /> Restore area</>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {editing ? (
        <p className="text-xs text-muted-foreground">
          Renaming changes the subject printed on TOS saved from now on; TOS already saved keep their copy.
        </p>
      ) : (
        !area.is_active && (
          <p className="text-xs text-muted-foreground">
            Retired: new TOS cannot pick this learning area. TOS already saved are unaffected.
          </p>
        )
      )}
    </div>
  );
}
