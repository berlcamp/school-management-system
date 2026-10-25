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
import { Textarea } from "@/components/ui/textarea";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import {
  SBFP_VEHICLE_OTHER,
  SBFP_VEHICLE_TYPES,
  SBFP_WEATHER_OPTIONS,
} from "@/lib/constants/sbfp";
import {
  dateTime,
  printSbfpDispatchLogs,
  time12,
  type DispatchLogSheet,
} from "@/lib/pdf/generateSbfpForms";
import {
  deleteDispatchLog,
  fetchDispatchLogs,
  fetchKitchenLogs,
  saveDispatchLog,
  type SbfpDispatchLog,
  type SbfpDispatchLogInput,
} from "@/lib/sbfp/queries";
import { todayIso } from "@/lib/utils/schoolCalendar";
import { schoolYearMonths } from "@/lib/utils/sbfp";
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
  nowLocalInput,
  SchoolDistrictPicker,
  toLocalInput,
  toTimeValue,
  type MonitoringPanelProps,
} from "./shared";

type Draft = Omit<SbfpDispatchLogInput, "logged_at"> & { logged_local: string };

const blankDraft = (kitchenId: string | null): Draft => ({
  logged_local: nowLocalInput(),
  kitchen_id: kitchenId,
  school_ids: [],
  vehicle_type: null,
  vehicle_other: "",
  departed_at: null,
  weather: null,
  remarks: "",
});

const NONE = "__none__";

/** A stored value no longer in the list still shows in the picker. */
const withStored = (list: readonly string[], stored: string | null) =>
  stored && !list.includes(stored) ? [...list, stored] : list;

export function vehicleLabel(e: Pick<SbfpDispatchLog, "vehicle_type" | "vehicle_other">): string {
  if (e.vehicle_type === SBFP_VEHICLE_OTHER) {
    return e.vehicle_other ? `Others: ${e.vehicle_other}` : "Others";
  }
  return e.vehicle_type ?? "";
}

