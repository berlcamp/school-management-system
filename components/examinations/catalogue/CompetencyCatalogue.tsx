"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLearningAreas } from "@/hooks/useCatalogue";
import { CATALOGUE_GRADES, catalogueGradeLabel } from "@/lib/constants/questionBank";
import { Upload } from "lucide-react";
import { useState } from "react";
import { CatalogueAreas } from "./CatalogueAreas";
import { CatalogueCompetencies } from "./CatalogueCompetencies";
import { CatalogueImportDialog } from "./CatalogueImportDialog";

/** The division competency catalogue every TOS picks from (migration 195). */
export function CompetencyCatalogue() {
  const { areas, reload } = useLearningAreas(true);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [grade, setGrade] = useState<number>(CATALOGUE_GRADES[1]);
  const [importOpen, setImportOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <CatalogueAreas areas={areas} selectedId={areaId} onSelect={setAreaId} onChanged={reload} />
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-48">
            <Label className="mb-1.5 block">Grade level</Label>
            <Select value={String(grade)} onValueChange={(v) => setGrade(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATALOGUE_GRADES.map((g) => (
                  <SelectItem key={g} value={String(g)}>{catalogueGradeLabel(g)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1.5 h-4 w-4" /> Import from Excel
          </Button>
        </div>
        {areaId ? (
          <CatalogueCompetencies key={`${areaId}-${grade}-${refreshKey}`} areaId={areaId} gradeLevel={grade} />
        ) : (
          <p className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
            Pick a learning area on the left, or import the catalogue from Excel.
          </p>
        )}
      </div>
      <CatalogueImportDialog
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          reload();
          setRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}
