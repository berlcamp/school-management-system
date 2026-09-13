"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ECCD_AGE_BANDS, eccdReferenceTable } from "@/lib/constants/eccd";
import { supabase } from "@/lib/supabase/client";
import { EccdScaleScore } from "@/types";
import { Download, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface EccdScaleScoreTableProps {
  domainId: string;
  domainCode: string;
  scaleScores: EccdScaleScore[];
  competencyCount: number;
  onRefresh: () => void;
}

/**
 * `null` is the unbanded mapping that predates migration 186 — it applies at any
 * age and is what every existing row is. It stays on the screen so a division
 * that has already entered a mapping can still see and edit it.
 */
type BandKey = string | null;
const ANY_AGE: BandKey = null;

export function EccdScaleScoreTable({
  domainId,
  domainCode,
  scaleScores,
  competencyCount,
  onRefresh,
}: EccdScaleScoreTableProps) {
  const [band, setBand] = useState<BandKey>(ANY_AGE);
  const [rows, setRows] = useState<Array<{ rawScore: number; scaleScore: string }>>([]);
  const [saving, setSaving] = useState(false);

  const matchesBand = useCallback(
    (s: EccdScaleScore) => (band === null ? !s.age_band : s.age_band === band),
    [band],
  );

  useEffect(() => {
    const next = [];
    for (let i = 0; i <= competencyCount; i++) {
      const existing = scaleScores.find((s) => s.raw_score === i && matchesBand(s));
      next.push({ rawScore: i, scaleScore: existing ? String(Number(existing.scale_score)) : "" });
    }
    setRows(next);
  }, [domainId, scaleScores, competencyCount, matchesBand]);

  const updateRow = (idx: number, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, scaleScore: value } : r)));
  };

  /**
   * Fills the grid from DepEd's published table for this band. It writes
   * nothing — the division reviews the figures and presses Save, exactly as
   * migration 132's answer-key prefill works.
   */
  const loadReference = () => {
    if (band === null) return;
    const table = eccdReferenceTable(band, domainCode);
    if (!table) {
      toast.error(`No published table for ${domainCode} at ${band}`);
      return;
    }
    setRows((prev) =>
      prev.map((r) => {
        const value = table[r.rawScore];
        return { ...r, scaleScore: value === undefined || value === null ? "" : String(value) };
      }),
    );
    const highest = table.length - 1;
    toast.success(
      highest < competencyCount
        ? `Loaded. Note the published table stops at raw ${highest}, but this domain has ${competencyCount} items.`
        : "Loaded — review, then Save.",
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Scoped to this band: the delete must not take the other bands with it.
      const del = supabase.from("sms_eccd_scale_scores").delete().eq("domain_id", domainId);
      const { error: delError } = await (band === null
        ? del.is("age_band", null)
        : del.eq("age_band", band));
      if (delError) throw delError;

      const inserts = rows
        .filter((r) => r.scaleScore.trim() !== "")
        .map((r) => ({
          domain_id: domainId,
          raw_score: r.rawScore,
          scale_score: Number(r.scaleScore),
          age_band: band,
        }));

      if (inserts.length > 0) {
        const { error } = await supabase.from("sms_eccd_scale_scores").insert(inserts);
        if (error) throw error;
      }

      toast.success("Scale scores saved");
      onRefresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save scale scores");
    } finally {
      setSaving(false);
    }
  };

  const bandCount = (key: BandKey) =>
    scaleScores.filter((s) => (key === null ? !s.age_band : s.age_band === key)).length;

  const tabs: { key: BandKey; label: string }[] = [
    { key: ANY_AGE, label: "Any age" },
    ...ECCD_AGE_BANDS.map((b) => ({ key: b.id as BandKey, label: b.label })),
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm">Scale Score Mapping</CardTitle>
            <CardDescription>
              Map raw scores (0–{competencyCount}) to scale scores for {domainCode}. DepEd&rsquo;s
              conversion table differs by age band; a band you fill in is used for learners of
              that age, and &ldquo;Any age&rdquo; is the fallback for the rest.
            </CardDescription>
          </div>
          <div className="flex gap-2 shrink-0">
            {band !== null && eccdReferenceTable(band, domainCode) && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={loadReference}>
                <Download className="h-3.5 w-3.5" />
                Load DepEd table
              </Button>
            )}
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-3">
          {tabs.map((t) => {
            const active = t.key === band;
            const filled = bandCount(t.key);
            return (
              <button
                key={t.key ?? "any"}
                type="button"
                onClick={() => setBand(t.key)}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? "border-primary bg-primary/10 font-medium"
                    : "border-transparent bg-muted/50 hover:bg-muted"
                }`}
              >
                {t.label}
                <span className="ml-1.5 text-muted-foreground">{filled || "—"}</span>
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {rows.map((row, idx) => (
            <div key={row.rawScore} className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">Raw {row.rawScore}:</span>
              <Input
                type="number"
                step="0.01"
                className="h-8 flex-1 min-w-0"
                value={row.scaleScore}
                onChange={(e) => updateRow(idx, e.target.value)}
                placeholder="—"
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
