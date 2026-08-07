"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import {
  CALENDAR_DAY_TYPE_LABELS,
  CALENDAR_PERIOD_LABELS,
  CalendarDayType,
  CalendarPeriod,
  SchoolCalendarDay,
} from "@/lib/utils/schoolCalendar";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface CalendarDayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** NULL writes a division-wide entry */
  schoolId: string | null;
  schoolYear: string;
  editData?: SchoolCalendarDay;
  createdBy: string | number | null | undefined;
}

const DAY_TYPES: CalendarDayType[] = ["holiday", "no_class", "suspension", "class_day"];
const PERIODS: CalendarPeriod[] = ["whole", "am", "pm"];

export function CalendarDayModal({
  open,
  onOpenChange,
  onSaved,
  schoolId,
  schoolYear,
  editData,
  createdBy,
}: CalendarDayModalProps) {
  const [title, setTitle] = useState("");
  const [dayType, setDayType] = useState<CalendarDayType>("holiday");
  const [period, setPeriod] = useState<CalendarPeriod>("whole");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(editData?.title ?? "");
    setDayType(editData?.day_type ?? "holiday");
    setPeriod(editData?.period ?? "whole");
    setStartDate(editData?.start_date ?? "");
    setEndDate(editData?.end_date ?? "");
  }, [open, editData]);

  // A single date is the common case: leaving the end blank means "just this day".
  const effectiveEnd = endDate || startDate;
  const rangeInvalid = Boolean(startDate && effectiveEnd && effectiveEnd < startDate);

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Give the entry a title.");
      return;
    }
    if (!startDate) {
      toast.error("Pick a date.");
      return;
    }
    if (rangeInvalid) {
      toast.error("The end date cannot be before the start date.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        school_id: schoolId,
        school_year: schoolYear,
        start_date: startDate,
        end_date: effectiveEnd,
        day_type: dayType,
        period,
        title: title.trim(),
      };

      const { error } = editData
        ? await supabase
            .from("sms_school_calendar_days")
            .update(payload)
            .eq("id", editData.id)
        : await supabase
            .from("sms_school_calendar_days")
            .insert({ ...payload, created_by: createdBy ?? null });

      if (error) throw error;

      toast.success(editData ? "Calendar entry updated." : "Calendar entry added.");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save calendar entry:", err);
      toast.error("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editData ? "Edit calendar entry" : "Add calendar entry"}
          </DialogTitle>
          <DialogDescription>
            {schoolId === null
              ? "Division-wide — every school in the division inherits this entry."
              : "Applies to this school only."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cal-title">Title</Label>
            <Input
              id="cal-title"
              placeholder="e.g. Araw ng Kagitingan / Enrolment week"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={dayType}
                onValueChange={(v) => setDayType(v as CalendarDayType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {CALENDAR_DAY_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Session</Label>
              <Select
                value={period}
                onValueChange={(v) => setPeriod(v as CalendarPeriod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {CALENDAR_PERIOD_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cal-start">Start date</Label>
              <Input
                id="cal-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cal-end">End date</Label>
              <Input
                id="cal-end"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank for a single day.
              </p>
            </div>
          </div>

          {dayType === "class_day" && (
            <p className="text-xs text-muted-foreground rounded-md border border-border bg-muted/40 p-2.5">
              A class day overrides any holiday or suspension covering the same
              date — use it for make-up classes, including on a Saturday.
            </p>
          )}
          {rangeInvalid && (
            <p className="text-xs text-destructive">
              The end date cannot be before the start date.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