export function DispatchLogPanel(props: MonitoringPanelProps) {
  const { schoolId, schoolYear, program, canLog, kitchens, schools } = props;
  const { settings } = useSchoolSettings(true, schoolId);
  const months = useMemo(() => schoolYearMonths(schoolYear), [schoolYear]);
  const [month, setMonth] = useState(() => defaultMonth(months, todayIso()));
  const [entries, setEntries] = useState<SbfpDispatchLog[]>([]);
  const ownKitchen = kitchens.find((k) => k.school_id === schoolId)?.id ?? null;
  const [draft, setDraft] = useState<Draft>(() => blankDraft(ownKitchen));
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    try {
      setEntries(await fetchDispatchLogs(program.id));
    } catch (err) {
      console.error("Error loading dispatch logs:", err);
      toast.error("Failed to load dispatch monitoring");
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

  /**
   * "Check the school/s assigned for dispatch (based from the selection
   * above)": the schools that kitchen prepared for that day, from its kitchen
   * log.
   */
  const copyFromKitchenLog = async () => {
    const day = draft.logged_local.slice(0, 10);
    try {
      const logs = await fetchKitchenLogs(program.id);
      const match = logs.find(
        (l) => localDay(l.logged_at) === day && l.kitchen_id === draft.kitchen_id,
      );
      if (!match) {
        toast.error("No kitchen monitoring entry for this kitchen on that day");
        return;
      }
      const ids = match.actual_school_ids.length > 0 ? match.actual_school_ids : match.target_school_ids;
      setDraft((d) => ({ ...d, school_ids: ids }));
      toast.success(`${ids.length} school(s) copied from the kitchen log`);
    } catch (err) {
      console.error("Error reading kitchen logs:", err);
      toast.error("Failed to read the kitchen log");
    }
  };

  const handleSave = async () => {
    if (!draft.logged_local) {
      toast.error("Enter the date and time");
      return;
    }
    setSaving(true);
    try {
      const { logged_local, ...rest } = draft;
      await saveDispatchLog(program.id, {
        ...rest,
        vehicle_other: rest.vehicle_type === SBFP_VEHICLE_OTHER ? rest.vehicle_other : null,
        logged_at: fromLocalInput(logged_local),
      });
      toast.success(draft.id ? "Entry updated" : "Entry saved");
      setDraft(blankDraft(draft.kitchen_id));
      await load();
    } catch (err) {
      console.error("Error saving dispatch log:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: SbfpDispatchLog) => {
    if (!window.confirm("Remove this entry?")) return;
    try {
      await deleteDispatchLog(e.id);
      if (draft.id === e.id) setDraft(blankDraft(ownKitchen));
      await load();
    } catch (err) {
      console.error("Error deleting dispatch log:", err);
      toast.error("Failed to delete");
    }
  };

  const sheet = (e: SbfpDispatchLog): DispatchLogSheet => ({
    loggedAt: e.logged_at,
    kitchenName: kitchenName(kitchens, e.kitchen_id),
    schools: districtSchools(schools, e.school_ids),
    vehicle: vehicleLabel(e),
    departedAt: e.departed_at,
    weather: e.weather,
    remarks: e.remarks,
    preparedBy: e.created_by_name,
  });

  const print = async (list: SbfpDispatchLog[]) => {
    if (list.length === 0) {
      toast.error("No entries to print");
      return;
    }
    setPrinting(true);
    try {
      const info = await buildSbfpHeaderInfo(program, schoolId, schoolYear, settings);
      printSbfpDispatchLogs(info, [...list].reverse().map(sheet));
    } catch (err) {
      console.error("Error printing dispatch logs:", err);
      toast.error("Failed to generate the printout");
    } finally {
      setPrinting(false);
    }
  };

  const edit = (e: SbfpDispatchLog) => {
    setDraft({
      id: e.id,
      logged_local: toLocalInput(e.logged_at),
      kitchen_id: e.kitchen_id,
      school_ids: e.school_ids,
      vehicle_type: e.vehicle_type,
      vehicle_other: e.vehicle_other ?? "",
      departed_at: e.departed_at,
      weather: e.weather,
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
              {draft.id ? "Edit entry" : "SBFP Food Dispatch Daily Monitoring Tool"}
            </CardTitle>
            <CardDescription>
              Filed when the food leaves the kitchen: the schools it goes to, the
              vehicle, the time of departure and the weather.
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

            <div className="space-y-1">
              <SchoolDistrictPicker
                label="Check the school/s assigned for dispatch"
                schools={schools}
                value={draft.school_ids}
                onChange={(ids) => setDraft((d) => ({ ...d, school_ids: ids }))}
              />
              <Button
                type="button"
                variant="link"
                size="sm"
                className="px-0"
                onClick={copyFromKitchenLog}
              >
                Use the schools from this kitchen&apos;s monitoring entry that day
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Type of vehicle assigned</Label>
                <Select
                  value={draft.vehicle_type ?? NONE}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, vehicle_type: v === NONE ? null : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {withStored(SBFP_VEHICLE_TYPES, draft.vehicle_type).map((v) => (
                      <SelectItem key={v} value={v}>
                        {v === SBFP_VEHICLE_OTHER ? "Others, specify" : v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {draft.vehicle_type === SBFP_VEHICLE_OTHER && (
                <div className="space-y-1.5">
                  <Label>Specify vehicle</Label>
                  <Input
                    value={draft.vehicle_other ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, vehicle_other: e.target.value }))}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Time of departure</Label>
                <Input
                  type="time"
                  step={1}
                  value={draft.departed_at ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, departed_at: toTimeValue(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Weather during dispatch</Label>
                <Select
                  value={draft.weather ?? NONE}
                  onValueChange={(v) => setDraft((d) => ({ ...d, weather: v === NONE ? null : v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {withStored(SBFP_WEATHER_OPTIONS, draft.weather).map((w) => (
                      <SelectItem key={w} value={w}>
                        {w}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Remarks</Label>
              <Textarea
                rows={2}
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
                  <th className="text-right font-medium">Schools</th>
                  <th className="text-left font-medium">Vehicle</th>
                  <th className="text-left font-medium">Departure</th>
                  <th className="text-left font-medium">Weather</th>
                  <th className="text-left font-medium">Recorded by</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap">{dateTime(e.logged_at)}</td>
                    <td>{kitchenName(kitchens, e.kitchen_id)}</td>
                    <td className="text-right tabular-nums">{e.school_ids.length}</td>
                    <td>{vehicleLabel(e)}</td>
                    <td className="whitespace-nowrap">{time12(e.departed_at)}</td>
                    <td>{e.weather ?? ""}</td>
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
