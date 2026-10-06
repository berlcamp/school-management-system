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
import { BookOpen, Check, ChevronsUpDown, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface PickerProps {
  areas: LearningArea[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

/** Searchable learning-area picker; retired areas are listed apart. */
export function AreaPicker({ areas, loading, selectedId, onSelect, onCreate }: PickerProps) {
  const [open, setOpen] = useState(false);
  const selected = areas.find((a) => String(a.id) === String(selectedId)) ?? null;
  const active = areas.filter((a) => a.is_active);
  const retired = areas.filter((a) => !a.is_active);

  const item = (a: LearningArea) => (
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
      {a.name}
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Learning area"
          className="h-10 w-full justify-between gap-2 px-3 font-normal sm:w-72"
        >
          <span className="flex min-w-0 items-center gap-2">
            <BookOpen className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected?.name ?? (loading ? "Loading…" : "Choose a learning area")}
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
            {active.length > 0 && <CommandGroup>{active.map(item)}</CommandGroup>}
            {retired.length > 0 && <CommandGroup heading="Retired">{retired.map(item)}</CommandGroup>}
            <CommandSeparator />
            <CommandGroup>
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
