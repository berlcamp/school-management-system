"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SBFP_WEIGHING_PERIODS,
  type SbfpWeighingPeriod,
} from "@/lib/constants/sbfp";
import {
  fetchBeneficiaryViews,
  fetchHealthReadings,
  fetchMeasurements,
  saveMeasurements,
  WEIGHING_DATE_FIELD,
  type SbfpMeasurementInput,
} from "@/lib/sbfp/queries";
import {
  assessGrowth,
  formatAge,
  formatBmi,
  HEIGHT_FOR_AGE_OPTIONS,
  NUTRITIONAL_STATUS_OPTIONS,
  type HeightForAge,
  type NutritionalStatus,
} from "@/lib/utils/nutritionalStatus";
import type { SbfpBeneficiaryView, SbfpReading } from "@/lib/utils/sbfp";
import { CalendarDays, ClipboardCopy, Loader2, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { sectionOptionLabel, type SbfpTabProps } from "./types";

const NONE = "__none__";

interface Row {
  measured_at: string;
  weight_kg: string;
  height_cm: string;
  nutritional_status: NutritionalStatus | "";
  height_for_age: HeightForAge | "";
  remarks: string;
  /**
   * Whether each band is still the chart's answer. A band picked by hand is the
   * school's from then on, exactly as on Learner Health. Never saved.
   */
  auto_bmi: boolean;
  auto_hfa: boolean;
}

const EMPTY_ROW: Row = {
  measured_at: "",
  weight_kg: "",
  height_cm: "",
  nutritional_status: "",
  height_for_age: "",
  remarks: "",
  auto_bmi: true,
  auto_hfa: true,
};

/** All three weighings of the section, held at once; the tabs only switch view. */
type PeriodRows = Record<SbfpWeighingPeriod, Record<string, Row>>;
const emptyPeriodRows = (): PeriodRows => ({ baseline: {}, midline: {}, endline: {} });

const toNumber = (v: string): number | null => {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const sameRow = (a: Row, b: Row) =>
  a.measured_at === b.measured_at &&
  a.weight_kg === b.weight_kg &&
  a.height_cm === b.height_cm &&
  a.nutritional_status === b.nutritional_status &&
  a.height_for_age === b.height_for_age &&
  a.remarks === b.remarks;

function growthOf(b: SbfpBeneficiaryView, row: Row) {
  return assessGrowth({
    dateOfBirth: b.date_of_birth,
    gender: b.sex,
    heightCm: toNumber(row.height_cm),
    weightKg: toNumber(row.weight_kg),
    measuredOn: row.measured_at || null,
  });
}

/** Writes the chart's bands into whichever band the school has not taken over. */
function withSuggestion(b: SbfpBeneficiaryView, row: Row): Row {
  const g = growthOf(b, row);
  return {
    ...row,
    nutritional_status: row.auto_bmi ? g.bmiForAge?.status ?? "" : row.nutritional_status,
    height_for_age: row.auto_hfa ? g.heightForAge?.status ?? "" : row.height_for_age,
  };
}

function fromReading(b: SbfpBeneficiaryView, r: SbfpReading | null, remarks = ""): Row {
  if (!r) return { ...EMPTY_ROW };
  const row: Row = {
    measured_at: r.measured_at ?? "",
    weight_kg: r.weight_kg != null ? String(r.weight_kg) : "",
    height_cm: r.height_cm != null ? String(r.height_cm) : "",
    nutritional_status: r.nutritional_status ?? "",
    height_for_age: r.height_for_age ?? "",
    remarks,
    auto_bmi: true,
    auto_hfa: true,
  };
  // A stored band that differs from the chart is the school's own choice.
  const g = growthOf(b, row);
  row.auto_bmi = !row.nutritional_status || row.nutritional_status === g.bmiForAge?.status;
  row.auto_hfa = !row.height_for_age || row.height_for_age === g.heightForAge?.status;
  return row;
}

export function WeighingTab({
  schoolYear,
  program,
  sections,
  recordableSectionIds,
  actorId,
}: SbfpTabProps) {
  const [period, setPeriod] = useState<SbfpWeighingPeriod>("baseline");
  const visibleSections = useMemo(() => {
    const own = sections.filter((s) => recordableSectionIds.has(s.id));
    return own.length > 0 ? own : sections;
  }, [sections, recordableSectionIds]);
  const [sectionId, setSectionId] = useState("");
  const canEdit = recordableSectionIds.has(sectionId);

  const [beneficiaries, setBeneficiaries] = useState<SbfpBeneficiaryView[]>([]);
  const [stored, setStored] = useState<PeriodRows>(emptyPeriodRows);
  const [rows, setRows] = useState<PeriodRows>(emptyPeriodRows);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);

  const scheduledDate = program ? program[WEIGHING_DATE_FIELD[period]] : null;

  useEffect(() => {
    if (!sectionId && visibleSections.length > 0) setSectionId(visibleSections[0].id);
  }, [sectionId, visibleSections]);

  const load = useCallback(async () => {
    if (!program || !sectionId) return;
    setLoading(true);
    try {
      const views = await fetchBeneficiaryViews(program, sectionId);
      const measurements = await fetchMeasurements(views.map((v) => v.id));
      const next = emptyPeriodRows();
      for (const p of SBFP_WEIGHING_PERIODS) {
        for (const v of views) {
          next[p.value][v.id] = fromReading(
            v,
            v[p.value],
            measurements.get(`${p.value}:${v.id}`)?.remarks ?? "",
          );
        }
      }
      setBeneficiaries(views);
      setStored(next);
      setRows(next);
    } catch (err) {
      console.error("Error loading SBFP weighings:", err);
      toast.error("Failed to load weighings");
    } finally {
      setLoading(false);
    }
  }, [program, sectionId]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (isMounted) await load();
    })();
    return () => {
      isMounted = false;
    };
  }, [load]);

  const dirty = useMemo(() => {
    const out = new Set<SbfpWeighingPeriod>();
    for (const p of SBFP_WEIGHING_PERIODS) {
      for (const b of beneficiaries) {
        const a = rows[p.value][b.id] ?? EMPTY_ROW;
        const s = stored[p.value][b.id] ?? EMPTY_ROW;
        if (!sameRow(a, s)) {
          out.add(p.value);
          break;
        }
      }
    }
    return out;
  }, [rows, stored, beneficiaries]);

  const update = (b: SbfpBeneficiaryView, field: keyof Row, value: string) =>
    setRows((prev) => {
      let row: Row = { ...(prev[period][b.id] ?? EMPTY_ROW), [field]: value };
      if (field === "nutritional_status") row.auto_bmi = false;
      if (field === "height_for_age") row.auto_hfa = false;
      if (field === "weight_kg" || field === "height_cm" || field === "measured_at") {
        // The first figure typed on a row takes the scheduled date of weighing.
        if (field !== "measured_at" && !row.measured_at && scheduledDate) {
          row.measured_at = scheduledDate;
        }
        row = withSuggestion(b, row);
      }
      return { ...prev, [period]: { ...prev[period], [b.id]: row } };
    });

  /** Puts the scheduled date on every row that has a figure but no date yet. */
  const applyScheduledDate = () => {
    if (!scheduledDate) return;
    setRows((prev) => {
      const next = { ...prev[period] };
      for (const b of beneficiaries) {
        const row = next[b.id] ?? EMPTY_ROW;
        if (!row.measured_at) next[b.id] = withSuggestion(b, { ...row, measured_at: scheduledDate });
      }
      return { ...prev, [period]: next };
    });
  };

  /**
   * One-way prefill from SF8 (migration 209): fills only rows still empty in
   * this period, and nothing is written until Save.
   */
  const copyFromHealth = async () => {
    setCopying(true);
    try {
      const health = await fetchHealthReadings(
        beneficiaries.map((b) => b.student_id),
        schoolYear,
        period,
        sectionId,
      );
      let filled = 0;
      const next = { ...rows[period] };
      for (const b of beneficiaries) {
        const current = next[b.id] ?? EMPTY_ROW;
        const r = health.get(b.student_id);
        if (!r || current.weight_kg || current.height_cm) continue;
        next[b.id] = fromReading(b, r, current.remarks);
        filled += 1;
      }
      setRows((prev) => ({ ...prev, [period]: next }));
      toast.success(
        filled > 0
          ? `Copied ${filled} weighing(s) from Learner Health — review, then Save`
          : "Nothing to copy: no matching Learner Health readings for empty rows",
      );
    } catch (err) {
      console.error("Error copying from Learner Health:", err);
      toast.error("Failed to read Learner Health");
    } finally {
      setCopying(false);
    }
  };

  const handleSave = async () => {
    const periods = dirty.size > 0 ? [...dirty] : [period];
    const inputs: SbfpMeasurementInput[] = periods.flatMap((p) =>
      beneficiaries
        .filter((b) => !sameRow(rows[p][b.id] ?? EMPTY_ROW, stored[p][b.id] ?? EMPTY_ROW))
        .map((b) => {
          const r = rows[p][b.id] ?? EMPTY_ROW;
          return {
            beneficiary_id: b.id,
            period: p,
            measured_at: r.measured_at || null,
            weight_kg: toNumber(r.weight_kg),
            height_cm: toNumber(r.height_cm),
            nutritional_status: r.nutritional_status || null,
            height_for_age: r.height_for_age || null,
            remarks: r.remarks,
          };
        }),
    );
    if (inputs.length === 0) {
      toast("Nothing changed");
      return;
    }
    const undated = inputs.filter((i) => (i.weight_kg || i.height_cm) && !i.measured_at).length;
    if (undated > 0) {
      toast.error(`${undated} weighing(s) have no date of weighing`);
      return;
    }
    setSaving(true);
    try {
      await saveMeasurements(inputs, actorId);
      toast.success(`Saved ${inputs.length} weighing(s)`);
      await load();
    } catch (err) {
      console.error("Error saving SBFP weighings:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const periodRows = rows[period];
  const weighed = beneficiaries.filter((b) => {
    const r = periodRows[b.id];
    return r && (r.weight_kg || r.height_cm);
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Section</label>
          <Select value={sectionId} onValueChange={setSectionId}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Select section" />
            </SelectTrigger>
            <SelectContent>
              {visibleSections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {sectionOptionLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as SbfpWeighingPeriod)}>
          <TabsList>
            {SBFP_WEIGHING_PERIODS.map((p) => (
              <TabsTrigger key={p.value} value={p.value}>
                {p.label}
                {dirty.has(p.value) && (
                  <span className="ml-1.5 text-amber-600" title="Unsaved changes">
                    •
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <p className="text-sm text-muted-foreground">
        {SBFP_WEIGHING_PERIODS.find((p) => p.value === period)?.label} weighing
        {scheduledDate ? ` — scheduled ${scheduledDate}` : " — no date scheduled on the Program tab"}.
        {" "}
        {weighed} of {beneficiaries.length} beneficiaries weighed. Bands are suggested
        from the WHO chart as you type and can be changed.
        {period === "midline" && " Learner Health has no midline, so this one is encoded here only."}
      </p>

      {canEdit && beneficiaries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {period !== "midline" && (
            <Button variant="outline" onClick={copyFromHealth} disabled={copying || loading}>
              {copying ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ClipboardCopy className="h-4 w-4 mr-2" />
              )}
              Copy from Learner Health
            </Button>
          )}
          {scheduledDate && (
            <Button variant="outline" onClick={applyScheduledDate} disabled={loading}>
              <CalendarDays className="h-4 w-4 mr-2" />
              Use {scheduledDate} where blank
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving || loading || dirty.size === 0}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : beneficiaries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No beneficiaries in this section. Select them on the Beneficiaries tab.
        </p>
      ) : (
        <div className="app__table_shell">
          <div className="app__table_wrapper overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left font-medium">Learner</th>
                  <th className="text-left font-medium">Date of weighing</th>
                  <th className="text-left font-medium">Weight (kg)</th>
                  <th className="text-left font-medium">Height (cm)</th>
                  <th className="text-left font-medium">Age</th>
                  <th className="text-left font-medium">BMI</th>
                  <th className="text-left font-medium">BMI-A</th>
                  <th className="text-left font-medium">HFA</th>
                  <th className="text-left font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {beneficiaries.map((b) => {
                  const row = periodRows[b.id] ?? EMPTY_ROW;
                  const g = growthOf(b, row);
                  const hasFigure = Boolean(row.weight_kg || row.height_cm);
                  return (
                    <tr key={b.id}>
                      <td className="whitespace-nowrap">
                        {b.name}
                        <span className="ml-1 text-xs text-muted-foreground">
                          {b.sex === "male" ? "M" : b.sex === "female" ? "F" : ""}
                        </span>
                      </td>
                      <td>
                        <Input
                          type="date"
                          className="h-8 w-[150px]"
                          value={row.measured_at}
                          disabled={!canEdit}
                          onChange={(e) => update(b, "measured_at", e.target.value)}
                        />
                      </td>
                      <td>
                        <Input
                          type="number"
                          step="0.1"
                          min={0}
                          className="h-8 w-[90px]"
                          value={row.weight_kg}
                          disabled={!canEdit}
                          onChange={(e) => update(b, "weight_kg", e.target.value)}
                        />
                      </td>
                      <td>
                        <Input
                          type="number"
                          step="0.1"
                          min={0}
                          className="h-8 w-[90px]"
                          value={row.height_cm}
                          disabled={!canEdit}
                          onChange={(e) => update(b, "height_cm", e.target.value)}
                        />
                      </td>
                      <td className="whitespace-nowrap tabular-nums">
                        {hasFigure && g.ageMonths !== null ? formatAge(g.ageMonths) : ""}
                      </td>
                      <td className="tabular-nums" title={g.unavailable ?? undefined}>
                        {formatBmi(g.bmi)}
                      </td>
                      <td>
                        <Select
                          value={row.nutritional_status || NONE}
                          disabled={!canEdit}
                          onValueChange={(v) =>
                            update(b, "nutritional_status", v === NONE ? "" : v)
                          }
                        >
                          <SelectTrigger className="h-8 w-[150px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>—</SelectItem>
                            {NUTRITIONAL_STATUS_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td>
                        <Select
                          value={row.height_for_age || NONE}
                          disabled={!canEdit}
                          onValueChange={(v) => update(b, "height_for_age", v === NONE ? "" : v)}
                        >
                          <SelectTrigger className="h-8 w-[150px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>—</SelectItem>
                            {HEIGHT_FOR_AGE_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td>
                        <Input
                          className="h-8 w-[160px]"
                          value={row.remarks}
                          disabled={!canEdit}
                          onChange={(e) => update(b, "remarks", e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
