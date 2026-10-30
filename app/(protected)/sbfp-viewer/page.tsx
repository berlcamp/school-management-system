"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { fetchDivisionLearnerNutrition, fetchSbfpNutrition, fetchSbfpOverview } from "@/lib/sbfp/overview";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import {
  ALL_DISTRICTS,
  inDistrict,
  sumOverview,
  type SbfpNutritionRow,
  type SbfpOverviewSchool,
} from "@/lib/utils/sbfpOverview";
import { AlertCircle, Eye } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NutritionStatusChart } from "./components/NutritionStatusChart";
import { OverviewTiles, ProgramActivity } from "./components/OverviewTiles";
import { SchoolsTable } from "./components/SchoolsTable";
import { DistrictSelect, SchoolYearSelect } from "./components/ViewerFilters";

/**
 * The SBFP Viewer's dashboard (migration 222): the whole division's feeding
 * programme at a glance. Only counts reach this page — the two RPCs return
 * aggregates; learner lists are on the Reports page, one school at a time.
 */
export default function SbfpViewerDashboard() {
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [district, setDistrict] = useState(ALL_DISTRICTS);
  const [schools, setSchools] = useState<SbfpOverviewSchool[]>([]);
  const [nutrition, setNutrition] = useState<SbfpNutritionRow[]>([]);
  const [learnerNutrition, setLearnerNutrition] = useState<SbfpNutritionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchSbfpOverview(schoolYear),
      fetchSbfpNutrition(schoolYear),
      fetchDivisionLearnerNutrition(schoolYear),
    ])
      .then(([o, n, all]) => {
        if (!isMounted) return;
        setSchools(o);
        setNutrition(n);
        setLearnerNutrition(all);
      })
      .catch((err: unknown) => {
        console.error("Error loading the SBFP overview:", err);
        if (isMounted) setError("The feeding programme figures could not be loaded. Please try again.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [schoolYear]);

  const shownSchools = useMemo(
    () => schools.filter((s) => inDistrict(s.district, district)),
    [schools, district],
  );
  const shownSchoolIds = useMemo(() => new Set(shownSchools.map((s) => s.school_id)), [shownSchools]);
  const shownNutrition = useMemo(
    () => nutrition.filter((n) => shownSchoolIds.has(n.school_id)),
    [nutrition, shownSchoolIds],
  );
  const shownLearnerNutrition = useMemo(
    () => learnerNutrition.filter((n) => shownSchoolIds.has(n.school_id)),
    [learnerNutrition, shownSchoolIds],
  );
  const totals = useMemo(() => sumOverview(shownSchools), [shownSchools]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-sky-800">School-Based Feeding Program</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Division overview</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
            <Eye className="h-4 w-4" aria-hidden="true" />
            View only · Schools Division of Bayugan City · SY {schoolYear}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <SchoolYearSelect value={schoolYear} onChange={setSchoolYear} />
          <DistrictSelect value={district} onChange={setDistrict} />
        </div>
      </div>

      {error ? (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          {error}
        </div>
      ) : loading ? (
        <div className="space-y-6" aria-busy="true" aria-label="Loading">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-[124px] rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-[300px] rounded-2xl" />
          <Skeleton className="h-[400px] rounded-2xl" />
        </div>
      ) : (
        <>
          <OverviewTiles totals={totals} />
          <NutritionStatusChart
            rows={shownNutrition}
            allLearnerRows={shownLearnerNutrition}
            scopeLabel={district === ALL_DISTRICTS ? "division" : "district"}
          />
          <ProgramActivity totals={totals} />
          <SchoolsTable rows={shownSchools} schoolYear={schoolYear} />
        </>
      )}
    </div>
  );
}
