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
import { Skeleton } from "@/components/ui/skeleton";
import {
  SBFP_FEEDING_CODES,
  SBFP_FEEDING_LEGEND,
} from "@/lib/constants/sbfp";
import {
  fetchBeneficiaryViews,
  fetchFeedingDays,
  fetchFeedingRecords,
  saveFeedingRecords,
  setFeedingDays,
} from "@/lib/sbfp/queries";
import { cn } from "@/lib/utils";
import {
  describeDay,
  fetchSchoolCalendar,
  getCalendarDaysInMonth,
  todayIso,
  type ResolvedDay,
} from "@/lib/utils/schoolCalendar";
import {
  feedingDaysInMonth,
  isPresentCode,
  schoolYearMonths,
  type SbfpBeneficiaryView,
} from "@/lib/utils/sbfp";
import { Loader2, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { sectionOptionLabel, type SbfpTabProps } from "./types";

const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return MONTH_FMT.format(new Date(y, m - 1, 1));
}

/** `${beneficiaryId}|${date}` */
const cellKey = (id: string, date: string) => `${id}|${date}`;

export function FeedingTab({
  schoolId,
  schoolYear,
  program,
  sections,
  canManage,
  recordableSectionIds,
  actorId,
}: SbfpTabProps) {
  const months = useMemo(() => schoolYearMonths(schoolYear), [schoolYear]);
  const [month, setMonth] = useState(() => {
    const now = todayIso().slice(0, 7);
    const start = program?.feeding_start_date?.slice(0, 7);
    return months.includes(now) ? now : (start && months.includes(start) ? start : months[0]);
  });
  const [calendarDays, setCalendarDays] = useState<ResolvedDay[]>([]);
  const [feedingDays, setFeedingDaysState] = useState<string[]>([]);
  const [dayDraft, setDayDraft] = useState<Set<string>>(new Set());
  const [savingDays, setSavingDays] = useState(false);

  const visibleSections = useMemo(() => {
    const own = sections.filter((s) => recordableSectionIds.has(s.id));
    return own.length > 0 ? own : sections;
  }, [sections, recordableSectionIds]);
  const [sectionId, setSectionId] = useState("");
  const canEdit = recordableSectionIds.has(sectionId);

  const [rows, setRows] = useState<SbfpBeneficiaryView[]>([]);
  const [stored, setStored] = useState<Map<string, string>>(new Map());
  const [draft, setDraft] = useState<Map<string, string>>(new Map());
  const [fillCode, setFillCode] = useState<string>("H");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!sectionId && visibleSections.length > 0) setSectionId(visibleSections[0].id);
  }, [sectionId, visibleSections]);

  // The school calendar and the programme's feeding days.
  useEffect(() => {
    if (!program) return;
    let isMounted = true;
    (async () => {
      const [entries, days] = await Promise.all([
        fetchSchoolCalendar(schoolId, schoolYear),
        fetchFeedingDays(program.id),
      ]);
      if (!isMounted) return;
      setCalendarDays(getCalendarDaysInMonth(month, entries));
      setFeedingDaysState(days);
      setDayDraft(new Set(feedingDaysInMonth(days, month)));
    })().catch((err) => {
      console.error("Error loading feeding days:", err);
      toast.error("Failed to load feeding days");
    });
    return () => {
      isMounted = false;
    };
  }, [program, schoolId, schoolYear, month]);

  const monthDays = useMemo(() => feedingDaysInMonth(feedingDays, month), [feedingDays, month]);

  // The section's beneficiaries and this month's codes.
  const loadGrid = useCallback(async () => {
    if (!program || !sectionId) return;
    setLoading(true);
    try {
      const views = await fetchBeneficiaryViews(program, sectionId);
      const [y, m] = month.split("-").map(Number);
      const last = new Date(y, m, 0).getDate();
      const records = await fetchFeedingRecords(
        views.map((v) => v.id),
        { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` },
      );
      const flat = new Map<string, string>();
      for (const [id, byDate] of records) {
        for (const [date, code] of byDate) flat.set(cellKey(id, date), code);
      }
      setRows(views);
      setStored(flat);
      setDraft(new Map(flat));
    } catch (err) {
      console.error("Error loading feeding records:", err);
      toast.error("Failed to load feeding records");
    } finally {
      setLoading(false);
    }
  }, [program, sectionId, month]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (isMounted) await loadGrid();
    })();
    return () => {
      isMounted = false;
    };
  }, [loadGrid]);

  const changes = useMemo(() => {
    const out: { beneficiaryId: string; date: string; code: string }[] = [];
    const keys = new Set([...stored.keys(), ...draft.keys()]);
    for (const k of keys) {
      const before = stored.get(k) ?? "";
      const after = draft.get(k) ?? "";
      if (before !== after) {
        const [beneficiaryId, date] = k.split("|");
        out.push({ beneficiaryId, date, code: after });
      }
    }
    return out;
  }, [stored, draft]);

  const setCell = (id: string, date: string, code: string) =>
    setDraft((prev) => {
      const next = new Map(prev);
      if (code) next.set(cellKey(id, date), code);
      else next.delete(cellKey(id, date));
      return next;
    });

  const fillBlanks = () =>
    setDraft((prev) => {
      const next = new Map(prev);
      for (const r of rows) {
        for (const d of monthDays) {
          if (!next.has(cellKey(r.id, d))) next.set(cellKey(r.id, d), fillCode);
        }
      }
      return next;
    });

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveFeedingRecords(changes, actorId);
      toast.success(`Saved ${changes.length} cell(s)`);
      await loadGrid();
    } catch (err) {
      console.error("Error saving feeding records:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const dayChanges = useMemo(() => {
    const current = new Set(monthDays);
    return {
      add: [...dayDraft].filter((d) => !current.has(d)),
      remove: monthDays.filter((d) => !dayDraft.has(d)),
    };
  }, [dayDraft, monthDays]);

  const handleSaveDays = async () => {
    if (!program) return;
    setSavingDays(true);
    try {
      await setFeedingDays(program.id, dayChanges.add, dayChanges.remove);
      const days = await fetchFeedingDays(program.id);
      setFeedingDaysState(days);
      setDayDraft(new Set(feedingDaysInMonth(days, month)));
      toast.success("Feeding days saved");
    } catch (err) {
      console.error("Error saving feeding days:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingDays(false);
    }
  };

  const toggleDay = (date: string) =>
    setDayDraft((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Month</label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>
                  {monthLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feeding days — {monthLabel(month)}</CardTitle>
          <CardDescription>
            The days food was served. They are Form 1B&apos;s &ldquo;Feeding Days
            (B)&rdquo; and Form 3&apos;s day columns.{" "}
            {canManage
              ? "Click a date to add or remove it."
              : "Set by the focal person or school head."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {calendarDays.map((d) => {
              const on = dayDraft.has(d.date);
              const closed = !d.am && !d.pm;
              return (
                <button
                  key={d.date}
                  type="button"
                  disabled={!canManage}
                  title={closed ? describeDay(d) : d.date}
                  onClick={() => toggleDay(d.date)}
                  className={cn(
                    "h-9 w-11 rounded-md border text-xs tabular-nums transition-colors",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted",
                    closed && !on && "text-muted-foreground line-through",
                    !canManage && "cursor-default",
                  )}
                >
                  {Number(d.date.slice(8, 10))}
                  <div className="text-[9px] leading-none opacity-70">
                    {new Date(d.date + "T00:00:00").toLocaleDateString("en-US", {
                      weekday: "short",
                    })}
                  </div>
                </button>
              );
            })}
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setDayDraft(
                    new Set(calendarDays.filter((d) => d.am || d.pm).map((d) => d.date)),
                  )
                }
              >
                Mark every school day
              </Button>
              <Button
                size="sm"
                onClick={handleSaveDays}
                disabled={savingDays || (dayChanges.add.length === 0 && dayChanges.remove.length === 0)}
              >
                {savingDays && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save feeding days
              </Button>
              {dayChanges.remove.length > 0 && (
                <span className="text-xs text-muted-foreground self-center">
                  Codes already recorded on a removed day are kept but no longer counted.
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {monthDays.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No feeding days in {monthLabel(month)} yet.
        </p>
      ) : loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No beneficiaries in this section. Select them on the Beneficiaries tab.
        </p>
      ) : (
        <>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Fill blank cells with</span>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={fillCode}
                onChange={(e) => setFillCode(e.target.value)}
                aria-label="Code to fill"
              >
                {SBFP_FEEDING_CODES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={fillBlanks}>
                Fill
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || changes.length === 0}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save{changes.length > 0 ? ` (${changes.length})` : ""}
              </Button>
            </div>
          )}

          <div className="app__table_shell">
            <div className="app__table_wrapper overflow-x-auto">
              <table className="text-xs">
                <thead>
                  <tr>
                    <th className="text-left font-medium sticky left-0 bg-background">
                      Name of pupils
                    </th>
                    <th className="font-medium">Sex</th>
                    {monthDays.map((d) => (
                      <th key={d} className="font-medium tabular-nums px-1">
                        {Number(d.slice(8, 10))}
                      </th>
                    ))}
                    <th className="font-medium">Present</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const present = monthDays.filter((d) =>
                      isPresentCode(draft.get(cellKey(r.id, d))),
                    ).length;
                    return (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap sticky left-0 bg-background">
                          {r.name}
                        </td>
                        <td className="text-center">
                          {r.sex === "male" ? "M" : r.sex === "female" ? "F" : ""}
                        </td>
                        {monthDays.map((d) => {
                          const value = draft.get(cellKey(r.id, d)) ?? "";
                          const changed = value !== (stored.get(cellKey(r.id, d)) ?? "");
                          return (
                            <td key={d} className="p-0.5">
                              <select
                                className={cn(
                                  "h-7 w-14 rounded border bg-background text-center text-xs",
                                  value === "A" && "text-destructive",
                                  changed && "border-amber-500",
                                )}
                                value={value}
                                disabled={!canEdit}
                                onChange={(e) => setCell(r.id, d, e.target.value)}
                                aria-label={`${r.name} ${d}`}
                              >
                                <option value=""></option>
                                {SBFP_FEEDING_CODES.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        })}
                        <td className="text-center tabular-nums">
                          {present}/{monthDays.length}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="text-xs text-muted-foreground space-y-0.5">
            {SBFP_FEEDING_LEGEND.map((l) => (
              <div key={l.code}>
                <span className="font-medium">({l.code})</span> — {l.meaning}
              </div>
            ))}
            <div>A blank cell is not recorded and does not count as present.</div>
          </div>
        </>
      )}
    </div>
  );
}
