"use client";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { LearningArea } from "@/types";
import { BookOpen, Check, ChevronsUpDown, ListPlus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface PickerProps {
  areas: LearningArea[];
  loading: boolean;
  disabled?: boolean;
  /** Entries per learning area at the chosen grade; an area absent here has none. */
  counts: Record<string, { active: number; retired: number }>;
  /** The chosen grade, for the picker's wording. */
  gradeLabel: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

/**
 * Searchable learning-area picker, narrowed to the areas that have competencies
 * at the chosen grade. The rest stay one click away, so a grade's first
 * competency can still be added to an existing area.
 */
export function AreaPicker({
  areas,
  loading,
  disabled,
  counts,
  gradeLabel,
  selectedId,
  onSelect,
  onCreate,
}: PickerProps) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const selected = areas.find((a) => String(a.id) === String(selectedId)) ?? null;
  // The selected area stays listed even with no entries yet (e.g. one just created).
  const atGrade = areas.filter((a) => counts[String(a.id)] || String(a.id) === String(selectedId));
  const others = areas.filter((a) => !atGrade.includes(a));
  const active = atGrade.filter((a) => a.is_active);
  const retired = atGrade.filter((a) => !a.is_active);

  useEffect(() => {
    if (!open) setShowAll(false);
  }, [open]);

  const item = (a: LearningArea) => {
    const n = counts[String(a.id)]?.active ?? 0;
    return (
      <CommandItem
        key={a.id}
        value={`${a.name} ${a.id}`}
        onSelect={() => {
          onSelect(String(a.id));
          setOpen(false);
        }}
        className={cn(!a.is_active && "text-muted-foreground")}
      >
        <Check className={cn("mr-2 h-4 w-4", String(a.id) === String(selectedId) ? "opacity-100" : "opacity-0")} />
        <span className="min-w-0 flex-1 truncate">{a.name}</span>
        {n > 0 && (
          <span className="ml-2 rounded-full bg-emerald-100 px-1.5 text-xs tabular-nums text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
            {n}
          </span>
        )}
      </CommandItem>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Learning area"
          disabled={disabled}
          className="h-10 w-full justify-between gap-2 px-3 font-normal sm:w-72"
        >
          <span className="flex min-w-0 items-center gap-2">
            <BookOpen className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {disabled
                ? "Choose a grade level first"
                : (selected?.name ?? (loading ? "Loading…" : "Choose a learning area"))}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Find a learning area…" />
          <CommandList>
            <CommandEmpty>No learning area matches.</CommandEmpty>
            {atGrade.length === 0 && !loading && (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                No learning area has {gradeLabel} competencies yet.
              </p>
            )}
            {active.length > 0 && <CommandGroup heading={gradeLabel}>{active.map(item)}</CommandGroup>}
            {retired.length > 0 && <CommandGroup heading="Retired">{retired.map(item)}</CommandGroup>}
            {showAll && others.length > 0 && (
              <CommandGroup heading={`No ${gradeLabel} competencies yet`}>{others.map(item)}</CommandGroup>
            )}
            <CommandSeparator />
            <CommandGroup>
              {!showAll && others.length > 0 && (
                <CommandItem value="__show_other_learning_areas__" onSelect={() => setShowAll(true)}>
                  <ListPlus className="mr-2 h-4 w-4" /> Show other learning areas ({others.length})
                </CommandItem>
              )}
              <CommandItem
                value="__new_learning_area__"
                onSelect={() => {
                  setOpen(false);
                  onCreate();
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> New learning area
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Given: rename that area. Omitted: create a new one. */
  area?: LearningArea | null;
  /** Called with the saved area's id (null if the response carried none). */
  onSaved: (id: string | null) => void;
}

/** Create or rename a learning area. */
export function AreaNameDialog({ open, onOpenChange, area, onSaved }: DialogProps) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const renaming = !!area;

  useEffect(() => {
    if (open) setName(area?.name ?? "");
  }, [open, area]);

  const trimmed = name.trim();
  const unchanged = renaming && trimmed === area?.name;

  const save = async () => {
    if (!trimmed || busy) return;
    if (unchanged) return onOpenChange(false);
    setBusy(true);
    const { data, error } = renaming
      ? await supabase.from("sms_learning_areas").update({ name: trimmed }).eq("id", Number(area.id)).select("id").single()
      : await supabase.from("sms_learning_areas").insert([{ name: trimmed }]).select("id").single();
    setBusy(false);
    if (error) {
      toast.error(error.message.includes("uq_sms_learning_areas_name") ? "That learning area already exists." : error.message);
      return;
    }
    toast.success(renaming ? "Renamed" : "Learning area added");
    const id = (data as { id?: number | string } | null)?.id;
    onSaved(id == null ? null : String(id));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>{renaming ? "Rename learning area" : "New learning area"}</DialogTitle>
            <DialogDescription>
              {renaming
                ? "The new name prints on TOS saved from now on. TOS already saved keep their copy."
                : "Add the subject a TOS can be written for, then add its competencies grade by grade."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="area-name">Name</Label>
            <Input
              id="area-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mathematics"
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !trimmed}>
              {busy ? "Saving…" : renaming ? "Save name" : "Add learning area"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
