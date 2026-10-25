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
  SBFP_CONDITION_RATINGS,
  SBFP_FOOD_CONDITION_ITEMS,
  SBFP_RECEIVING_SAFETY_ITEMS,
  SBFP_WEATHER_OPTIONS,
} from "@/lib/constants/sbfp";
import {
  mdy,
  printSbfpReceivingLogs,
  time12,
  type ReceivingLogSheet,
} from "@/lib/pdf/generateSbfpForms";
import {
  countBeneficiaries,
  deleteReceivingLog,
  feedingDayAttendance,
  fetchFeedback,
  fetchReceivingLogs,
  saveReceivingLog,
  type SbfpFeedback,
  type SbfpReceivingLog,
  type SbfpReceivingLogInput,
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
  MonthFilter,
  NoneYesSelect,
  toTimeValue,
  YesNoChecklist,
  type MonitoringPanelProps,
} from "./shared";

const blankDraft = (total: number | null): SbfpReceivingLogInput => ({
  received_on: todayIso(),
  arrived_at: null,
  weather: null,
  delivery_remarks: "",
  food_condition: {},
  condition_remarks: "",
  sets_expected: null,
  sets_received: null,
  sets_damaged: 0,
  sets_rejected: 0,
  sets_additional: 0,
  safety_checklist: {},
  total_beneficiaries: total,
  present_beneficiaries: null,
  absent_beneficiaries: 0,
  meals_consumed: null,
  leftover_meals: 0,
  additional_serving_requests: 0,
  has_incident: null,
  incident_details: "",
  remarks: "",
});

const NONE = "__none__";
const SAFETY_CODES = SBFP_RECEIVING_SAFETY_ITEMS.map((i) => i.code);

const withStored = (list: readonly string[], stored: string | null) =>
  stored && !list.includes(stored) ? [...list, stored] : list;

const optCount = (v: string): number | null =>
  v === "" ? null : Math.max(0, Math.trunc(Number(v) || 0));
const reqCount = (v: string): number => Math.max(0, Math.trunc(Number(v) || 0));

