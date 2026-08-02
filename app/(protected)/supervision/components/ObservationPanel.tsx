"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  COT_FORM_LABELS,
  needsAgreementForm,
  type CareerStage,
  type CotFormKind,
} from "@/lib/constants/supervision";
import {
  generateCotAgreementForm,
  generateCotObservationNotes,
  generateCotRatingSheet,
  type CotRatingValue,
} from "@/lib/pdf/generateCotForms";
import { supabase } from "@/lib/supabase/client";
import {
  formatSlotDate,
  formatSlotTime,
  toDateInputValue,
} from "@/lib/utils/supervision";
import type { CotObservation, CotRating } from "@/types";
import { ClipboardCheck, FileText, Loader2, NotebookPen, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import type { ScheduleBundle, SupervisionStaff } from "../useSupervision";
import { CotFormModal, type CotFormValues } from "./CotFormModal";

interface ObservationPanelProps {
  bundle: ScheduleBundle;
  teacherName: string;
  /** Every staff member, for resolving observer ids to names. */
  staffById: Map<string, SupervisionStaff>;
  schoolName?: string | null;
  schoolAddress?: string | null;
  /**
   * Which observers this user may fill forms for. Null = all of them (School
   * Head / admin); otherwise the user's own id, so an observer cannot edit a
   * colleague's rating sheet.
   */
  restrictToObserverId?: string | null;
  currentUserId?: string | null;
  onChanged: () => void;
}

interface OpenForm {
  kind: CotFormKind;
  observerId: string | null;
  observerName: string;
  existing: { observation: CotObservation; ratings: CotRating[] } | null;
}

export function ObservationPanel({
  bundle,
  teacherName,
  staffById,
  schoolName,
  schoolAddress,
  restrictToObserverId,
  currentUserId,
  onChanged,
}: ObservationPanelProps) {
  const { schedule, observers, observations } = bundle;
  const [openForm, setOpenForm] = useState<OpenForm | null>(null);
  const [busy, setBusy] = useState(false);

  const careerStage = schedule.career_stage as CareerStage;
  const observerNames = observers.map(
    (o) => staffById.get(String(o.user_id))?.name ?? "",
  );

  const findObservation = (kind: CotFormKind, observerId: string | null) =>
    observations.find(
      (o) =>
        o.kind === kind &&
        (kind === "agreement"
          ? true
          : String(o.observer_id) === String(observerId)),
    ) ?? null;

  // Memoized: CotFormModal re-seeds its fields whenever this object's identity
  // changes, so an unmemoized literal would wipe half-typed input every time
  // this panel re-rendered (a reload, a busy flag) with the form open.
  const defaults = useMemo(
    () => ({
      observation_date: toDateInputValue(schedule.observation_at),
      time_started: formatSlotTime(schedule.observation_at),
      time_ended: formatSlotTime(schedule.observation_end_at),
      class_label: schedule.class_label ?? "",
      quarter: schedule.quarter,
    }),
    [
      schedule.observation_at,
      schedule.observation_end_at,
      schedule.class_label,
      schedule.quarter,
    ],
  );

  /** Loads any saved ratings, then opens the form. */
  const open = async (
    kind: CotFormKind,
    observerId: string | null,
    observerName: string,
  ) => {
    const existingObservation = findObservation(kind, observerId);
    if (!existingObservation) {
      setOpenForm({ kind, observerId, observerName, existing: null });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("sms_cot_ratings")
        .select("*")
        .eq("observation_id", Number(existingObservation.id));
      if (error) throw new Error(error.message);
      setOpenForm({
        kind,
        observerId,
        observerName,
        existing: {
          observation: existingObservation,
          ratings: (data ?? []) as CotRating[],
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open the form.");
    } finally {
      setBusy(false);
    }
  };

  const save = async (values: CotFormValues) => {
    if (!openForm) return;
    setBusy(true);
    try {
      const payload = {
        schedule_id: Number(schedule.id),
        school_id: Number(schedule.school_id),
        kind: openForm.kind,
        observer_id: openForm.observerId ? Number(openForm.observerId) : null,
        observer_name: openForm.observerName || null,
        career_stage: schedule.career_stage,
        // Stored, not re-derived: the indicator set rotates on a 3-year cycle.
        form_cycle_sy: schedule.school_year,
        observation_date: values.observation_date || null,
        time_started: values.time_started || null,
        time_ended: values.time_ended || null,
        quarter: values.quarter,
        observation_round: schedule.observation_round,
        class_label: values.class_label || null,
        comments: values.comments || null,
        notes: values.notes || null,
        status: values.submit ? "submitted" : "draft",
        submitted_at: values.submit ? new Date().toISOString() : null,
        created_by: currentUserId ? Number(currentUserId) : null,
      };

      let observationId = openForm.existing?.observation.id ?? null;
      if (observationId) {
        const { error } = await supabase
          .from("sms_cot_observations")
          .update(payload)
          .eq("id", Number(observationId));
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase
          .from("sms_cot_observations")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        observationId = String(data.id);
      }

      if (openForm.kind !== "notes") {
        // Replace rather than merge: an indicator cleared in the UI must not
        // survive as a stale row from an earlier save.
        const { error: delErr } = await supabase
          .from("sms_cot_ratings")
          .delete()
          .eq("observation_id", Number(observationId));
        if (delErr) throw new Error(delErr.message);

        const rows = values.ratings
          .filter((r) => r.rating != null || r.not_observed || r.not_applicable)
          .map((r) => ({
            observation_id: Number(observationId),
            indicator_code: r.indicator_code,
            rating: r.rating,
            not_observed: r.not_observed,
            not_applicable: r.not_applicable,
          }));
        if (rows.length > 0) {
          const { error: insErr } = await supabase
            .from("sms_cot_ratings")
            .insert(rows);
          if (insErr) throw new Error(insErr.message);
        }
      }

      toast.success(values.submit ? "Form submitted." : "Draft saved.");
      setOpenForm(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save the form.");
    } finally {
      setBusy(false);
    }
  };

  /** Print what is currently on screen, saved or not. */
  const print = (values: CotFormValues) => {
    if (!openForm) return;
    const ratings: CotRatingValue[] = values.ratings.map((r) => ({
      indicator_code: r.indicator_code,
      rating: r.rating,
      not_observed: r.not_observed,
      not_applicable: r.not_applicable,
    }));
    const base = {
      careerStage,
      formCycleSy: schedule.school_year,
      teacherObserved: teacherName,
      classLabel: values.class_label,
      date: formatSlotDate(schedule.observation_at),
      quarter: values.quarter,
      observationRound: schedule.observation_round,
      schoolName,
      schoolAddress,
    };

    if (openForm.kind === "rating") {
      generateCotRatingSheet({
        ...base,
        observerName: openForm.observerName,
        ratings,
        comments: values.comments,
      });
    } else if (openForm.kind === "agreement") {
      generateCotAgreementForm({
        ...base,
        observerNames,
        ratings,
        comments: values.comments,
      });
    } else {
      generateCotObservationNotes({
        ...base,
        observerName: openForm.observerName,
        timeStarted: values.time_started,
        timeEnded: values.time_ended,
        notes: values.notes,
      });
    }
  };

  /** Blank forms to carry into the classroom. */
  const printBlank = (kind: CotFormKind, observerName: string) => {
    const base = {
      careerStage,
      formCycleSy: schedule.school_year,
      teacherObserved: teacherName,
      classLabel: schedule.class_label,
      date: formatSlotDate(schedule.observation_at),
      quarter: schedule.quarter,
      observationRound: schedule.observation_round,
      schoolName,
      schoolAddress,
    };
    if (kind === "rating") generateCotRatingSheet({ ...base, observerName });
    else if (kind === "agreement")
      generateCotAgreementForm({ ...base, observerNames });
    else generateCotObservationNotes({ ...base, observerName });
  };

  const canEdit = (observerId: string) =>
    restrictToObserverId == null ||
    String(restrictToObserverId) === String(observerId);

  const statusBadge = (observation: CotObservation | null) => {
    if (!observation)
      return <Badge variant="outline">Not started</Badge>;
    return observation.status === "submitted" ? (
      <Badge className="bg-emerald-600 hover:bg-emerald-600">Submitted</Badge>
    ) : (
      <Badge variant="secondary">Draft</Badge>
    );
  };

  if (schedule.supervision_type === "non_rated") {
    // A fleeting observation produces notes only — no COT rating sheet.
    const noteObservers = observers.length
      ? observers
      : currentUserId
        ? [{ id: "self", schedule_id: schedule.id, user_id: currentUserId, slot: 1, created_at: "" }]
        : [];
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Non-rated (fleeting) observation — observation notes only, no COT rating
          sheet.
        </p>
        {noteObservers.map((o) => {
          const name = staffById.get(String(o.user_id))?.name ?? "";
          const existing = findObservation("notes", String(o.user_id));
          return (
            <div
              key={String(o.user_id)}
              className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
            >
              <NotebookPen className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{name}</span>
              {statusBadge(existing)}
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !canEdit(String(o.user_id))}
                  onClick={() => open("notes", String(o.user_id), name)}
                >
                  {busy && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  {existing ? "Open notes" : "Write notes"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => printBlank("notes", name)}
                >
                  <Printer className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
        {openForm && (
          <CotFormModal
            open
            onOpenChange={(v) => !v && setOpenForm(null)}
            kind={openForm.kind}
            careerStage={careerStage}
            formCycleSy={schedule.school_year}
            teacherName={teacherName}
            observerName={openForm.observerName}
            existing={openForm.existing}
            defaults={defaults}
            submitting={busy}
            onSubmit={save}
            onPrint={print}
          />
        )}
      </div>
    );
  }

  const agreement = findObservation("agreement", null);

  return (
    <div className="space-y-2">
      {observers.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No observer assigned yet — the School Head assigns observers when
          approving the schedule.
        </p>
      )}

      {observers.map((o) => {
        const name = staffById.get(String(o.user_id))?.name ?? "";
        const rating = findObservation("rating", String(o.user_id));
        const notes = findObservation("notes", String(o.user_id));
        const editable = canEdit(String(o.user_id));
        return (
          <div key={String(o.user_id)} className="rounded-md border p-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{name}</span>
              <span className="text-xs text-muted-foreground">
                Observer {o.slot}
              </span>
              {statusBadge(rating)}
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !editable}
                  onClick={() => open("rating", String(o.user_id), name)}
                >
                  {COT_FORM_LABELS.rating.replace("Annex E-2 · ", "")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !editable}
                  onClick={() => open("notes", String(o.user_id), name)}
                >
                  Notes {notes ? "✓" : ""}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  title="Print blank rating sheet"
                  onClick={() => printBlank("rating", name)}
                >
                  <Printer className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        );
      })}

      {needsAgreementForm(observers.length) && (
        <div className="rounded-md border border-dashed p-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">
              Inter-Observer Agreement (Annex E-3)
            </span>
            {statusBadge(agreement)}
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy || restrictToObserverId != null &&
                  !observers.some(
                    (o) => String(o.user_id) === String(restrictToObserverId),
                  )}
                onClick={() =>
                  open("agreement", null, observerNames.filter(Boolean).join(", "))
                }
              >
                {agreement ? "Open final rating" : "Record final rating"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => printBlank("agreement", "")}
              >
                <Printer className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Required because more than one observer rated this observation. The
            final rating is a reasoned consensus, not an average.
          </p>
        </div>
      )}

      {observers.length === 1 && (
        <p className="text-xs text-muted-foreground">
          With a single observer, the rating sheet above serves as the final
          rating sheet.
        </p>
      )}

      {openForm && (
        <CotFormModal
          open
          onOpenChange={(v) => !v && setOpenForm(null)}
          kind={openForm.kind}
          careerStage={careerStage}
          formCycleSy={schedule.school_year}
          teacherName={teacherName}
          observerName={openForm.observerName}
          existing={openForm.existing}
          defaults={defaults}
          submitting={busy}
          onSubmit={save}
          onPrint={print}
        />
      )}
    </div>
  );
}
