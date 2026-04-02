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
import { supabase } from "@/lib/supabase/client";
import { EccdScaleScore } from "@/types";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface EccdScaleScoreTableProps {
  domainId: string;
  domainCode: string;
  scaleScores: EccdScaleScore[];
  competencyCount: number;
  onRefresh: () => void;
}

export function EccdScaleScoreTable({
  domainId,
  domainCode,
  scaleScores,
  competencyCount,
  onRefresh,
}: EccdScaleScoreTableProps) {
  // Local state: array of { rawScore, scaleScore } for 0..competencyCount
  const [rows, setRows] = useState<Array<{ rawScore: number; scaleScore: string }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const newRows = [];
    for (let i = 0; i <= competencyCount; i++) {
      const existing = scaleScores.find((s) => s.raw_score === i);
      newRows.push({
        rawScore: i,
        scaleScore: existing ? String(existing.scale_score) : "",
      });
    }
    setRows(newRows);
  }, [domainId, scaleScores, competencyCount]);

  const updateRow = (idx: number, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, scaleScore: value } : r)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Delete existing scale scores for this domain
      await supabase.from("sms_eccd_scale_scores").delete().eq("domain_id", domainId);

      // Insert all rows that have a value
      const inserts = rows
        .filter((r) => r.scaleScore.trim() !== "")
        .map((r) => ({
          domain_id: domainId,
          raw_score: r.rawScore,
          scale_score: Number(r.scaleScore),
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">Scale Score Mapping</CardTitle>
            <CardDescription>
              Map raw scores (0–{competencyCount}) to scale scores for {domainCode}
            </CardDescription>
          </div>
          <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {rows.map((row, idx) => (
            <div key={row.rawScore} className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">
                Raw {row.rawScore}:
              </span>
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
