"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { getGradeLevelLabel } from "@/lib/constants";
import { generateNutritionalStatusPrint } from "@/lib/pdf";
import { useReportSchool } from "@/components/reports/ReportSchoolContext";
import { useAppSelector } from "@/lib/redux/hook";
import {
  MEASUREMENT_PERIOD_OPTIONS,
  type HealthMeasurementPeriod,
} from "@/lib/utils/nutritionalStatus";
import {
  BMI_BANDS,
  HFA_BANDS,
  fetchNutritionalSummary,
  totalsFor,
  type NutritionalSummary,
  type NutritionalSummaryRow,
  type SexCounts,
} from "@/lib/utils/nutritionalSummary";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  ReportAccessDenied,
  ReportNeedsSchool,
  ReportShell,
  useCanViewReports,
} from "../components/ReportShell";

const EMPTY_SUMMARY: NutritionalSummary = { baseline: [], endline: [] };

/** "3 / 2", or a dash where nobody falls in the band. */
function Cell({ counts }: { counts: SexCounts | undefined }) {
  if (!counts || (counts.male === 0 && counts.female === 0)) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="tabular-nums">
      {counts.male} / {counts.female}
    </span>
  );
}

function BandTable({
  rows,
  measure,
  bands,
  caption,
}: {
  rows: NutritionalSummaryRow[];
  measure: "bmi" | "hfa";
  bands: { value: string; label: string }[];
  caption: string;
}) {
  const totals = totalsFor(rows, measure);
  const measuredTotal = totals.measured.male + totals.measured.female;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{caption}</h3>
      <div className="app__table_shell">
        <div className="app__table_wrapper">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left font-medium">Grade Level</th>
                {bands.map((b) => (
                  <th key={b.value} className="text-center font-medium">
                    {b.label}
                  </th>
                ))}
                <th className="text-right font-medium">Total Measured</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.gradeLevel}>
                  <td>{getGradeLevelLabel(row.gradeLevel)}</td>
                  {bands.map((b) => (
                    <td key={b.value} className="text-center">
                      <Cell counts={row[measure][b.value]} />
                    </td>
                  ))}
                  <td className="text-right tabular-nums">
                    {row.measured.male + row.measured.female}
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/40 font-semibold">
                <td>TOTAL</td>
                {bands.map((b) => (
                  <td key={b.value} className="text-center">
                    <Cell counts={totals.bands[b.value]} />
                  </td>
                ))}
                <td className="text-right tabular-nums">{measuredTotal}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const canView = useCanViewReports();
  const { schoolId } = useReportSchool();

  // The report is always the current school year — there is no year filter,
  // matching the other school-level reports.
  const schoolYear = getCurrentSchoolYear();

  const [summary, setSummary] = useState<NutritionalSummary>(EMPTY_SUMMARY);
  const [period, setPeriod] = useState<HealthMeasurementPeriod>("baseline");
  const [loading, setLoading] = useState(false);

  const { settings } = useSchoolSettings(Boolean(schoolId), schoolId);

  useEffect(() => {
    let isMounted = true;
    if (!canView || !schoolId) {
      setSummary(EMPTY_SUMMARY);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchNutritionalSummary(schoolId, schoolYear);
        if (!isMounted) return;
        setSummary(data);
        // Open on the reading the school is actually working on, as the entry
        // screen does — a school measured only once opens on its baseline.
        setPeriod(data.endline.length > 0 ? "endline" : "baseline");
      } catch (err) {
        console.error("Error loading nutritional status summary:", err);
        if (!isMounted) return;
        toast.error("Failed to load report");
        setSummary(EMPTY_SUMMARY);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [canView, schoolId, schoolYear]);

  const rows = summary[period];
  const hasAny = summary.baseline.length > 0 || summary.endline.length > 0;

  const handlePrint = async () => {
    if (!schoolId) return;
    try {
      // The printout carries both readings whichever one is on screen: the
      // sheet is filed to show the change over the year.
      await generateNutritionalStatusPrint({
        schoolId,
        schoolYear,
        summary,
        preparedBy: user?.name ?? "",
        principalName: settings.principal_name,
        principalTitle: settings.principal_title,
      });
    } catch (err) {
      console.error("Error printing nutritional status summary:", err);
      toast.error("Failed to generate PDF");
    }
  };

  if (!canView) return <ReportAccessDenied />;
  if (!schoolId) return <ReportNeedsSchool />;

  return (
    <ReportShell
      title="Nutritional Status Summary"
      description={`SY ${schoolYear} — SF8 bands consolidated across every section`}
      onPrint={handlePrint}
      printDisabled={loading || !hasAny}
      filters={
        <div className="space-y-3">
          <Tabs
            value={period}
            onValueChange={(v) => setPeriod(v as HealthMeasurementPeriod)}
          >
            <TabsList>
              {MEASUREMENT_PERIOD_OPTIONS.map((o) => (
                <TabsTrigger key={o.value} value={o.value}>
                  {o.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <p className="text-sm text-muted-foreground">
            Counts are shown as <span className="font-medium">Male / Female</span>
            , taken from what each adviser or the school nurse encoded on{" "}
            <span className="font-medium">Learner Health</span>. A learner counts
            once they carry a band. The printout includes both readings.
          </p>
        </div>
      }
    >
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No measurements recorded for this reading in SY {schoolYear}.
        </p>
      ) : (
        <div className="space-y-6">
          <BandTable
            rows={rows}
            measure="bmi"
            bands={BMI_BANDS}
            caption="Nutritional Status (BMI for Age)"
          />
          <BandTable
            rows={rows}
            measure="hfa"
            bands={HFA_BANDS}
            caption="Nutritional Status (Height for Age)"
          />
        </div>
      )}
    </ReportShell>
  );
}