function CountField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number | null;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        min={0}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ReceivingLogPanel(props: MonitoringPanelProps) {
  const { schoolId, schoolYear, program, canLog } = props;
  const { settings } = useSchoolSettings(true, schoolId);
  const months = useMemo(() => schoolYearMonths(schoolYear), [schoolYear]);
  const [month, setMonth] = useState(() => defaultMonth(months, todayIso()));
  const [entries, setEntries] = useState<SbfpReceivingLog[]>([]);
  const [feedback, setFeedback] = useState<SbfpFeedback[]>([]);
  const [beneficiaryTotal, setBeneficiaryTotal] = useState<number | null>(null);
  const [draft, setDraft] = useState<SbfpReceivingLogInput>(() => blankDraft(null));
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [filling, setFilling] = useState(false);

  const load = useCallback(async () => {
    try {
      const [logs, fb, total] = await Promise.all([
        fetchReceivingLogs(program.id),
        fetchFeedback(program.id),
        countBeneficiaries(program.id),
      ]);
      setEntries(logs);
      setFeedback(fb);
      setBeneficiaryTotal(total);
      // "Total Beneficiaries (auto populate)" — only on a fresh form.
      setDraft((d) => (d.id || d.total_beneficiaries != null ? d : { ...d, total_beneficiaries: total }));
    } catch (err) {
      console.error("Error loading receiving logs:", err);
      toast.error("Failed to load receiving monitoring");
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
      month === ALL_MONTHS ? entries : entries.filter((e) => e.received_on.startsWith(month)),
    [entries, month],
  );

  // Issues logged on the Feedback Mechanism tab for the same day.
  const sameDayFeedback = useMemo(
    () => feedback.filter((f) => f.received_on === draft.received_on),
    [feedback, draft.received_on],
  );

  const setPresent = (v: string) =>
    setDraft((d) => {
      const present = optCount(v);
      const total = d.total_beneficiaries;
      return {
        ...d,
        present_beneficiaries: present,
        absent_beneficiaries:
          present != null && total != null ? Math.max(0, total - present) : d.absent_beneficiaries,
      };
    });

  const fillFromDailyFeeding = async () => {
    setFilling(true);
    try {
      const att = await feedingDayAttendance(program.id, draft.received_on);
      if (!att) {
        toast.error("No Daily Feeding codes recorded for that day");
        return;
      }
      setDraft((d) => ({
        ...d,
        present_beneficiaries: att.present,
        absent_beneficiaries: att.absent,
      }));
      toast.success("Present and absent filled from Daily Feeding");
    } catch (err) {
      console.error("Error reading daily feeding:", err);
      toast.error("Failed to read Daily Feeding");
    } finally {
      setFilling(false);
    }
  };

  const copyFeedback = () =>
    setDraft((d) => ({
      ...d,
      has_incident: true,
      incident_details: [
        d.incident_details?.trim(),
        ...sameDayFeedback.map((f) =>
          [f.concern, f.action_taken ? `Action taken: ${f.action_taken}` : ""]
            .filter(Boolean)
            .join(" — "),
        ),
      ]
        .filter(Boolean)
        .join("\n"),
    }));

  const handleSave = async () => {
    if (!draft.received_on) {
      toast.error("Enter the date");
      return;
    }
    setSaving(true);
    try {
      await saveReceivingLog(program.id, draft);
      toast.success(draft.id ? "Entry updated" : "Entry saved");
      setDraft(blankDraft(beneficiaryTotal));
      await load();
    } catch (err) {
      console.error("Error saving receiving log:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: SbfpReceivingLog) => {
    if (!window.confirm("Remove this entry?")) return;
    try {
      await deleteReceivingLog(e.id);
      if (draft.id === e.id) setDraft(blankDraft(beneficiaryTotal));
      await load();
    } catch (err) {
      console.error("Error deleting receiving log:", err);
      toast.error("Failed to delete");
    }
  };

  const sheet = (e: SbfpReceivingLog): ReceivingLogSheet => ({
    receivedOn: e.received_on,
    arrivedAt: e.arrived_at,
    weather: e.weather,
    deliveryRemarks: e.delivery_remarks,
    foodCondition: e.food_condition,
    conditionRemarks: e.condition_remarks,
    setsExpected: e.sets_expected,
    setsReceived: e.sets_received,
    setsDamaged: e.sets_damaged,
    setsRejected: e.sets_rejected,
    setsAdditional: e.sets_additional,
    safety: e.safety_checklist,
    totalBeneficiaries: e.total_beneficiaries,
    presentBeneficiaries: e.present_beneficiaries,
    absentBeneficiaries: e.absent_beneficiaries,
    mealsConsumed: e.meals_consumed,
    leftoverMeals: e.leftover_meals,
    additionalServingRequests: e.additional_serving_requests,
    hasIncident: e.has_incident,
    incidentDetails: e.incident_details,
    remarks: e.remarks,
    preparedBy: e.created_by_name,
  });

  const print = async (list: SbfpReceivingLog[]) => {
    if (list.length === 0) {
      toast.error("No entries to print");
      return;
    }
    setPrinting(true);
    try {
      const info = await buildSbfpHeaderInfo(program, schoolId, schoolYear, settings);
      printSbfpReceivingLogs(info, [...list].reverse().map(sheet));
    } catch (err) {
      console.error("Error printing receiving logs:", err);
      toast.error("Failed to generate the printout");
    } finally {
      setPrinting(false);
    }
  };

  const edit = (e: SbfpReceivingLog) => {
    // The save writes only the form's fields, so the author columns ride along unused.
    setDraft({ ...e });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-4">
      {canLog && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {draft.id
                ? "Edit entry"
                : "SBFP School Recipient Daily Receiving and Feeding Monitoring Tool"}
            </CardTitle>
            <CardDescription>
              Filed by the receiving school each feeding day: the delivery, the food&apos;s
              condition and quantity, safety compliance and how many learners ate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              <div className="text-sm font-semibold uppercase">Delivery monitoring</div>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={draft.received_on}
                    onChange={(e) => setDraft((d) => ({ ...d, received_on: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Time food arrived</Label>
                  <Input
                    type="time"
                    step={1}
                    value={draft.arrived_at ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, arrived_at: toTimeValue(e.target.value) }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Weather during arrival</Label>
                  <Select
                    value={draft.weather ?? NONE}
                    onValueChange={(v) =>
                      setDraft((d) => ({ ...d, weather: v === NONE ? null : v }))
                    }
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
                <Label>Remarks on delivery, if any</Label>
                <Textarea
                  rows={2}
                  value={draft.delivery_remarks ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, delivery_remarks: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold uppercase">Food condition upon receipt</div>
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left font-medium px-3 py-1.5"></th>
                      {SBFP_CONDITION_RATINGS.map((r) => (
                        <th key={r.value} className="w-20 font-medium">
                          {r.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SBFP_FOOD_CONDITION_ITEMS.map((it) => (
                      <tr key={it.code} className="border-b last:border-0">
                        <td className="px-3 py-1.5">{it.label}</td>
                        {SBFP_CONDITION_RATINGS.map((r) => (
                          <td key={r.value} className="text-center py-1.5">
                            <input
                              type="radio"
                              className="h-4 w-4"
                              name={`cond-${it.code}`}
                              aria-label={`${it.label}: ${r.label}`}
                              checked={draft.food_condition[it.code] === r.value}
                              onChange={() =>
                                setDraft((d) => ({
                                  ...d,
                                  food_condition: { ...d.food_condition, [it.code]: r.value },
                                }))
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-1.5">
                <Label>Remarks on food condition, if any</Label>
                <Textarea
                  rows={2}
                  value={draft.condition_remarks ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, condition_remarks: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold uppercase">Quantity verification</div>
              <div className="grid gap-3 md:grid-cols-5">
                <CountField
                  label="Number of sets expected"
                  value={draft.sets_expected}
                  onChange={(v) => setDraft((d) => ({ ...d, sets_expected: optCount(v) }))}
                />
                <CountField
                  label="Number of sets received"
                  value={draft.sets_received}
                  onChange={(v) => setDraft((d) => ({ ...d, sets_received: optCount(v) }))}
                />
                <CountField
                  label="Number of damaged sets"
                  value={draft.sets_damaged}
                  hint="0 for none"
                  onChange={(v) => setDraft((d) => ({ ...d, sets_damaged: reqCount(v) }))}
                />
                <CountField
                  label="Number of rejected sets"
                  value={draft.sets_rejected}
                  hint="0 for none"
                  onChange={(v) => setDraft((d) => ({ ...d, sets_rejected: reqCount(v) }))}
                />
                <CountField
                  label="Number of additional sets"
                  value={draft.sets_additional}
                  hint="0 for none"
                  onChange={(v) => setDraft((d) => ({ ...d, sets_additional: reqCount(v) }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold uppercase">
                Food safety and handling compliance
              </div>
              <p className="text-xs text-muted-foreground">
                Select Yes if the following indicators are observed, otherwise select No.
              </p>
              <YesNoChecklist
                group="receiving-safety"
                items={SBFP_RECEIVING_SAFETY_ITEMS}
                value={draft.safety_checklist}
                onChange={(v) => setDraft((d) => ({ ...d, safety_checklist: v }))}
              />
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold uppercase">Beneficiary monitoring</div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={fillFromDailyFeeding}
                  disabled={filling}
                >
                  {filling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Fill present / absent from Daily Feeding
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <CountField
                  label="Total beneficiaries"
                  value={draft.total_beneficiaries}
                  hint={
                    beneficiaryTotal != null
                      ? `${beneficiaryTotal} on the beneficiary list`
                      : undefined
                  }
                  onChange={(v) => setDraft((d) => ({ ...d, total_beneficiaries: optCount(v) }))}
                />
                <CountField
                  label="Present beneficiaries"
                  value={draft.present_beneficiaries}
                  onChange={setPresent}
                />
                <CountField
                  label="Absent beneficiaries"
                  value={draft.absent_beneficiaries}
                  hint="0 for none"
                  onChange={(v) => setDraft((d) => ({ ...d, absent_beneficiaries: reqCount(v) }))}
                />
                <CountField
                  label="Meals consumed"
                  value={draft.meals_consumed}
                  onChange={(v) => setDraft((d) => ({ ...d, meals_consumed: optCount(v) }))}
                />
                <CountField
                  label="Left-over meals"
                  value={draft.leftover_meals}
                  hint="0 for none"
                  onChange={(v) => setDraft((d) => ({ ...d, leftover_meals: reqCount(v) }))}
                />
                <CountField
                  label="Learners who requested additional serving"
                  value={draft.additional_serving_requests}
                  hint="0 for none"
                  onChange={(v) =>
                    setDraft((d) => ({ ...d, additional_serving_requests: reqCount(v) }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold uppercase">Incident report</div>
              <div className="grid gap-3 md:grid-cols-3">
                <NoneYesSelect
                  label="Were there any issues observed for the day?"
                  value={draft.has_incident}
                  noLabel="No"
                  onChange={(v) => setDraft((d) => ({ ...d, has_incident: v }))}
                />
              </div>
              {sameDayFeedback.length > 0 && (
                <div className="rounded-md border border-dashed p-2 text-xs space-y-1">
                  <div className="font-medium">
                    {sameDayFeedback.length} issue(s) logged on the Feedback Mechanism tab for
                    this day:
                  </div>
                  <ul className="list-disc pl-5">
                    {sameDayFeedback.map((f) => (
                      <li key={f.id}>{f.concern}</li>
                    ))}
                  </ul>
                  <Button type="button" variant="link" size="sm" className="px-0 h-auto" onClick={copyFeedback}>
                    Copy into the incident report
                  </Button>
                </div>
              )}
              {draft.has_incident && (
                <div className="space-y-1.5">
                  <Label>Brief information and the actions taken by the school</Label>
                  <Textarea
                    rows={3}
                    value={draft.incident_details ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, incident_details: e.target.value }))
                    }
                  />
                </div>
              )}
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
                <Button variant="ghost" onClick={() => setDraft(blankDraft(beneficiaryTotal))}>
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
                  <th className="text-left font-medium">Date</th>
                  <th className="text-left font-medium">Arrived</th>
                  <th className="text-right font-medium">Sets exp. / rec.</th>
                  <th className="text-right font-medium">Present / total</th>
                  <th className="text-right font-medium">Consumed</th>
                  <th className="text-right font-medium">Left-over</th>
                  <th className="text-right font-medium">Safety</th>
                  <th className="text-left font-medium">Incident</th>
                  <th className="text-left font-medium">Recorded by</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap">{mdy(e.received_on)}</td>
                    <td className="whitespace-nowrap">{time12(e.arrived_at)}</td>
                    <td className="text-right tabular-nums">
                      {e.sets_expected ?? "—"} / {e.sets_received ?? "—"}
                    </td>
                    <td className="text-right tabular-nums">
                      {e.present_beneficiaries ?? "—"} / {e.total_beneficiaries ?? "—"}
                    </td>
                    <td className="text-right tabular-nums">{e.meals_consumed ?? "—"}</td>
                    <td className="text-right tabular-nums">{e.leftover_meals}</td>
                    <td className="text-right tabular-nums">
                      {countYes(e.safety_checklist, SAFETY_CODES)}/{SAFETY_CODES.length}
                    </td>
                    <td>{e.has_incident == null ? "—" : e.has_incident ? "Yes" : "No"}</td>
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
