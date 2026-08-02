"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStaffModuleAccess } from "@/hooks/useStaffModuleAccess";
import { SUPERVISION_TERMS, termMonths } from "@/lib/constants/supervision";
import { generateSupervisoryPlan } from "@/lib/pdf/generateSupervisoryPlan";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { fetchSchoolSettings } from "@/lib/utils/schoolSettings";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import type { SupervisionPlan, SupervisionPlanEntry } from "@/types";
import {
  ArrowLeft,
  CalendarDays,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  PlanEntryModal,
  type PlanEntryFormValues,
} from "./components/PlanEntryModal";

/**
 * The School Head's Instructional Supervisory Plan.
 *
 * One plan per (school, school year, term); the plan row is created lazily the
 * first time an entry is added, so switching terms does not litter the table
 * with empty plans.
 */
export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const hasAccess = useStaffModuleAccess();
  const schoolId = user?.school_id ?? null;

  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [term, setTerm] = useState(1);
  const [plan, setPlan] = useState<SupervisionPlan | null>(null);
  const [entries, setEntries] = useState<SupervisionPlanEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SupervisionPlanEntry | null>(null);

  const [school, setSchool] = useState<{ name: string; address: string } | null>(
    null,
  );
  const [principal, setPrincipal] = useState<{ name: string; title: string }>({
    name: "",
    title: "Principal",
  });

  useEffect(() => {
    let isMounted = true;
    if (schoolId == null) return;
    (async () => {
      const [{ data }, settings] = await Promise.all([
        supabase
          .from("sms_schools")
          .select("name, address")
          .eq("id", Number(schoolId))
          .maybeSingle(),
        fetchSchoolSettings(String(schoolId)),
      ]);
      if (!isMounted) return;
      setSchool({
        name: (data?.name as string) ?? "",
        address: (data?.address as string) ?? "",
      });
      setPrincipal({
        name: settings.principal_name ?? "",
        title: settings.principal_title ?? "Principal",
      });
    })();
    return () => {
      isMounted = false;
    };
  }, [schoolId]);

  const load = useCallback(async () => {
    if (schoolId == null) {
      setPlan(null);
      setEntries([]);
      return;
    }
    setLoading(true);
    try {
      const { data: planRow, error } = await supabase
        .from("sms_supervision_plans")
        .select("*")
        .eq("school_id", Number(schoolId))
        .eq("school_year", schoolYear)
        .eq("term", term)
        .maybeSingle();
      if (error) throw new Error(error.message);

      if (!planRow) {
        setPlan(null);
        setEntries([]);
        return;
      }
      setPlan(planRow as SupervisionPlan);

      const { data: rows, error: entryErr } = await supabase
        .from("sms_supervision_plan_entries")
        .select("*")
        .eq("plan_id", Number(planRow.id))
        .order("sort_order");
      if (entryErr) throw new Error(entryErr.message);
      setEntries((rows ?? []) as SupervisionPlanEntry[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load the plan.");
      setPlan(null);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [schoolId, schoolYear, term]);

  useEffect(() => {
    load();
  }, [load]);

  /** Creates the plan row on first use, so empty terms leave no rows behind. */
  const ensurePlan = async (): Promise<string | null> => {
    if (plan) return plan.id;
    if (schoolId == null) return null;
    const { data, error } = await supabase
      .from("sms_supervision_plans")
      .insert({
        school_id: Number(schoolId),
        school_year: schoolYear,
        term,
        prepared_by: user?.id ? Number(user.id) : null,
        prepared_by_name: principal.name || user?.name || null,
        prepared_by_position: principal.title || null,
        created_by: user?.id ? Number(user.id) : null,
      })
      .select("*")
      .single();
    if (error) {
      toast.error(error.message);
      return null;
    }
    setPlan(data as SupervisionPlan);
    return String(data.id);
  };

  const saveEntry = async (values: PlanEntryFormValues) => {
    setSubmitting(true);
    try {
      const planId = await ensurePlan();
      if (!planId) return;

      const payload = {
        plan_id: Number(planId),
        teachers: values.teachers,
        kra: values.kra || null,
        priority_strand: values.priority_strand || null,
        objectives: values.objectives || null,
        activities: values.activities || null,
        success_indicators: values.success_indicators || null,
        means_of_verification: values.means_of_verification || null,
        time_frame: values.time_frame || null,
        accomplishment: values.accomplishment || null,
        remarks: values.remarks || null,
      };

      if (editing) {
        const { error } = await supabase
          .from("sms_supervision_plan_entries")
          .update(payload)
          .eq("id", Number(editing.id));
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("sms_supervision_plan_entries")
          .insert({ ...payload, sort_order: entries.length });
        if (error) throw new Error(error.message);
      }

      toast.success(editing ? "Row updated." : "Row added.");
      setModalOpen(false);
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save the row.");
    } finally {
      setSubmitting(false);
    }
  };

  const removeEntry = async (entry: SupervisionPlanEntry) => {
    if (!window.confirm("Remove this plan row?")) return;
    const { error } = await supabase
      .from("sms_supervision_plan_entries")
      .delete()
      .eq("id", Number(entry.id));
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Row removed.");
    load();
  };

  /** Print this term, or the whole school year across all three terms. */
  const print = async (allTerms: boolean) => {
    if (schoolId == null) return;
    const rowsFor = (list: SupervisionPlanEntry[]) =>
      list.map((e) => ({
        teachers: e.teachers,
        kra: e.kra,
        priority_strand: e.priority_strand,
        objectives: e.objectives,
        activities: e.activities,
        success_indicators: e.success_indicators,
        means_of_verification: e.means_of_verification,
        time_frame: e.time_frame,
        accomplishment: e.accomplishment,
        remarks: e.remarks,
      }));

    let terms: { term: number; rows: ReturnType<typeof rowsFor> }[];
    if (!allTerms) {
      terms = [{ term, rows: rowsFor(entries) }];
    } else {
      const { data: plans, error } = await supabase
        .from("sms_supervision_plans")
        .select("id, term")
        .eq("school_id", Number(schoolId))
        .eq("school_year", schoolYear);
      if (error) {
        toast.error(error.message);
        return;
      }
      const planIds = (plans ?? []).map((p) => Number(p.id));
      let allEntries: SupervisionPlanEntry[] = [];
      if (planIds.length > 0) {
        const { data: rows, error: rowErr } = await supabase
          .from("sms_supervision_plan_entries")
          .select("*")
          .in("plan_id", planIds)
          .order("sort_order");
        if (rowErr) {
          toast.error(rowErr.message);
          return;
        }
        allEntries = (rows ?? []) as SupervisionPlanEntry[];
      }
      const termByPlanId = new Map(
        (plans ?? []).map((p) => [String(p.id), Number(p.term)]),
      );
      terms = SUPERVISION_TERMS.map((t) => ({
        term: t.value,
        rows: rowsFor(
          allEntries.filter(
            (e) => termByPlanId.get(String(e.plan_id)) === t.value,
          ),
        ),
      }));
    }

    generateSupervisoryPlan({
      schoolName: school?.name,
      schoolAddress: school?.address,
      schoolYear,
      terms,
      preparedByName: plan?.prepared_by_name || principal.name,
      preparedByPosition: plan?.prepared_by_position || principal.title,
    });
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
            <CalendarDays className="h-6 w-6" />
            Instructional Supervisory Plan
          </h1>
          <p className="text-sm text-muted-foreground">
            School Year {schoolYear} · Term {term} ({termMonths(term)})
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => print(false)}>
            <Printer className="mr-2 h-4 w-4" />
            Print this term
          </Button>
          <Button variant="outline" onClick={() => print(true)}>
            <Printer className="mr-2 h-4 w-4" />
            Print all terms
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add row
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-3 p-4">
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
          <div className="w-56">
            <Select value={String(term)} onValueChange={(v) => setTerm(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPERVISION_TERMS.map((t) => (
                  <SelectItem key={t.value} value={String(t.value)}>
                    {t.label} ({t.months})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading plan…
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No rows in the {SUPERVISION_TERMS[term - 1].label} plan yet.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[64rem] text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left">
                <th className="p-3 font-medium">Teachers</th>
                <th className="p-3 font-medium">KRA / Priority strand</th>
                <th className="p-3 font-medium">Objectives</th>
                <th className="p-3 font-medium">Activities</th>
                <th className="p-3 font-medium">Success indicators</th>
                <th className="p-3 font-medium">MOV</th>
                <th className="p-3 font-medium">Time frame</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Remarks (STAR)</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={String(entry.id)} className="border-t align-top">
                  <td className="p-3 whitespace-pre-line">{entry.teachers}</td>
                  <td className="p-3">
                    <div>{entry.kra}</div>
                    {entry.priority_strand && (
                      <div className="mt-1 text-muted-foreground">
                        {entry.priority_strand}
                      </div>
                    )}
                  </td>
                  <td className="p-3">{entry.objectives}</td>
                  <td className="p-3">{entry.activities}</td>
                  <td className="p-3">{entry.success_indicators}</td>
                  <td className="p-3">{entry.means_of_verification}</td>
                  <td className="p-3 whitespace-pre-line">{entry.time_frame}</td>
                  <td className="p-3">{entry.accomplishment}</td>
                  <td className="p-3">{entry.remarks}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(entry);
                          setModalOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeEntry(entry)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PlanEntryModal
        open={modalOpen}
        onOpenChange={(v) => {
          setModalOpen(v);
          if (!v) setEditing(null);
        }}
        existing={editing}
        submitting={submitting}
        onSubmit={saveEntry}
      />
    </div>
  );
}
