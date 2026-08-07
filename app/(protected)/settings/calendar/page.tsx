"use client";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
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
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  CALENDAR_DAY_TYPE_LABELS,
  CALENDAR_PERIOD_LABELS,
  SchoolCalendarDay,
} from "@/lib/utils/schoolCalendar";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { ArrowLeft, CalendarOff, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { CalendarDayModal } from "./components/CalendarDayModal";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-08-08" → "Aug 8, 2026"; a range collapses the repeated parts. */
function formatDateRange(start: string, end: string): string {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const startLabel = `${MONTH_NAMES[sm - 1].slice(0, 3)} ${sd}, ${sy}`;
  if (start === end) return startLabel;
  if (sy === ey && sm === em) {
    return `${MONTH_NAMES[sm - 1].slice(0, 3)} ${sd}–${ed}, ${sy}`;
  }
  return `${startLabel} – ${MONTH_NAMES[em - 1].slice(0, 3)} ${ed}, ${ey}`;
}

/** Calendar days spanned, inclusive — not school days, which the grid derives. */
function daySpan(start: string, end: string): number {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const diff = new Date(ey, em - 1, ed).getTime() - new Date(sy, sm - 1, sd).getTime();
  return Math.round(diff / 86_400_000) + 1;
}

export default function SchoolCalendarSettingsPage() {
  const user = useAppSelector((state) => state.user.user);
  const userType = user?.type;
  const schoolId = user?.school_id != null ? String(user.school_id) : null;

  const canManageDivision =
    userType === "division_admin" ||
    userType === "division_type" ||
    userType === "super admin";

  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [entries, setEntries] = useState<SchoolCalendarDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{
    open: boolean;
    editData?: SchoolCalendarDay;
    scopeSchoolId: string | null;
  }>({ open: false, scopeSchoolId: null });
  const [pendingDelete, setPendingDelete] = useState<SchoolCalendarDay | null>(null);
  const [deleting, setDeleting] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("sms_school_calendar_days")
      .select("id, school_id, school_year, start_date, end_date, day_type, period, title")
      .eq("school_year", schoolYear)
      .order("start_date");

    query =
      schoolId == null
        ? query.is("school_id", null)
        : query.or(`school_id.is.null,school_id.eq.${Number(schoolId)}`);

    const { data, error } = await query;
    if (!isMounted.current) return;

    if (error) {
      console.error("Failed to load school calendar:", error);
      toast.error("Failed to load the calendar.");
      setEntries([]);
    } else {
      setEntries((data ?? []) as SchoolCalendarDay[]);
    }
    setLoading(false);
  }, [schoolId, schoolYear]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const canEditEntry = (entry: SchoolCalendarDay) =>
    entry.school_id === null ? canManageDivision : String(entry.school_id) === schoolId;

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const { error } = await supabase
      .from("sms_school_calendar_days")
      .delete()
      .eq("id", pendingDelete.id);
    setDeleting(false);

    if (error) {
      console.error("Failed to delete calendar entry:", error);
      toast.error("Failed to delete. Please try again.");
      return;
    }
    toast.success("Calendar entry removed.");
    setPendingDelete(null);
    fetchEntries();
  };

  const schoolEntries = entries.filter((e) => e.school_id !== null);
  const divisionEntries = entries.filter((e) => e.school_id === null);

  const renderRow = (entry: SchoolCalendarDay) => {
    const editable = canEditEntry(entry);
    const isClassDay = entry.day_type === "class_day";
    return (
      <div
        key={entry.id}
        className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-b-0"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{entry.title}</span>
            <Badge variant={isClassDay ? "default" : "secondary"}>
              {CALENDAR_DAY_TYPE_LABELS[entry.day_type]}
            </Badge>
            {entry.period !== "whole" && (
              <Badge variant="outline">{CALENDAR_PERIOD_LABELS[entry.period]}</Badge>
            )}
            {entry.school_id === null && (
              <Badge variant="outline" className="text-muted-foreground">
                Division-wide
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {formatDateRange(entry.start_date, entry.end_date)}
            {entry.start_date !== entry.end_date && (
              <span> · {daySpan(entry.start_date, entry.end_date)} days</span>
            )}
          </p>
        </div>
        {editable && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setModal({
                  open: true,
                  editData: entry,
                  scopeSchoolId: entry.school_id === null ? null : schoolId,
                })
              }
            >
              <Pencil className="h-4 w-4" />
              <span className="sr-only">Edit {entry.title}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setPendingDelete(entry)}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Delete {entry.title}</span>
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 max-w-3xl">
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to School Settings
      </Link>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">School Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Days without classes — holidays, suspensions, and the opening weeks
            before classes begin. The attendance grid shades these, and they are
            excluded from SF2&apos;s number of class days and from report card
            attendance.
          </p>
        </div>
        <Select value={schoolYear} onValueChange={setSchoolYear}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {getSchoolYearOptions().map((sy) => (
              <SelectItem key={sy} value={sy}>
                {sy}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {schoolId != null && (
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <CalendarOff className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">This school</CardTitle>
                </div>
                <CardDescription>
                  Local entries — city fiesta, brigada, LGU-declared suspensions,
                  and your own opening dates.
                </CardDescription>
              </div>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() =>
                  setModal({ open: true, editData: undefined, scopeSchoolId: schoolId })
                }
              >
                <Plus className="h-4 w-4" />
                Add entry
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {loading ? (
              <p className="py-4 text-sm text-muted-foreground">Loading…</p>
            ) : schoolEntries.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                No school-specific entries for {schoolYear}.
              </p>
            ) : (
              schoolEntries.map(renderRow)
            )}
          </CardContent>
        </Card>
      )}

      <Card className={schoolId != null ? "mt-6" : undefined}>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <CalendarOff className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Division-wide</CardTitle>
              </div>
              <CardDescription>
                {canManageDivision
                  ? "Entered once by the division office; inherited by every school."
                  : "Set by the division office. Inherited by this school and not editable here."}
              </CardDescription>
            </div>
            {canManageDivision && (
              <Button
                size="sm"
                variant={schoolId != null ? "outline" : "default"}
                className="gap-1.5"
                onClick={() =>
                  setModal({ open: true, editData: undefined, scopeSchoolId: null })
                }
              >
                <Plus className="h-4 w-4" />
                Add entry
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <p className="py-4 text-sm text-muted-foreground">Loading…</p>
          ) : divisionEntries.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No division-wide entries for {schoolYear}.
            </p>
          ) : (
            divisionEntries.map(renderRow)
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">
        Attendance already recorded on a date later marked as a holiday is kept,
        not deleted — it simply stops counting. Unmarking the day restores it.
      </p>

      <CalendarDayModal
        open={modal.open}
        onOpenChange={(open) => setModal((prev) => ({ ...prev, open }))}
        onSaved={fetchEntries}
        schoolId={modal.scopeSchoolId}
        schoolYear={schoolYear}
        editData={modal.editData}
        createdBy={user?.system_user_id}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Remove calendar entry?"
        description={
          pendingDelete
            ? `"${pendingDelete.title}" (${formatDateRange(
                pendingDelete.start_date,
                pendingDelete.end_date
              )}) will count as ordinary class days again.`
            : undefined
        }
        confirmText="Remove"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
