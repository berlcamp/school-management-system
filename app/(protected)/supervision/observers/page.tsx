"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStaffModuleAccess } from "@/hooks/useStaffModuleAccess";
import { careerStageLabel, suggestCareerStage } from "@/lib/constants/supervision";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { ArrowLeft, Loader2, UserCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useDesignatedObservers, useSupervisionStaff } from "../useSupervision";

/**
 * Designating observers for a school year.
 *
 * A designation rather than a role check: DepEd does not tie who may observe to
 * a plantilla position, and master teachers routinely observe alongside (or
 * instead of) the School Head. Deactivating rather than deleting keeps the
 * observer resolvable on rating sheets they already signed.
 */
export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const hasAccess = useStaffModuleAccess();
  const schoolId = user?.school_id ?? null;

  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { staff, loading: staffLoading } = useSupervisionStaff(schoolId);
  const { observers, loading, reload } = useDesignatedObservers(
    schoolId,
    schoolYear,
  );

  const byUserId = useMemo(
    () => new Map(observers.map((o) => [String(o.user_id), o])),
    [observers],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return staff;
    return staff.filter((s) =>
      `${s.name} ${s.position ?? ""}`.toLowerCase().includes(needle),
    );
  }, [staff, search]);

  const toggle = async (userId: string, next: boolean) => {
    if (schoolId == null) {
      // Was a silent no-op: the button did nothing and said nothing.
      toast.error("No school is set for your account, so nothing can be saved.");
      return;
    }
    setBusyId(userId);
    try {
      const existing = byUserId.get(userId);
      if (existing) {
        const { error } = await supabase
          .from("sms_supervision_observers")
          .update({ is_active: next })
          .eq("id", Number(existing.id));
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("sms_supervision_observers")
          .insert({
            school_id: Number(schoolId),
            school_year: schoolYear,
            user_id: Number(userId),
            is_active: next,
            designated_by: user?.system_user_id ?? null,
          });
        if (error) throw new Error(error.message);
      }
      reload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update the designation.",
      );
    } finally {
      setBusyId(null);
    }
  };

  if (!hasAccess) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            You do not have access to Instructional Supervision.
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeCount = observers.filter((o) => o.is_active).length;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1">
            <Link href="/supervision">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to schedules
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <UserCheck className="h-6 w-6" />
            Designated Observers
          </h1>
          <p className="text-sm text-muted-foreground">
            Staff you designate here can be assigned to observe and may file COT
            rating sheets. The observer need not be the School Head.
          </p>
        </div>
        <div className="w-40">
          <Select value={schoolYear} onValueChange={setSchoolYear}>
            <SelectTrigger>
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
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              className="w-72"
              placeholder="Search staff…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Badge variant="secondary">
              {activeCount} designated for S.Y. {schoolYear}
            </Badge>
          </div>

          {staffLoading || loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading staff…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">
              No staff found.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {filtered.map((s) => {
                const record = byUserId.get(s.id);
                const designated = record?.is_active ?? false;
                const stage = suggestCareerStage(s.position);
                return (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center gap-3 p-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-muted-foreground">
                        {s.position || "—"}
                        {stage ? ` · ${careerStageLabel(stage)}` : ""}
                      </div>
                    </div>
                    {designated && (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600">
                        Observer
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant={designated ? "outline" : "default"}
                      disabled={busyId === s.id}
                      onClick={() => toggle(s.id, !designated)}
                    >
                      {busyId === s.id && (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      )}
                      {designated ? "Remove" : "Designate"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
