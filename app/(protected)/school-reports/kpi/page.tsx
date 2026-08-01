"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getGradeLevelLabel } from "@/lib/constants";
import {
  KPI_CYCLES,
  KPI_INTAKE_LEVELS,
  KPI_LEVELS,
  KPI_TRANSITIONS,
} from "@/lib/constants/kpi";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  buildGradeEfficiency,
  grossEnrollmentRate,
  grossIntakeRate,
  learnerRatio,
  netEnrollmentRate,
  netIntakeRate,
  genderParityIndex,
  reconstructCohort,
  seatTotal,
  shiftSchoolYear,
  sumFacts,
  transitionRate,
} from "@/lib/utils/kpi";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import type {
  KpiEnrollmentFact,
  KpiReference,
  KpiResourceFact,
} from "@/types";
import { ArrowLeft, Gauge, Loader2, Settings2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import { AccessIndicators } from "./components/AccessIndicators";
import { EfficiencyIndicators } from "./components/EfficiencyIndicators";
import { KpiReferenceDialog } from "./components/KpiReferenceDialog";
import { RatioIndicators } from "./components/RatioIndicators";

/**
 * Roles allowed in the KPI module. Mirrors the Reports module's staff roles and
 * adds the division office, which is where the memo says these indicators are
 * actually computed. Hiding the sidebar link is not access control, so the page
 * re-checks here.
 */
const KPI_ROLES = [
  "school_head",
  "assistant_school_head",
  "admin",
  "super admin",
  "division_admin",
  "division_type",
];

/** Roles that may edit the population / facility figures. */
const KPI_EDIT_ROLES = [
  "school_head",
  "assistant_school_head",
  "admin",
  "super admin",
  "division_admin",
  "division_type",
];

const DIVISION_SCOPE = "division";

interface SchoolOption {
  id: string;
  name: string;
}

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const userType = user?.type ?? "";
  const canView = KPI_ROLES.includes(userType);
  const canEdit = KPI_EDIT_ROLES.includes(userType);
  const isDivisionUser =
    userType === "division_admin" ||
    userType === "division_type" ||
    userType === "super admin";

  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  // Empty until the session lands in Redux — AuthGuard populates `user` after
  // the first render, so the scope has to be seeded in an effect rather than in
  // the initial state, or a school user would be left scoped to nothing.
  const [scope, setScope] = useState<string>("");
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);

  const [factsByYear, setFactsByYear] = useState<
    Record<string, KpiEnrollmentFact[]>
  >({});
  const [resources, setResources] = useState<KpiResourceFact[]>([]);
  const [references, setReferences] = useState<KpiReference[]>([]);

  // A school-level user is pinned to their own school; only the division office
  // can roll up or look across schools.
  const effectiveSchoolId =
    scope === DIVISION_SCOPE ? null : scope ? scope : null;
  const isSchoolScope = effectiveSchoolId !== null;

  const previousSchoolYear = shiftSchoolYear(schoolYear, 1);
  // The old-method CSR and completion rate reach back one cohort length: three
  // years for JHS, five for elementary and for JHS-to-SHS.
  const laggedYears = useMemo(
    () =>
      Array.from(new Set(KPI_CYCLES.map((c) => c.lagYears))).map((lag) =>
        shiftSchoolYear(schoolYear, lag)
      ),
    [schoolYear]
  );

  useEffect(() => {
    if (scope) return;
    if (!userType) return;
    setScope(
      isDivisionUser
        ? DIVISION_SCOPE
        : user?.school_id != null
          ? String(user.school_id)
          : ""
    );
  }, [scope, userType, isDivisionUser, user?.school_id]);

  useEffect(() => {
    if (!isDivisionUser) return;
    let isMounted = true;

    const fetchSchools = async () => {
      const { data, error } = await supabase
        .from("sms_schools")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (!isMounted) return;
      if (error) {
        console.error("Error loading schools:", error);
        return;
      }
      setSchools(
        (data ?? []).map((s) => ({ id: String(s.id), name: s.name as string }))
      );
    };

    fetchSchools();
    return () => {
      isMounted = false;
    };
  }, [isDivisionUser]);

  const fetchAll = useCallback(async () => {
    if (!canView) return;
    if (!isDivisionUser && !effectiveSchoolId) return;

    setLoading(true);
    try {
      const years = Array.from(
        new Set([schoolYear, previousSchoolYear, ...laggedYears])
      );
      const schoolParam =
        effectiveSchoolId === null ? null : Number(effectiveSchoolId);

      const [factResults, resourceResult, referenceResult] = await Promise.all([
        Promise.all(
          years.map((year) =>
            supabase.rpc("kpi_enrollment_facts", {
              p_school_id: schoolParam,
              p_school_year: year,
            })
          )
        ),
        supabase.rpc("kpi_resource_facts", {
          p_school_id: schoolParam,
          p_school_year: schoolYear,
        }),
        supabase
          .from("sms_kpi_reference")
          .select("*")
          .eq("school_year", schoolYear),
      ]);

      const nextFacts: Record<string, KpiEnrollmentFact[]> = {};
      factResults.forEach((result, index) => {
        if (result.error) throw result.error;
        nextFacts[years[index]] = (result.data ?? []) as KpiEnrollmentFact[];
      });
      setFactsByYear(nextFacts);

      if (resourceResult.error) throw resourceResult.error;
      setResources(
        ((resourceResult.data ?? []) as KpiResourceFact[]).map((r) => ({
          ...r,
          school_id: String(r.school_id),
        }))
      );

      if (referenceResult.error) throw referenceResult.error;
      setReferences(
        ((referenceResult.data ?? []) as KpiReference[]).map((r) => ({
          ...r,
          id: String(r.id),
          school_id: r.school_id === null ? null : String(r.school_id),
        }))
      );
    } catch (err) {
      console.error("Error loading KPI data:", err);
      toast.error("Failed to load key performance indicators");
      setFactsByYear({});
      setResources([]);
      setReferences([]);
    } finally {
      setLoading(false);
    }
  }, [
    canView,
    isDivisionUser,
    effectiveSchoolId,
    schoolYear,
    previousSchoolYear,
    laggedYears,
  ]);

  useEffect(() => {
    let isMounted = true;
    const run = async () => {
      await fetchAll();
      if (!isMounted) return;
    };
    run();
    return () => {
      isMounted = false;
    };
  }, [fetchAll]);

  const current = factsByYear[schoolYear] ?? [];
  const previous = factsByYear[previousSchoolYear] ?? [];

  const referenceBySchool = useMemo(() => {
    const map = new Map<string, KpiReference>();
    references.forEach((r) => {
      if (r.school_id !== null) map.set(r.school_id, r);
    });
    return map;
  }, [references]);

  const scopeReference = useMemo(
    () =>
      references.find((r) =>
        effectiveSchoolId === null
          ? r.school_id === null
          : r.school_id === effectiveSchoolId
      ) ?? null,
    [references, effectiveSchoolId]
  );

  const scopeLabel =
    effectiveSchoolId === null
      ? "Division-wide (all schools)"
      : (schools.find((s) => s.id === effectiveSchoolId)?.name ??
        "This school");

  const handleExport = () => {
    try {
      const workbook = XLSX.utils.book_new();

      const accessRows = [
        ...KPI_LEVELS.map((level) => {
          const ger = grossEnrollmentRate(level, current, scopeReference);
          const ner = netEnrollmentRate(level, current, scopeReference);
          return {
            Indicator: "GER / NER",
            Level: level.label,
            "Enrollment (all ages)": ger.numerator,
            "Enrollment (official age)": ner.numerator,
            Population: ger.denominator,
            "GER (%)": ger.value,
            "NER (%)": ner.value,
          };
        }),
        ...KPI_INTAKE_LEVELS.map((intake) => {
          const gir = grossIntakeRate(intake, current, scopeReference);
          const nir = netIntakeRate(intake, current, scopeReference);
          return {
            Indicator: "GIR / NIR",
            Level: intake.label,
            "Enrollment (all ages)": gir.numerator,
            "Enrollment (official age)": nir.numerator,
            Population: gir.denominator,
            "GER (%)": gir.value,
            "NER (%)": nir.value,
          };
        }),
        ...KPI_TRANSITIONS.map((transition) => {
          const result = transitionRate(transition, current, previous);
          return {
            Indicator: "Transition Rate",
            Level: transition.label,
            "Enrollment (all ages)": result.numerator,
            "Enrollment (official age)": null,
            Population: result.denominator,
            "GER (%)": result.value,
            "NER (%)": null,
          };
        }),
      ];
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(accessRows),
        "Access"
      );

      const efficiencyRows = KPI_CYCLES.flatMap((cycle) => {
        const rows = buildGradeEfficiency(cycle, current, previous);
        const cohort = reconstructCohort(cycle, rows);
        return rows.map((row) => ({
          Cycle: cycle.label,
          Grade: getGradeLevelLabel(row.gradeLevel),
          [`Enrollment SY ${previousSchoolYear}`]: row.enrollmentPrevious,
          [`Enrollment SY ${schoolYear}`]: row.enrollmentCurrent,
          Repeaters: row.repeatersCurrent,
          "Promotion Rate (%)": row.promotionRate,
          "Repetition Rate (%)": row.repetitionRate,
          "School Leaver Rate (%)": row.schoolLeaverRate,
          "Simple Dropout Rate (%)": row.simpleDropoutRate,
          "Cohort Survival Rate (%)": cohort.cohortSurvivalRate,
          "Completion Rate (%)": cohort.completionRate,
          "Coefficient of Efficiency (%)": cohort.coefficientOfEfficiency,
          "Years Input per Graduate": cohort.yearsInputPerGraduate,
        }));
      });
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(efficiencyRows),
        "Efficiency"
      );

      const totalEnrollment = sumFacts(current, "enrollment");
      const teachers =
        scopeReference?.teacher_count_override ??
        resources.reduce((sum, r) => sum + r.teachers, 0);
      const classrooms =
        scopeReference?.classroom_count_override ??
        resources.reduce((sum, r) => sum + r.classrooms, 0);
      const female = sumFacts(current, "enrollment", { sex: "female" });
      const male = sumFacts(current, "enrollment", { sex: "male" });
      const ratioRows = [
        {
          Ratio: "Teacher-Learner",
          Learners: totalEnrollment,
          Units: teachers,
          "Learners per unit": learnerRatio(totalEnrollment, teachers).value,
        },
        {
          Ratio: "Classroom-Learner",
          Learners: totalEnrollment,
          Units: classrooms,
          "Learners per unit": learnerRatio(totalEnrollment, classrooms).value,
        },
        {
          Ratio: "Seat-Learner",
          Learners: totalEnrollment,
          Units: seatTotal(scopeReference),
          "Learners per unit": learnerRatio(
            totalEnrollment,
            seatTotal(scopeReference)
          ).value,
        },
        {
          Ratio: "Toilet Bowl-Learner",
          Learners: totalEnrollment,
          Units: scopeReference?.toilet_bowls_functional ?? null,
          "Learners per unit": learnerRatio(
            totalEnrollment,
            scopeReference?.toilet_bowls_functional ?? null
          ).value,
        },
        {
          Ratio: "Gender Parity Index (enrollment)",
          Learners: female,
          Units: male,
          "Learners per unit": genderParityIndex(female, male),
        },
      ];
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(ratioRows),
        "Ratios"
      );

      XLSX.writeFile(
        workbook,
        `KPI_${scopeLabel.replace(/[^\w]+/g, "_")}_${schoolYear}.xlsx`
      );
      toast.success("Exported");
    } catch (err) {
      console.error("Error exporting KPIs:", err);
      toast.error("Failed to export");
    }
  };

  if (!canView) {
    return (
      <div className="p-6">
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You do not have permission to view key performance indicators.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/home">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Link
        href="/school-reports"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Reports
      </Link>

      <div className="flex items-center gap-2">
        <Gauge className="h-6 w-6" />
        <div>
          <h1 className="text-xl font-semibold">Key Performance Indicators</h1>
          <p className="text-sm text-muted-foreground">
            Access, efficiency and ratio indicators computed per the DepEd
            Memorandum of 12 October 2022, “Guide in Computing Key Performance
            Indicators”.
          </p>
        </div>
      </div>

      <Card className="border-0 shadow-lg">
        <CardContent className="space-y-5 pt-6">
          <div className="rounded-lg border bg-muted/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  School Year <span className="text-red-500">*</span>
                </label>
                <Select value={schoolYear} onValueChange={setSchoolYear}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getSchoolYearOptions(6, 1).map((sy) => (
                      <SelectItem key={sy} value={sy}>
                        {sy}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Reference year. SY {previousSchoolYear} is read as well — the
                  efficiency rates need two consecutive years.
                </p>
              </div>

              {isDivisionUser && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Scope
                  </label>
                  <Select value={scope} onValueChange={setScope}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DIVISION_SCOPE}>
                        Division-wide (all schools)
                      </SelectItem>
                      {schools.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    The memo computes most indicators at division level.
                  </p>
                </div>
              )}

              <div className="flex items-end gap-2">
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => setReferenceOpen(true)}
                  >
                    <Settings2 className="h-4 w-4 mr-2" />
                    Reference Data
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={handleExport}
                  disabled={loading}
                >
                  Export
                </Button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Computing indicators…
            </div>
          ) : (
            <Tabs defaultValue="access">
              <TabsList>
                <TabsTrigger value="access">Access</TabsTrigger>
                <TabsTrigger value="efficiency">Efficiency</TabsTrigger>
                <TabsTrigger value="ratios">Ratio and Proportion</TabsTrigger>
              </TabsList>

              <TabsContent value="access" className="mt-4">
                <AccessIndicators
                  current={current}
                  previous={previous}
                  reference={scopeReference}
                  schoolYear={schoolYear}
                  previousSchoolYear={previousSchoolYear}
                  isSchoolScope={isSchoolScope}
                />
              </TabsContent>

              <TabsContent value="efficiency" className="mt-4">
                <EfficiencyIndicators
                  current={current}
                  previous={previous}
                  lagged={factsByYear}
                  schoolYear={schoolYear}
                  previousSchoolYear={previousSchoolYear}
                  isSchoolScope={isSchoolScope}
                />
              </TabsContent>

              <TabsContent value="ratios" className="mt-4">
                <RatioIndicators
                  current={current}
                  previous={previous}
                  resources={resources}
                  reference={scopeReference}
                  referenceBySchool={referenceBySchool}
                  isSchoolScope={isSchoolScope}
                  schoolYear={schoolYear}
                />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      <KpiReferenceDialog
        open={referenceOpen}
        onOpenChange={setReferenceOpen}
        schoolId={effectiveSchoolId}
        schoolYear={schoolYear}
        reference={scopeReference}
        userId={user?.id}
        onSaved={fetchAll}
      />
    </div>
  );
}
