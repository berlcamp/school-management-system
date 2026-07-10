"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ASSESSMENT_PHASES,
  CRLA_GRADES,
  CRLA_LANGUAGES,
  getGradeLevelLabel,
  PABASA_GRADES,
  PABASA_LANGUAGES,
  PABASA_LEVELS,
  pabasaPhaseLabel,
  philIriPhaseLabel,
  PHILIRI_GRADES,
  PHILIRI_LANGUAGES,
  PHILIRI_SCREENING_LEVELS,
  RMA_GRADES,
} from "@/lib/constants";
import { generateAssessmentSummary } from "@/lib/pdf/generateAssessmentSummary";
import { supabase } from "@/lib/supabase/client";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { BarChart3, Loader2, Printer } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

type AssessmentType = "CRLA" | "PHIL_IRI" | "RMA" | "PABASA";

interface SchoolRow {
  schoolName: string;
  counts: Record<string, number>;
  total: number;
}

const PHILIRI_ORDER: readonly string[] = PHILIRI_SCREENING_LEVELS;

export default function Page() {
  const [type, setType] = useState<AssessmentType>("CRLA");
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [phase, setPhase] = useState("BoSY");
  const [grade, setGrade] = useState("all");
  const [language, setLanguage] = useState("all");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SchoolRow[]>([]);
  const [labels, setLabels] = useState<string[]>([]);

  const grades = useMemo(() => {
    if (type === "CRLA") return CRLA_GRADES;
    if (type === "PHIL_IRI") return PHILIRI_GRADES;
    if (type === "PABASA") return PABASA_GRADES;
    return RMA_GRADES;
  }, [type]);

  const languages =
    type === "CRLA"
      ? CRLA_LANGUAGES
      : type === "PABASA"
        ? PABASA_LANGUAGES
        : PHILIRI_LANGUAGES;
  const hasLanguage =
    type === "CRLA" || type === "PHIL_IRI" || type === "PABASA";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: schools } = await supabase
        .from("sms_schools")
        .select("id, name");
      const schoolNames: Record<string, string> = {};
      (schools || []).forEach((s) => {
        schoolNames[String(s.id)] = s.name;
      });

      // PABASA has no material table: grade_level and language live on the
      // record, and the reading-readiness level is the label. The other three
      // assessments read the label off the record but join their material for
      // the grade/language filters.
      let labelField: string;
      let query;
      if (type === "PABASA") {
        labelField = "reading_level";
        let q = supabase
          .from("sms_pabasa_records")
          .select("school_id, reading_level, grade_level, language")
          .eq("school_year", schoolYear)
          .eq("phase", phase);
        if (grade !== "all") q = q.eq("grade_level", Number(grade));
        if (language !== "all") q = q.eq("language", language);
        query = q;
      } else {
        const config = {
          CRLA: {
            table: "sms_crla_records",
            labelField: "profile_label",
            materialTable: "sms_crla_materials",
          },
          PHIL_IRI: {
            table: "sms_philiri_records",
            labelField: "screening_result",
            materialTable: "sms_philiri_materials",
          },
          RMA: {
            table: "sms_rma_records",
            labelField: "mastery_label",
            materialTable: "sms_rma_materials",
          },
        }[type];
        labelField = config.labelField;

        // RMA materials have no `language` column — only embed it for CRLA/Phil-IRI.
        const materialCols = hasLanguage ? "grade_level, language" : "grade_level";
        let q = supabase
          .from(config.table)
          .select(
            `school_id, ${config.labelField}, material:${config.materialTable}!inner(${materialCols})`,
          )
          .eq("school_year", schoolYear)
          .eq("phase", phase);
        if (grade !== "all") q = q.eq("material.grade_level", Number(grade));
        if (hasLanguage && language !== "all")
          q = q.eq("material.language", language);
        query = q;
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const bySchool: Record<string, Record<string, number>> = {};
      const labelSet = new Set<string>();
      (data || []).forEach((r) => {
        const rec = r as unknown as Record<string, unknown>;
        const label = (rec[labelField] as string | null) ?? null;
        if (!label) return;
        const sid = String(rec.school_id);
        labelSet.add(label);
        if (!bySchool[sid]) bySchool[sid] = {};
        bySchool[sid][label] = (bySchool[sid][label] ?? 0) + 1;
      });

      const orderedLabels =
        type === "PHIL_IRI"
          ? PHILIRI_ORDER.filter((l) => labelSet.has(l))
          : type === "PABASA"
            ? PABASA_LEVELS.filter((l) => labelSet.has(l))
            : Array.from(labelSet).sort();

      const schoolRows: SchoolRow[] = Object.entries(bySchool)
        .map(([sid, counts]) => ({
          schoolName: schoolNames[sid] ?? `School ${sid}`,
          counts,
          total: Object.values(counts).reduce((a, b) => a + b, 0),
        }))
        .sort((a, b) => a.schoolName.localeCompare(b.schoolName));

      setLabels(orderedLabels);
      setRows(schoolRows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load report");
      setRows([]);
      setLabels([]);
    } finally {
      setLoading(false);
    }
  }, [type, schoolYear, phase, grade, language, hasLanguage]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset grade/language when switching type so stale filters don't apply.
  useEffect(() => {
    setGrade("all");
    setLanguage("all");
  }, [type]);

  const totalsByLabel = useMemo(() => {
    const t: Record<string, number> = {};
    labels.forEach((l) => {
      t[l] = rows.reduce((sum, r) => sum + (r.counts[l] ?? 0), 0);
    });
    return t;
  }, [labels, rows]);

  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  const handlePrint = () => {
    generateAssessmentSummary({
      typeLabel:
        type === "PHIL_IRI"
          ? "Phil-IRI"
          : type === "CRLA"
            ? "CRLA"
            : type === "PABASA"
              ? "PABASA"
              : "RMA",
      schoolYear,
      phase:
        type === "PHIL_IRI"
          ? philIriPhaseLabel(phase)
          : type === "PABASA"
            ? pabasaPhaseLabel(phase)
            : phase,
      gradeLabel: grade === "all" ? "All grades" : getGradeLevelLabel(Number(grade)),
      languageLabel: hasLanguage ? (language === "all" ? "All" : language) : "",
      labels,
      rows,
      totalsByLabel,
      grandTotal,
    }).catch(() => toast.error("Failed to generate summary."));
  };

  return (
    <div>
      <div className="app__title">
        <Link
          href="/division/assessments"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Assessments
        </Link>
        <h1 className="app__title_text flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Assessment Reports
        </h1>
        <p className="text-sm text-muted-foreground">
          Division-wide reading-profile / reading-level / mastery distribution
          per school.
        </p>
      </div>

      <div className="app__content space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <div className="w-40">
                <label className="text-xs font-medium mb-1 block">Assessment</label>
                <Select value={type} onValueChange={(v) => setType(v as AssessmentType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CRLA">CRLA</SelectItem>
                    <SelectItem value="PHIL_IRI">Phil-IRI</SelectItem>
                    <SelectItem value="RMA">RMA</SelectItem>
                    <SelectItem value="PABASA">PABASA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-36">
                <label className="text-xs font-medium mb-1 block">School Year</label>
                <Select value={schoolYear} onValueChange={setSchoolYear}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getSchoolYearOptions().map((y) => (
                      <SelectItem key={y} value={y}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-32">
                <label className="text-xs font-medium mb-1 block">Phase</label>
                <Select value={phase} onValueChange={setPhase}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSESSMENT_PHASES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {type === "PHIL_IRI"
                          ? philIriPhaseLabel(p.value)
                          : type === "PABASA"
                            ? pabasaPhaseLabel(p.value)
                            : p.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-36">
                <label className="text-xs font-medium mb-1 block">Grade</label>
                <Select value={grade} onValueChange={setGrade}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All grades</SelectItem>
                    {grades.map((g) => (
                      <SelectItem key={g} value={String(g)}>
                        {getGradeLevelLabel(g)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {hasLanguage && (
                <div className="w-40">
                  <label className="text-xs font-medium mb-1 block">Language</label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All languages</SelectItem>
                      {languages.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrint}
                  disabled={loading || rows.length === 0}
                >
                  <Printer className="h-4 w-4 mr-1" /> Print Summary
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                No recorded results for the selected filters.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="text-sm border-collapse min-w-full">
                  <thead>
                    <tr className="bg-muted/60">
                      <th className="border px-3 py-2 text-left">School</th>
                      {labels.map((l) => (
                        <th key={l} className="border px-3 py-2 text-center">
                          {l}
                        </th>
                      ))}
                      <th className="border px-3 py-2 text-center">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.schoolName} className="hover:bg-muted/30">
                        <td className="border px-3 py-1.5">{r.schoolName}</td>
                        {labels.map((l) => (
                          <td key={l} className="border px-3 py-1.5 text-center">
                            {r.counts[l] ?? 0}
                          </td>
                        ))}
                        <td className="border px-3 py-1.5 text-center font-semibold">
                          {r.total}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-muted/40 font-semibold">
                      <td className="border px-3 py-1.5">Division Total</td>
                      {labels.map((l) => (
                        <td key={l} className="border px-3 py-1.5 text-center">
                          {totalsByLabel[l] ?? 0}
                        </td>
                      ))}
                      <td className="border px-3 py-1.5 text-center">
                        {grandTotal}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
