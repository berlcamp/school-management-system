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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { getGradeLevelLabel } from "@/lib/constants";
import {
  SBFP_DELIVERY_COMPONENT_OPTIONS,
  SBFP_MEAL_KIND_OPTIONS,
  SBFP_MEAL_UNITS,
  type SbfpDeliveryComponent,
  type SbfpMealKind,
} from "@/lib/constants/sbfp";
import { printSbfpHotMeals } from "@/lib/pdf/generateSbfpForms";
import {
  countBeneficiaries,
  deleteDelivery,
  fetchDeliveries,
  saveDelivery,
} from "@/lib/sbfp/queries";
import {
  mealLineLabel,
  mealTotals,
  type SbfpDelivery,
  type SbfpMealLine,
} from "@/lib/utils/sbfp";
import { Loader2, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { buildSbfpHeaderInfo } from "./headerInfo";
import type { SbfpTabProps } from "./types";

type Draft = Omit<SbfpDelivery, "id"> & { id?: string };

/** The grade-level picker's value for a hot meal cooked for the whole school. */
const ALL_GRADES = "all";
const UNITS_LIST_ID = "sbfp-meal-units";

const blankMeal = (kind: SbfpMealKind): SbfpMealLine => ({
  kind,
  quantity: 0,
  unit: "",
  viand_name: "",
  servings: 0,
});

const blankDraft = (
  component: SbfpDeliveryComponent,
  gradeLevel: number | null,
): Draft => ({
  component,
  grade_level: component === "hot_meals" ? gradeLevel : gradeLevel ?? 0,
  delivered_on: null,
  packs_new: 0,
  packs_replacement: 0,
  packs_rejected: 0,
  remarks: "",
  meals: component === "hot_meals" ? [blankMeal("new")] : [],
});

const toCount = (v: string) => Math.max(0, Math.trunc(Number(v) || 0));
const toQuantity = (v: string) => Math.max(0, Math.round((Number(v) || 0) * 100) / 100);

const componentLabel = (c: SbfpDeliveryComponent) =>
  SBFP_DELIVERY_COMPONENT_OPTIONS.find((o) => o.value === c)?.shortLabel ?? c;

export function DeliveriesTab({ schoolId, schoolYear, program, sections, canManage }: SbfpTabProps) {
  const { settings } = useSchoolSettings(true, schoolId);
  const gradeLevels = useMemo(() => {
    const levels = new Set<number>([0, 1, 2, 3, 4, 5, 6]);
    for (const s of sections) levels.add(s.grade_level);
    return [...levels].sort((a, b) => a - b);
  }, [sections]);

  const [deliveries, setDeliveries] = useState<SbfpDelivery[]>([]);
  const [draft, setDraft] = useState<Draft>(() => blankDraft("nfp", 0));
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);

  const isHotMeals = draft.component === "hot_meals";

  const load = useCallback(async () => {
    if (!program) return;
    try {
      setDeliveries(await fetchDeliveries(program.id));
    } catch (err) {
      console.error("Error loading deliveries:", err);
      toast.error("Failed to load deliveries");
    }
  }, [program]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (isMounted) await load();
    })();
    return () => {
      isMounted = false;
    };
  }, [load]);

  const setComponent = (component: SbfpDeliveryComponent) =>
    setDraft((d) => {
      if ((component === "hot_meals") === (d.component === "hot_meals")) {
        return { ...d, component };
      }
      // Switching between packs and viands: keep date, grade and remarks.
      return {
        ...blankDraft(component, d.grade_level),
        id: d.id,
        delivered_on: d.delivered_on,
        remarks: d.remarks,
      };
    });

  const updateMeal = (index: number, patch: Partial<SbfpMealLine>) =>
    setDraft((d) => ({
      ...d,
      meals: d.meals.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    }));

  const removeMeal = (index: number) =>
    setDraft((d) => ({ ...d, meals: d.meals.filter((_, i) => i !== index) }));

  const addMeal = (kind: SbfpMealKind) =>
    setDraft((d) => ({ ...d, meals: [...d.meals, blankMeal(kind)] }));

  const handleSave = async () => {
    if (!program) return;
    if (isHotMeals) {
      const named = draft.meals.filter((m) => m.viand_name.trim());
      if (named.length === 0) {
        toast.error("Enter at least one viand");
        return;
      }
      if (draft.meals.some((m) => !m.viand_name.trim() && (m.quantity || m.servings))) {
        toast.error("Every line with a quantity or servings needs a viand name");
        return;
      }
    }
    setSaving(true);
    try {
      await saveDelivery(program.id, draft);
      toast.success(draft.id ? "Delivery updated" : "Delivery added");
      setDraft(blankDraft(draft.component, draft.grade_level));
      await load();
    } catch (err) {
      console.error("Error saving delivery:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remove this delivery?")) return;
    try {
      await deleteDelivery(id);
      await load();
    } catch (err) {
      console.error("Error deleting delivery:", err);
      toast.error("Failed to delete");
    }
  };

  const handlePrintHotMeals = async () => {
    if (!program) return;
    setPrinting(true);
    try {
      const [info, count] = await Promise.all([
        buildSbfpHeaderInfo(program, schoolId, schoolYear, settings),
        countBeneficiaries(program.id),
      ]);
      printSbfpHotMeals(info, count, deliveries);
    } catch (err) {
      console.error("Error printing hot meals report:", err);
      toast.error("Failed to generate the report");
    } finally {
      setPrinting(false);
    }
  };

  const edit = (d: SbfpDelivery) => {
    setDraft({
      ...d,
      meals: d.component === "hot_meals" && d.meals.length === 0 ? [blankMeal("new")] : d.meals,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const hotMealsCount = deliveries.filter((d) => d.component === "hot_meals").length;

  return (
    <div className="space-y-4">
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {draft.id ? "Edit delivery" : "Record a delivery"}
            </CardTitle>
            <CardDescription>
              {isHotMeals
                ? "One line per viand: what was received new, what came as a replacement, and what was sent back for replacement or rejected — each with its quantity, unit and the servings it yields."
                : "One line per delivery per grade level. Beneficiary counts on Form 6 come from the beneficiary list, so they are not typed here."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Component</Label>
                <Select
                  value={draft.component}
                  onValueChange={(v) => setComponent(v as SbfpDeliveryComponent)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SBFP_DELIVERY_COMPONENT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Grade level</Label>
                <Select
                  value={draft.grade_level === null ? ALL_GRADES : String(draft.grade_level)}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, grade_level: v === ALL_GRADES ? null : Number(v) }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {isHotMeals && <SelectItem value={ALL_GRADES}>All grade levels</SelectItem>}
                    {gradeLevels.map((g) => (
                      <SelectItem key={g} value={String(g)}>
                        {getGradeLevelLabel(g)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date delivered</Label>
                <Input
                  type="date"
                  value={draft.delivered_on ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, delivered_on: e.target.value || null }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Remarks</Label>
                <Input
                  value={draft.remarks ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, remarks: e.target.value }))}
                />
              </div>

              {!isHotMeals && (
                <>
                  <div className="space-y-1.5">
                    <Label>Packs received — new</Label>
                    <Input
                      type="number"
                      min={0}
                      value={draft.packs_new}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, packs_new: toCount(e.target.value) }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Packs received — replacement</Label>
                    <Input
                      type="number"
                      min={0}
                      value={draft.packs_replacement}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, packs_replacement: toCount(e.target.value) }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Packs for replacement / rejected</Label>
                    <Input
                      type="number"
                      min={0}
                      value={draft.packs_rejected}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, packs_rejected: toCount(e.target.value) }))
                      }
                    />
                  </div>
                </>
              )}
            </div>

            {isHotMeals && (
              <div className="space-y-4">
                <datalist id={UNITS_LIST_ID}>
                  {SBFP_MEAL_UNITS.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
                {SBFP_MEAL_KIND_OPTIONS.map((kind) => {
                  const lines = draft.meals
                    .map((m, index) => ({ m, index }))
                    .filter(({ m }) => m.kind === kind.value);
                  return (
                    <div key={kind.value} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">{kind.label}</div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addMeal(kind.value)}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add viand
                        </Button>
                      </div>
                      {lines.length === 0 ? (
                        <p className="text-xs text-muted-foreground">None.</p>
                      ) : (
                        <div className="space-y-2">
                          <div className="hidden md:grid md:grid-cols-[90px_120px_1fr_120px_40px] gap-2 text-xs text-muted-foreground">
                            <span>#</span>
                            <span>Unit</span>
                            <span>Viand name</span>
                            <span>Servings (yield)</span>
                            <span></span>
                          </div>
                          {lines.map(({ m, index }) => (
                            <div
                              key={index}
                              className="grid gap-2 grid-cols-2 md:grid-cols-[90px_120px_1fr_120px_40px]"
                            >
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                aria-label="Quantity"
                                value={m.quantity || ""}
                                onChange={(e) =>
                                  updateMeal(index, { quantity: toQuantity(e.target.value) })
                                }
                              />
                              <Input
                                aria-label="Unit"
                                list={UNITS_LIST_ID}
                                value={m.unit ?? ""}
                                onChange={(e) => updateMeal(index, { unit: e.target.value })}
                              />
                              <Input
                                aria-label="Viand name"
                                className="col-span-2 md:col-span-1"
                                placeholder="e.g. Chicken adobo with rice"
                                value={m.viand_name}
                                onChange={(e) => updateMeal(index, { viand_name: e.target.value })}
                              />
                              <Input
                                type="number"
                                min={0}
                                aria-label="Servings"
                                value={m.servings || ""}
                                onChange={(e) =>
                                  updateMeal(index, { servings: toCount(e.target.value) })
                                }
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label="Remove viand"
                                onClick={() => removeMeal(index)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-end gap-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                {draft.id ? "Update" : "Add"}
              </Button>
              {draft.id && (
                <Button
                  variant="ghost"
                  onClick={() => setDraft(blankDraft(draft.component, draft.grade_level))}
                >
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={handlePrintHotMeals}
          disabled={printing || hotMealsCount === 0}
        >
          {printing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Printer className="h-4 w-4 mr-2" />
          )}
          Print Hot Meals report
        </Button>
      </div>

      {deliveries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No deliveries recorded.
        </p>
      ) : (
        <div className="app__table_shell">
          <div className="app__table_wrapper">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left font-medium">Component</th>
                  <th className="text-left font-medium">Grade level</th>
                  <th className="text-left font-medium">Date delivered</th>
                  <th className="text-right font-medium">New</th>
                  <th className="text-right font-medium">Replacement</th>
                  <th className="text-right font-medium">Total</th>
                  <th className="text-right font-medium">Rejected</th>
                  <th className="text-left font-medium">Remarks</th>
                  {canManage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => {
                  const hot = d.component === "hot_meals";
                  const t = mealTotals([d]);
                  const newCount = hot ? t.servingsNew : d.packs_new;
                  const replacement = hot ? t.servingsReplacement : d.packs_replacement;
                  const rejected = hot ? t.servingsRejected : d.packs_rejected;
                  return (
                    <tr key={d.id} className="align-top">
                      <td>
                        {componentLabel(d.component)}
                        {hot && (
                          <div className="text-xs text-muted-foreground">servings</div>
                        )}
                      </td>
                      <td>
                        {d.grade_level === null
                          ? "All grade levels"
                          : getGradeLevelLabel(d.grade_level)}
                      </td>
                      <td>{d.delivered_on ?? "—"}</td>
                      <td className="text-right tabular-nums">{newCount}</td>
                      <td className="text-right tabular-nums">{replacement}</td>
                      <td className="text-right tabular-nums">{newCount + replacement}</td>
                      <td className="text-right tabular-nums">{rejected}</td>
                      <td>
                        {hot &&
                          SBFP_MEAL_KIND_OPTIONS.map((k) => {
                            const lines = d.meals.filter((m) => m.kind === k.value);
                            if (lines.length === 0) return null;
                            return (
                              <div key={k.value} className="text-xs">
                                <span className="text-muted-foreground">
                                  {k.value === "new"
                                    ? "New"
                                    : k.value === "replacement"
                                      ? "Replacement"
                                      : "Rejected"}
                                  :{" "}
                                </span>
                                {lines.map(mealLineLabel).join("; ")}
                              </div>
                            );
                          })}
                        {d.remarks}
                      </td>
                      {canManage && (
                        <td className="whitespace-nowrap text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit"
                            onClick={() => edit(d)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete"
                            onClick={() => handleDelete(d.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      )}
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
