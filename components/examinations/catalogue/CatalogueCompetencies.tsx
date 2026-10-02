"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCatalogueCompetencies } from "@/hooks/useCatalogue";
import { supabase } from "@/lib/supabase/client";
import { normalizeLcCode } from "@/lib/utils/questionBank";
import { useState } from "react";
import toast from "react-hot-toast";

interface Props {
  areaId: string;
  gradeLevel: number;
}

/** Remounted (via `key`) after an import, which reloads it. */
export function CatalogueCompetencies({ areaId, gradeLevel }: Props) {
  const { competencies, loading, reload } = useCatalogueCompetencies(areaId, gradeLevel, true);
  const [lc, setLc] = useState("");
  const [text, setText] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editLc, setEditLc] = useState("");
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    if (busy) return false;
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) {
      toast.error(error.message.includes("duplicate key") ? "That LC code already exists for this grade." : error.message);
      return false;
    }
    toast.success(ok);
    reload();
    return true;
  };

  return (
    <div className="space-y-3">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="w-40 py-1">LC code</th>
              <th className="py-1">Competency</th>
              <th className="w-44 py-1" />
            </tr>
          </thead>
          <tbody>
            {competencies.map((c) =>
              editId === String(c.id) ? (
                <tr key={c.id} className="border-b align-top">
                  <td className="py-1 pr-2"><Input value={editLc} onChange={(e) => setEditLc(e.target.value)} /></td>
                  <td className="py-1 pr-2"><Textarea rows={2} value={editText} onChange={(e) => setEditText(e.target.value)} /></td>
                  <td className="space-x-1 py-1">
                    <Button
                      size="sm"
                      disabled={busy || !normalizeLcCode(editLc) || !editText.trim()}
                      onClick={async () => {
                        const ok = await run(
                          () => supabase.from("sms_competency_catalogue")
                            .update({ lc_code: editLc, competency_text: editText })
                            .eq("id", Number(c.id)),
                          "Saved",
                        );
                        if (ok) setEditId(null);
                      }}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                  </td>
                </tr>
              ) : (
                <tr key={c.id} className={`border-b align-top ${c.is_active ? "" : "text-muted-foreground"}`}>
                  <td className="py-1.5 pr-2 font-mono text-xs">{c.lc_code}</td>
                  <td className="py-1.5 pr-2">{c.competency_text}{!c.is_active && " (retired)"}</td>
                  <td className="space-x-1 py-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Fix a typo — a curriculum change is a new entry"
                      onClick={() => {
                        setEditId(String(c.id));
                        setEditLc(c.lc_code);
                        setEditText(c.competency_text);
                      }}
                    >
                      Fix typo
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => supabase.from("sms_competency_catalogue").update({ is_active: !c.is_active }).eq("id", Number(c.id)),
                          c.is_active ? "Retired" : "Restored",
                        )
                      }
                    >
                      {c.is_active ? "Retire" : "Restore"}
                    </Button>
                  </td>
                </tr>
              ),
            )}
            {competencies.length === 0 && (
              <tr><td colSpan={3} className="py-4 text-center text-muted-foreground">No competencies for this grade yet.</td></tr>
            )}
          </tbody>
        </table>
      )}
      <div className="grid gap-2 rounded border p-2 sm:grid-cols-[10rem_1fr_auto]">
        <Input value={lc} onChange={(e) => setLc(e.target.value)} placeholder="LC code" />
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Competency" />
        <Button
          size="sm"
          disabled={busy || !normalizeLcCode(lc) || !text.trim()}
          onClick={async () => {
            const ok = await run(
              () => supabase.from("sms_competency_catalogue").insert([
                { learning_area_id: Number(areaId), grade_level: gradeLevel, lc_code: lc, competency_text: text },
              ]),
              "Competency added",
            );
            if (ok) {
              setLc("");
              setText("");
            }
          }}
        >
          Add
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Edits are for typos only — a TOS already saved keeps the text it was saved with. A curriculum change is a new entry; retire the old one.
      </p>
    </div>
  );
}
