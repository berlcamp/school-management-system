"use client";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase/client";
import { fetchTermDateRows, type TermDatesRow } from "@/lib/utils/termDates";
import { CalendarRange } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

/**
 * Term dates (migration 205): the first day of Terms 2 and 3 for the school
 * year. The Grade 1 card prints its attendance record per term, and the issued
 * workbook splits September across Terms 1 and 2 because the boundary falls
 * inside it — this is what lets the card do the same. A school's own dates
 * take precedence over the division's.
 *
 * A school-level user edits the school's row; a division user with no school
 * edits the division-wide row. RLS (125's shape) is what actually decides.
 */
export function TermDatesCard({
  schoolId,
  canManageDivision,
  schoolYear,
  createdBy,
}: {
  schoolId: string | null;
  canManageDivision: boolean;
  schoolYear: string;
  createdBy: number | string | null | undefined;
}) {
  const scope: "school" | "division" | null =
    schoolId != null ? "school" : canManageDivision ? "division" : null;

  const [rows, setRows] = useState<{ school: TermDatesRow | null; division: TermDatesRow | null }>({
    school: null,
    division: null,
  });
  const [term2, setTerm2] = useState("");
  const [term3, setTerm3] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const own = scope === "school" ? rows.school : scope === "division" ? rows.division : null;

  const load = useCallback(async () => {
    const result = await fetchTermDateRows(schoolId, schoolYear);
    if (!isMounted.current) return;
    setRows(result);
    const mine = scope === "school" ? result.school : result.division;
    setTerm2(mine?.term2_start ?? "");
    setTerm3(mine?.term3_start ?? "");
  }, [schoolId, schoolYear, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!scope) return null;

  const [startYear, endYear] = schoolYear.split("-");
  const minDate = `${startYear}-06-01`;
  const maxDate = `${endYear}-05-31`;
  const dirty = term2 !== (own?.term2_start ?? "") || term3 !== (own?.term3_start ?? "");

  const save = async () => {
    if (!term2 || !term3) {
      toast.error("Enter the first day of both Term 2 and Term 3.");
      return;
    }
    if (term3 <= term2) {
      toast.error("Term 3 must begin after Term 2.");
      return;
    }
    if (term2 < minDate || term3 > maxDate) {
      toast.error(`Both dates must fall within S.Y. ${schoolYear}.`);
      return;
    }
    setSaving(true);
    const { error } = own
      ? await supabase
          .from("sms_school_term_dates")
          .update({ term2_start: term2, term3_start: term3 })
          .eq("id", own.id)
      : await supabase.from("sms_school_term_dates").insert({
          school_id: scope === "school" ? Number(schoolId) : null,
          school_year: schoolYear,
          term2_start: term2,
          term3_start: term3,
          created_by: createdBy ?? null,
        });
    if (!isMounted.current) return;
    setSaving(false);
    if (error) {
      console.error("Failed to save term dates:", error);
      toast.error("Failed to save the term dates. Please try again.");
      return;
    }
    toast.success("Term dates saved.");
    void load();
  };

  const clear = async () => {
    if (!own) return;
    setSaving(true);
    const { error } = await supabase.from("sms_school_term_dates").delete().eq("id", own.id);
    if (!isMounted.current) return;
    setSaving(false);
    setConfirmClear(false);
    if (error) {
      console.error("Failed to clear term dates:", error);
      toast.error("Failed to clear the term dates. Please try again.");
      return;
    }
    toast.success("Term dates cleared.");
    void load();
  };

  const inherited = scope === "school" && !rows.school ? rows.division : null;

  return (
    <Card className="mb-6">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">
            Term dates{scope === "division" ? " — division-wide" : ""}
          </CardTitle>
        </div>
        <CardDescription>
          The first day of Terms 2 and 3. The Grade 1 progress card prints attendance per term, and
          a month a term begins in — usually September — is printed on two rows, one per term.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {inherited && (
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Using the division&rsquo;s dates: Term 2 from {inherited.term2_start}, Term 3 from{" "}
            {inherited.term3_start}. Enter dates below only if this school&rsquo;s differ.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="term2-start">Term 2 begins</Label>
            <Input
              id="term2-start"
              type="date"
              min={minDate}
              max={maxDate}
              value={term2}
              onChange={(e) => setTerm2(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="term3-start">Term 3 begins</Label>
            <Input
              id="term3-start"
              type="date"
              min={minDate}
              max={maxDate}
              value={term3}
              onChange={(e) => setTerm3(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {own && (
            <Button variant="outline" size="sm" disabled={saving} onClick={() => setConfirmClear(true)}>
              Clear
            </Button>
          )}
          <Button size="sm" disabled={saving || !dirty} onClick={save}>
            {saving ? "Saving…" : "Save term dates"}
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear the term dates?"
        description={
          scope === "school" && rows.division
            ? "This school will use the division's term dates again."
            : "The Grade 1 card will print each month once, with September under Term 1."
        }
        confirmText="Clear"
        variant="destructive"
        loading={saving}
        onConfirm={clear}
      />
    </Card>
  );
}
