"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import type { LearningArea } from "@/types";
import { Layers, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areas: LearningArea[];
  onChanged: () => void;
}

/**
 * Learning area groups (migration 219): a group such as TLE holds no
 * competencies; a TOS written for it picks from every member, so a school
 * teaching ICT and AFA / FCS / IA as one subject writes one TOS for both.
 */
export function AreaGroupsDialog({ open, onOpenChange, areas, onChanged }: Props) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setNewName("");
  }, [open]);

  const groups = areas.filter((a) => a.is_group);
  const ungrouped = areas.filter((a) => !a.is_group && a.group_id == null && a.is_active);
  const membersOf = (g: LearningArea) => areas.filter((a) => a.group_id != null && String(a.group_id) === String(g.id));

  const run = async (op: PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true);
    const { error } = await op;
    setBusy(false);
    if (error) {
      toast.error(error.message.includes("uq_sms_learning_areas_name") ? "That name is already a learning area." : error.message);
      return false;
    }
    toast.success(ok);
    onChanged();
    return true;
  };

  const setGroup = (area: LearningArea, groupId: string | null) =>
    run(
      supabase.from("sms_learning_areas").update({ group_id: groupId == null ? null : Number(groupId) }).eq("id", Number(area.id)),
      groupId == null ? `${area.name} removed from the group` : `${area.name} added to the group`,
    );

  const createGroup = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    if (await run(supabase.from("sms_learning_areas").insert([{ name, is_group: true }]), "Group added")) setNewName("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Learning area groups</DialogTitle>
          <DialogDescription>
            A TOS written for a group can pick competencies from every learning area in it, e.g. one TLE
            exam covering ICT and AFA / FCS / IA. The areas keep their own competencies and Least Learned
            lists.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {groups.length === 0 && <p className="text-sm text-muted-foreground">No groups yet.</p>}
          {groups.map((g) => {
            const members = membersOf(g);
            return (
              <div key={g.id} className="space-y-2 rounded-lg border p-3">
                <p className="flex items-center gap-2 font-medium">
                  <Layers className="h-4 w-4 text-emerald-600" aria-hidden />
                  {g.name}
                  {!g.is_active && <span className="text-xs font-normal text-muted-foreground">(retired)</span>}
                </p>
                {members.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No learning areas in this group yet.</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {members.map((m) => (
                      <li key={m.id} className="flex items-center gap-1 rounded-full bg-muted py-0.5 pl-2.5 pr-1 text-xs">
                        {m.name}
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`Remove ${m.name} from ${g.name}`}
                          className="rounded-full p-0.5 hover:bg-background disabled:opacity-50"
                          onClick={() => void setGroup(m, null)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {ungrouped.length > 0 && (
                  <Select value="" onValueChange={(id) => {
                    const a = ungrouped.find((x) => String(x.id) === id);
                    if (a) void setGroup(a, String(g.id));
                  }} disabled={busy}>
                    <SelectTrigger className="h-8 text-xs" aria-label={`Add a learning area to ${g.name}`}>
                      <SelectValue placeholder="Add a learning area…" />
                    </SelectTrigger>
                    <SelectContent>
                      {ungrouped.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            );
          })}

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void createGroup();
            }}
          >
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New group, e.g. TLE"
              aria-label="New group name"
              autoComplete="off"
            />
            <Button type="submit" variant="outline" disabled={busy || !newName.trim()}>
              <Plus className="mr-1.5 h-4 w-4" /> Add group
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
