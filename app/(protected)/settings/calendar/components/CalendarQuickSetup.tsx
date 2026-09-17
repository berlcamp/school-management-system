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
import {
  HolidaySeed,
  philippineHolidaysForSchoolYear,
} from "@/lib/constants/philippineHolidays";
import { supabase } from "@/lib/supabase/client";
import {
  datesNeedingEntry,
  isWithinSchoolYear,
  preOpeningRange,
  SchoolCalendarDay,
  schoolYearWindow,
} from "@/lib/utils/schoolCalendar";
import { CalendarPlus, Flag, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";

/**
 * The two entries every school year needs before any class-day count is right,
 * done in one click each.
 *
 * Both are ordinary calendar rows — nothing here is a new kind of record, and
 * anything written is edited or deleted from the lists below like any other
 * entry. They exist because doing them by hand is fifteen modal round trips a
 * school head does once a year and therefore does not do, after which June
 * reports 22 class days for a month that opened on the 8th.
 *
 * **Additive only.** Neither action edits or removes an entry that is already
 * there (the one exception being the pre-opening row this same card wrote, so
 * a corrected opening date moves it instead of stacking a second one), and
 * `datesNeedingEntry` drops any date the calendar already closes — whether by
 * an existing row, a division-wide one this school inherits, or by being a
 * weekend, which needs no entry to be a non-class day.
 */

/** Title of the row the opening-date action writes, so it can be moved later. */
const PRE_OPENING_TITLE = "Before class opening";

interface CalendarQuickSetupProps {
  /** The user's own school, or NULL for a division user with no school. */
  schoolId: string | null;
  canManageDivision: boolean;
  schoolYear: string;
  /** Every entry in scope — this school's and the division's — for dedup. */
  entries: SchoolCalendarDay[];
  createdBy: string | number | null | undefined;
  onSaved: () => void;
}

export function CalendarQuickSetup({
  schoolId,
  canManageDivision,
  schoolYear,
  entries,
  createdBy,
  onSaved,
}: CalendarQuickSetupProps) {
  // A division user with no active school can only write division-wide rows; a
  // school-level user only their own school's. Someone who can do both picks.
  const canChooseScope = canManageDivision && schoolId != null;
  const [scope, setScope] = useState<"school" | "division">(
    schoolId != null ? "school" : "division",
  );
  // Defensive rather than cosmetic: a school-level role cannot write a
  // division-wide row (migration 125's INSERT policy requires school_id IS NOT
  // NULL for them), so the scope is pinned to what the user may actually write
  // however the selector's state started out.
  const targetSchoolId =
    schoolId == null ? null : canChooseScope && scope === "division" ? null : schoolId;

  const [openingDate, setOpeningDate] = useState("");
  const [savingOpening, setSavingOpening] = useState(false);
  const [holidayPreview, setHolidayPreview] = useState(false);
  const [savingHolidays, setSavingHolidays] = useState(false);

  const syWindow = schoolYearWindow(schoolYear);

  // Holidays the calendar does not already close, in this school year.
  const pendingHolidays = useMemo<HolidaySeed[]>(() => {
    const seeds = philippineHolidaysForSchoolYear(schoolYear);
    const needed = new Set(
      datesNeedingEntry(
        seeds.map((h) => h.date),
        entries,
      ),
    );
    return seeds.filter((h) => needed.has(h.date));
  }, [schoolYear, entries]);

  const handleOpening = async () => {
    if (!openingDate) {
      toast.error("Pick the day classes open.");
      return;
    }
    if (!isWithinSchoolYear(schoolYear, openingDate)) {
      toast.error(`That date is outside ${schoolYear}.`);
      return;
    }

    const range = preOpeningRange(schoolYear, openingDate);
    if (!range) {
      toast.success("Classes open on the first day of the school year — nothing to mark.");
      return;
    }

    setSavingOpening(true);
    try {
      // A corrected opening date moves the row this card wrote rather than
      // stacking a second one over the same weeks.
      const existing = entries.find(
        (e) =>
          e.title === PRE_OPENING_TITLE &&
          e.day_type === "no_class" &&
          e.start_date === range.start &&
          (targetSchoolId == null
            ? e.school_id === null
            : String(e.school_id) === String(targetSchoolId)),
      );

      const { error } = existing
        ? await supabase
            .from("sms_school_calendar_days")
            .update({ end_date: range.end })
            .eq("id", existing.id)
        : await supabase.from("sms_school_calendar_days").insert({
            school_id: targetSchoolId,
            school_year: schoolYear,
            start_date: range.start,
            end_date: range.end,
            day_type: "no_class",
            period: "whole",
            title: PRE_OPENING_TITLE,
            created_by: createdBy ?? null,
          });

      if (error) throw error;

      toast.success(
        existing
          ? "Opening date updated — the days before it are marked as no classes."
          : "The days before classes open are now marked as no classes.",
      );
      setOpeningDate("");
      onSaved();
    } catch (err) {
      console.error("Failed to mark the pre-opening days:", err);
      toast.error("Failed to save. Please try again.");
    } finally {
      setSavingOpening(false);
    }
  };

  const handleHolidays = async () => {
    if (pendingHolidays.length === 0) return;

    setSavingHolidays(true);
    try {
      const { error } = await supabase.from("sms_school_calendar_days").insert(
        pendingHolidays.map((h) => ({
          school_id: targetSchoolId,
          school_year: schoolYear,
          start_date: h.date,
          end_date: h.date,
          day_type: "holiday",
          period: "whole",
          title: h.title,
          created_by: createdBy ?? null,
        })),
      );
      if (error) throw error;

      toast.success(
        `Added ${pendingHolidays.length} ${
          pendingHolidays.length === 1 ? "holiday" : "holidays"
        } for ${schoolYear}.`,
      );
      setHolidayPreview(false);
      onSaved();
    } catch (err) {
      console.error("Failed to add the national holidays:", err);
      toast.error("Failed to save. Please try again.");
    } finally {
      setSavingHolidays(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Quick setup</CardTitle>
        </div>
        <CardDescription>
          The two things that make a class-day count right for {schoolYear}.
          Both write ordinary entries you can edit or delete below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-4">
        {canChooseScope && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Apply to</Label>
            <Select
              value={scope}
              onValueChange={(v) => setScope(v as "school" | "division")}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="school">This school</SelectItem>
                <SelectItem value="division">
                  Division-wide (every school)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* 1. Class opening */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Class opening</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            The school year runs from {syWindow ? formatIso(syWindow.start) : "—"}.
            Enter the day classes actually open and everything before it is
            marked <span className="font-medium">No classes</span> in one entry,
            so those weeks stop counting as class days.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="opening-date" className="text-xs">
                First day of classes
              </Label>
              <Input
                id="opening-date"
                type="date"
                className="w-[180px]"
                min={syWindow?.start}
                max={syWindow?.end}
                value={openingDate}
                onChange={(e) => setOpeningDate(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleOpening}
              disabled={savingOpening || !openingDate}
            >
              {savingOpening ? "Saving…" : "Mark the days before"}
            </Button>
          </div>
        </div>

        {/* 2. National holidays */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">National holidays</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Regular and special non-working holidays falling inside {schoolYear},
            including Holy Week. Dates already covered — by an entry here, a
            division-wide one, or a weekend — are skipped, and nothing existing
            is changed.{" "}
            <span className="font-medium">
              Check the list against this year&rsquo;s proclamation before you
              rely on it
            </span>
            : an observance moved to a Monday, an extra special day, and Eid&rsquo;l
            Fitr / Eid&rsquo;l Adha (proclaimed on the sighting of the moon) are
            entered by hand.
          </p>
          {schoolId != null && !canManageDivision && (
            <p className="text-xs text-muted-foreground">
              These are the same for every school, so the division office may
              have already entered them division-wide — anything they filed is
              skipped below.
            </p>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setHolidayPreview(true)}
            disabled={pendingHolidays.length === 0}
          >
            {pendingHolidays.length === 0
              ? "All holidays already entered"
              : `Add ${pendingHolidays.length} national ${
                  pendingHolidays.length === 1 ? "holiday" : "holidays"
                }`}
          </Button>
        </div>

        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          The Christmas and semestral breaks, brigada week, the city fiesta and
          LGU-declared suspensions are not national holidays — add each below as
          one <span className="font-medium">No classes</span> entry covering the
          whole range.
        </p>
      </CardContent>

      <Dialog open={holidayPreview} onOpenChange={setHolidayPreview}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Add {pendingHolidays.length} national{" "}
              {pendingHolidays.length === 1 ? "holiday" : "holidays"}
            </DialogTitle>
            <DialogDescription>
              {targetSchoolId == null
                ? "Division-wide — every school in the division inherits these."
                : "Applies to this school only."}{" "}
              Each is added as a whole-day Holiday for {schoolYear}.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border">
            {pendingHolidays.map((h) => (
              <div
                key={h.date}
                className="flex items-center justify-between gap-4 border-b border-border px-3 py-2 text-sm last:border-b-0"
              >
                <span>{h.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatIso(h.date)}
                  {h.kind === "special" ? " · special" : ""}
                </span>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setHolidayPreview(false)}
              disabled={savingHolidays}
            >
              Cancel
            </Button>
            <Button onClick={handleHolidays} disabled={savingHolidays}>
              {savingHolidays ? "Adding…" : "Add them"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-06-08" → "Mon, Jun 8, 2026" — the weekday matters when checking a list. */
function formatIso(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    new Date(y, m - 1, d).getDay()
  ];
  return `${weekday}, ${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}
