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
import { Textarea } from "@/components/ui/textarea";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import {
  SBFP_KITCHEN_HYGIENE_ITEMS,
  SBFP_VEHICLE_ITEMS,
} from "@/lib/constants/sbfp";
import {
  dateTime,
  printSbfpKitchenLogs,
  type KitchenLogSheet,
} from "@/lib/pdf/generateSbfpForms";
import {
  deleteKitchenLog,
  fetchKitchenLogs,
  saveKitchenLog,
  type SbfpKitchenLog,
  type SbfpKitchenLogInput,
} from "@/lib/sbfp/queries";
import { todayIso } from "@/lib/utils/schoolCalendar";
import { countYes, schoolYearMonths } from "@/lib/utils/sbfp";
import { Loader2, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { buildSbfpHeaderInfo } from "../headerInfo";
import {
  ALL_MONTHS,
  canEditEntry,
  defaultMonth,
  districtSchools,
  fromLocalInput,
  KitchenSelect,
  kitchenName,
  localDay,
  MonthFilter,
  NoneYesSelect,
  nowLocalInput,
  SchoolDistrictPicker,
  toLocalInput,
  YesNoChecklist,
  type MonitoringPanelProps,
} from "./shared";

type Draft = Omit<SbfpKitchenLogInput, "logged_at"> & { logged_local: string };

const blankDraft = (kitchenId: string | null): Draft => ({
  logged_local: nowLocalInput(),
  kitchen_id: kitchenId,
  target_school_ids: [],
  actual_school_ids: [],
  has_excess_food: null,
  has_rejected_food: null,
  rejected_reason: "",
  hygiene_checklist: {},
  vehicle_checklist: {},
  delivery_personnel_name: "",
  remarks: "",
});

const HYGIENE_CODES = SBFP_KITCHEN_HYGIENE_ITEMS.map((i) => i.code);
const VEHICLE_CODES = SBFP_VEHICLE_ITEMS.map((i) => i.code);

export function KitchenLogPanel(props: MonitoringPanelProps) {
  const { schoolId, schoolYear, program, canLog, kitchens, schools } = props;
  const { settings } = useSchoolSettings(true, schoolId);
  const months = useMemo(() => schoolYearMonths(schoolYear), [schoolYear]);
  const [month, setMonth] = useState(() => defaultMonth(months, todayIso()));
  const [entries, setEntries] = useState<SbfpKitchenLog[]>([]);
  // A school that is itself a centralized kitchen files under its own kitchen.
  const ownKitchen = kitchens.find((k) => k.school_id === schoolId)?.id ?? null;
  const [draft, setDraft] = useState<Draft>(() => blankDraft(ownKitchen));
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    try {
      setEntries(await fetchKitchenLogs(program.id));
    } catch (err) {
      console.error("Error loading kitchen logs:", err);
      toast.error("Failed to load kitchen monitoring");
    }
  }, [program.id]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (isMounted) await load();
    })();
    return () => {
      isMounted = false;
    };
  }, [load]);

  const shown = useMemo(
    () =>
      month === ALL_MONTHS ? entries : entries.filter((e) => localDay(e.logged_at).startsWith(month)),
    [entries, month],
  );

  const handleSave = async () => {
    if (!draft.logged_local) {
      toast.error("Enter the date and time");
      return;
    }
    setSaving(true);
    try {
      const { logged_local, ...rest } = draft;
      await saveKitchenLog(program.id, { ...rest, logged_at: fromLocalInput(logged_local) });
      toast.success(draft.id ? "Entry updated" : "Entry saved");
      setDraft(blankDraft(draft.kitchen_id));
      await load();
    } catch (err) {
      console.error("Error saving kitchen log:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: SbfpKitchenLog) => {
    if (!window.confirm("Remove this entry?")) return;
    try {
      await deleteKitchenLog(e.id);
      if (draft.id === e.id) setDraft(blankDraft(ownKitchen));
      await load();
    } catch (err) {
      console.error("Error deleting kitchen log:", err);
      toast.error("Failed to delete");
    }
  };

  const sheet = (e: SbfpKitchenLog): KitchenLogSheet => ({
    loggedAt: e.logged_at,
    kitchenName: kitchenName(kitchens, e.kitchen_id),
    target: districtSchools(schools, e.target_school_ids),
    actual: districtSchools(schools, e.actual_school_ids),
    hasExcessFood: e.has_excess_food,
    hasRejectedFood: e.has_rejected_food,
    rejectedReason: e.rejected_reason,
    hygiene: e.hygiene_checklist,
    vehicle: e.vehicle_checklist,
    deliveryPersonnelName: e.delivery_personnel_name,
    remarks: e.remarks,
    preparedBy: e.created_by_name,
  });

  const print = async (list: SbfpKitchenLog[]) => {
    if (list.length === 0) {
      toast.error("No entries to print");
      return;
    }
    setPrinting(true);
    try {
      const info = await buildSbfpHeaderInfo(program, schoolId, schoolYear, settings);
      // Oldest first on paper.
      printSbfpKitchenLogs(info, [...list].reverse().map(sheet));
    } catch (err) {
      console.error("Error printing kitchen logs:", err);
      toast.error("Failed to generate the printout");
    } finally {
      setPrinting(false);
    }
  };

  const edit = (e: SbfpKitchenLog) => {
    setDraft({
      id: e.id,
      logged_local: toLocalInput(e.logged_at),
      kitchen_id: e.kitchen_id,
      target_school_ids: e.target_school_ids,
      actual_school_ids: e.actual_school_ids,
      has_excess_food: e.has_excess_food,
      has_rejected_food: e.has_rejected_food,
      rejected_reason: e.rejected_reason ?? "",
      hygiene_checklist: e.hygiene_checklist,
      vehicle_checklist: e.vehicle_checklist,
      delivery_personnel_name: e.delivery_personnel_name ?? "",
      remarks: e.remarks ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-4">
      {canLog && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {draft.id ? "Edit entry" : "SBFP Daily Monitoring Tool for Kitchens"}
            </CardTitle>
            <CardDescription>
              Filed by the kitchen each feeding day: the schools it prepared for,
              food handling, and the delivery vehicle.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Date and time</Label>
                <Input
                  type="datetime-local"
                  value={draft.logged_local}
                  onChange={(e) => setDraft((d) => ({ ...d, logged_local: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <KitchenSelect
                  kitchens={kitchens}
                  value={draft.kitchen_id}
                  onChange={(id) => setDraft((d) => ({ ...d, kitchen_id: id }))}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="text-sm font-semibold uppercase">Food preparation</div>
              <SchoolDistrictPicker
                label="Target number of schools to prepare for"
                schools={schools}
                value={draft.target_school_ids}
                onChange={(ids) => setDraft((d) => ({ ...d, target_school_ids: ids }))}
              />
              <div className="space-y-1">
                <SchoolDistrictPicker
                  label="Actual number of schools prepared for"
                  schools={schools}
                  value={draft.actual_school_ids}
                  onChange={(ids) => setDraft((d) => ({ ...d, actual_school_ids: ids }))}
                />
                {draft.target_school_ids.length > 0 && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="px-0"
                    onClick={() =>
                      setDraft((d) => ({ ...d, actual_school_ids: d.target_school_ids }))
                    }
                  >
                    Same as target
                  </Button>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <NoneYesSelect
                  label="Were there any excess food?"
                  value={draft.has_excess_food}
                  onChange={(v) => setDraft((d) => ({ ...d, has_excess_food: v }))}
                />
                <NoneYesSelect
                  label="Were there any rejected food?"
                  value={draft.has_rejected_food}
                  onChange={(v) => setDraft((d) => ({ ...d, has_rejected_food: v }))}
                />
                {draft.has_rejected_food && (
                  <div className="space-y-1.5">
                    <Label>If yes, reason</Label>
                    <Input
                      value={draft.rejected_reason ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, rejected_reason: e.target.value }))
                      }
                    />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Select Yes if the following indicators are observed, otherwise select No.
              </p>
              <YesNoChecklist
                group="kitchen-hygiene"
                items={SBFP_KITCHEN_HYGIENE_ITEMS}
                value={draft.hygiene_checklist}
                onChange={(v) => setDraft((d) => ({ ...d, hygiene_checklist: v }))}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold uppercase">Delivery vehicle inspection</div>
              <YesNoChecklist
                group="kitchen-vehicle"
                items={SBFP_VEHICLE_ITEMS}
                value={draft.vehicle_checklist}
                onChange={(v) => setDraft((d) => ({ ...d, vehicle_checklist: v }))}
                renderExtra={(it) =>
                  it.askName && draft.vehicle_checklist[it.code] ? (
                    <Input
                      className="mt-1.5 h-8"
                      placeholder="Name of delivery personnel"
                      value={draft.delivery_personnel_name ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, delivery_personnel_name: e.target.value }))
                      }
                    />
                  ) : null
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>General remarks, comments and suggestions</Label>
              <Textarea
                rows={3}
                value={draft.remarks ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, remarks: e.target.value }))}
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                {draft.id ? "Update" : "Save"}
              </Button>
              {draft.id && (
                <Button variant="ghost" onClick={() => setDraft(blankDraft(ownKitchen))}>
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthFilter months={months} value={month} onChange={setMonth} />
        <Button variant="outline" onClick={() => print(shown)} disabled={printing}>
          {printing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Printer className="h-4 w-4 mr-2" />
          )}
          Print {shown.length} entr{shown.length === 1 ? "y" : "ies"}
        </Button>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No entries recorded.</p>
      ) : (
        <div className="app__table_shell">
          <div className="app__table_wrapper">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left font-medium">Date and time</th>
                  <th className="text-left font-medium">Kitchen</th>
                  <th className="text-right font-medium">Target</th>
                  <th className="text-right font-medium">Actual</th>
                  <th className="text-left font-medium">Excess / rejected</th>
                  <th className="text-right font-medium">Hygiene</th>
                  <th className="text-right font-medium">Vehicle</th>
                  <th className="text-left font-medium">Recorded by</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap">{dateTime(e.logged_at)}</td>
                    <td>{kitchenName(kitchens, e.kitchen_id)}</td>
                    <td className="text-right tabular-nums">{e.target_school_ids.length}</td>
                    <td className="text-right tabular-nums">{e.actual_school_ids.length}</td>
                    <td className="text-xs">
                      Excess: {e.has_excess_food == null ? "—" : e.has_excess_food ? "Yes" : "None"}
                      <br />
                      Rejected:{" "}
                      {e.has_rejected_food == null ? "—" : e.has_rejected_food ? "Yes" : "None"}
                      {e.rejected_reason && ` (${e.rejected_reason})`}
                    </td>
                    <td className="text-right tabular-nums">
                      {countYes(e.hygiene_checklist, HYGIENE_CODES)}/{HYGIENE_CODES.length}
                    </td>
                    <td className="text-right tabular-nums">
                      {countYes(e.vehicle_checklist, VEHICLE_CODES)}/{VEHICLE_CODES.length}
                    </td>
                    <td className="text-xs text-muted-foreground">{e.created_by_name ?? ""}</td>
                    <td className="whitespace-nowrap text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Print"
                        onClick={() => print([e])}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                      {canEditEntry(props, e.created_by) && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit"
                            onClick={() => edit(e)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete"
                            onClick={() => handleDelete(e)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
