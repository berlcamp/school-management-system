"use client";

import { Button } from "@/components/ui/button";
import { buildCrlaReport } from "@/lib/assessments/crlaReport";
import { generateCrlaClassRecord } from "@/lib/pdf/generateCrlaClassRecord";
import { generateCrlaClassSummary } from "@/lib/pdf/generateCrlaClassSummary";
import { generateCrlaReadingScoresheet } from "@/lib/pdf/generateCrlaReadingScoresheet";
import { supabase } from "@/lib/supabase/client";
import { fetchSchoolSettings } from "@/lib/utils/schoolSettings";
import { ClipboardList, FileSpreadsheet, Loader2, Table2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import type { AdviserSection } from "../page";

type Kind = "scoresheet" | "record" | "summary";

interface Props {
  section: AdviserSection | null;
  schoolYear: string;
  phase: string;
  language: string;
  teacherName: string;
}

/**
 * The three DepEd CRLA workbook printables. Each rebuilds the section's report
 * from the database rather than from the on-screen table, so Part 1 and Part 2
 * are always combined regardless of which tab the adviser is on.
 */
export function CrlaPrintBar({
  section,
  schoolYear,
  phase,
  language,
  teacherName,
}: Props) {
  const [busy, setBusy] = useState<Kind | null>(null);

  const run = async (kind: Kind) => {
    if (!section || busy) return;
    setBusy(kind);
    try {
      const [report, { data: school }, settings] = await Promise.all([
        buildCrlaReport({
          section: {
            id: section.id,
            name: section.name,
            gradeLevel: section.grade_level,
            schoolId: section.school_id,
            teacherName,
          },
          schoolYear,
          phase,
          language,
        }),
        supabase
          .from("sms_schools")
          .select("name, school_id")
          .eq("id", Number(section.school_id))
          .single(),
        fetchSchoolSettings(section.school_id),
      ]);

      if (report.learners.length === 0) {
        toast.error("This section has no enrolled learners.");
        return;
      }

      const common = {
        report,
        schoolName: (school?.name as string) ?? section.school_name ?? "",
        schoolIdCode: (school?.school_id as string | null) ?? null,
        teacherName,
        language,
        phase,
        schoolYear,
        principalName: settings.principal_name,
        principalTitle: settings.principal_title,
      };

      if (kind === "scoresheet") await generateCrlaReadingScoresheet(common);
      else if (kind === "record") await generateCrlaClassRecord(common);
      else await generateCrlaClassSummary(common);
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate the printable.");
    } finally {
      setBusy(null);
    }
  };

  const icon = (kind: Kind, Fallback: typeof Table2) =>
    busy === kind ? (
      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
    ) : (
      <Fallback className="h-4 w-4 mr-1" />
    );

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={!section || busy !== null}
        onClick={() => run("scoresheet")}
      >
        {icon("scoresheet", Table2)}
        Reading Scoresheet
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!section || busy !== null}
        onClick={() => run("record")}
      >
        {icon("record", ClipboardList)}
        Class Record
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!section || busy !== null}
        onClick={() => run("summary")}
      >
        {icon("summary", FileSpreadsheet)}
        Class Summary
      </Button>
    </>
  );
}
