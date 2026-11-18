"use client";

// "Offered in" for one subject of a Senior High section (migration 235).
// Whole year (no row) or some terms only; a term-only subject's final grade is
// its offered terms. Saving also narrows the subject's time blocks in this
// section to those terms — the database refuses a block that would be left
// with none, and refuses dropping a term that already holds grades.

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";
import { normaliseOfferedTerms } from "@/lib/utils/sectionOfferings";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface OfferedTermsControlProps {
  sectionId: string;
  subjectId: string;
  /** The section's term numbers, e.g. [1, 2, 3]. */
  periods: number[];
  /** Current offering; null = the whole year. */
  offered: number[] | null;
  canEdit: boolean;
  onSaved: (terms: number[] | null) => void;
}

const termList = (terms: number[]) => terms.map((t) => `Term ${t}`).join(" and ");

export function OfferedTermsControl({
  sectionId,
  subjectId,
  periods,
  offered,
  canEdit,
  onSaved,
}: OfferedTermsControlProps) {
  const current = offered ?? periods;
  const [picked, setPicked] = useState<number[]>(current);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPicked(offered ?? periods);
  }, [offered, periods]);

  const dirty =
    [...picked].sort().join(",") !== [...current].sort().join(",");

  if (!canEdit) {
    return (
      <p className="text-xs text-muted-foreground">
        Offered in: {offered ? `${termList(offered)} only` : "Whole year"}
      </p>
    );
  }

  const toggle = (term: number) =>
    setPicked((prev) =>
      prev.includes(term) ? prev.filter((t) => t !== term) : [...prev, term],
    );

  const save = async () => {
    if (picked.length === 0) {
      toast.error("Pick at least one term.");
      return;
    }
    const terms = normaliseOfferedTerms(picked, periods.length);
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("save_section_subject_terms", {
        p_section_id: Number(sectionId),
        p_subject_id: Number(subjectId),
        p_terms: terms,
      });
      if (error) throw new Error(error.message);
      const result = data as { terms: number[] | null; narrowed_schedules: number };
      const narrowed = result.narrowed_schedules;
      toast.success(
        result.terms
          ? `Offered in ${termList(result.terms)} only${
              narrowed > 0
                ? ` — ${narrowed} time block${narrowed === 1 ? "" : "s"} narrowed.`
                : "."
            }`
          : "Offered the whole year.",
      );
      onSaved(result.terms);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the offered terms");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">Offered in:</span>
      {periods.map((term) => {
        const on = picked.includes(term);
        return (
          <button
            key={term}
            type="button"
            aria-pressed={on}
            disabled={saving}
            onClick={() => toggle(term)}
            className={`rounded-full px-2 py-0.5 ring-1 transition-colors ${
              on
                ? "bg-primary text-primary-foreground ring-primary"
                : "bg-background text-muted-foreground ring-border hover:bg-muted"
            }`}
          >
            Term {term}
          </button>
        );
      })}
      {picked.length === periods.length && (
        <span className="text-muted-foreground">(whole year)</span>
      )}
      {dirty && (
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
        </Button>
      )}
    </div>
  );
}
