"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase/client";
import type { LearningArea } from "@/types";
import { useState } from "react";
import toast from "react-hot-toast";

interface Props {
  areas: LearningArea[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}

export function CatalogueAreas({ areas, selectedId, onSelect, onChanged }: Props) {
  const [newName, setNewName] = useState("");
  const [rename, setRename] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = areas.find((a) => String(a.id) === String(selectedId)) ?? null;

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
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

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">Learning areas</p>
      <div className="max-h-[50vh] space-y-1 overflow-y-auto">
        {areas.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => {
              onSelect(String(a.id));
              setRename(a.name);
            }}
            className={`w-full rounded px-2 py-1.5 text-left text-sm ${
              String(a.id) === String(selectedId) ? "bg-primary/10 font-medium" : "hover:bg-muted"
            } ${a.is_active ? "" : "text-muted-foreground line-through"}`}
          >
            {a.name}
          </button>
        ))}
        {areas.length === 0 && <p className="text-xs text-muted-foreground">No learning areas yet.</p>}
      </div>
      <div className="flex gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New learning area" />
        <Button
          size="sm"
          disabled={busy || !newName.trim()}
          onClick={async () => {
            const ok = await run(
              () => supabase.from("sms_learning_areas").insert([{ name: newName.trim() }]),
              "Learning area added",
            );
            if (ok) setNewName("");
          }}
        >
          Add
        </Button>
      </div>
      {selected && (
        <div className="space-y-2 rounded border p-2">
          <Input value={rename} onChange={(e) => setRename(e.target.value)} />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !rename.trim() || rename.trim() === selected.name}
              onClick={() =>
                run(() => supabase.from("sms_learning_areas").update({ name: rename.trim() }).eq("id", Number(selected.id)), "Renamed")
              }
            >
              Rename
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(
                  () => supabase.from("sms_learning_areas").update({ is_active: !selected.is_active }).eq("id", Number(selected.id)),
                  selected.is_active ? "Retired" : "Restored",
                )
              }
            >
              {selected.is_active ? "Retire" : "Restore"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Renaming changes the subject printed on TOS saved from now on; TOS already saved keep their copy.
          </p>
        </div>
      )}
    </div>
  );
}
