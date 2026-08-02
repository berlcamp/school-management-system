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
   * Who this user may fill forms for. REQUIRED, and there is deliberately no
   * default: this component is reused by the School Head board and by the
   * teacher's own view, and an omitted prop previously fell through to the
   * permissive branch — which let the observed teacher rewrite the rating sheet
   * filed about them.
   *
   *   "all"  — School Head / admin: any observer's form on any slot.
   *   "own"  — a designated observer: only the form under their own name.
   *   "none" — the rated teacher looking at their own slot: nothing editable.
   */
  editMode: "all" | "own" | "none";
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
  editMode,
  currentUserId,
  onChanged,
}: ObservationPanelProps) {
  const { schedule, observers, observations } = bundle;
  const [openForm, setOpenForm] = useState<OpenForm | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * The scale a NEW form on this slot will use. A form that already exists
   * carries its own stage — see `formAxes` — and must never be re-read from
   * the schedule, which is editable after the form was signed.
   */
  const careerStage = schedule.career_stage as CareerStage;
  const observerNames = observers.map(
    (o) => staffById.get(String(o.user_id))?.name ?? "",
  );

  /**
   * The two axes of a COT form, resolved for whichever form is open.
   *
   * Both are stored on the observation row precisely so they survive a later
   * edit to the schedule, but nothing was reading them back: a teacher promoted
   * mid-year, or a schedule whose school year was corrected, silently changed
   * the rating scale and the indicator set of an already-submitted form. A
   * rating of 2 filed on the 2–6 scale simply printed blank once the schedule
   * said 3–7.
   */
  const formAxes = (
    existing: { observation: CotObservation } | null,
  ): { careerStage: CareerStage; formCycleSy: string } => ({
    careerStage: (existing?.observation.career_stage ??
      schedule.career_stage) as CareerStage,
    formCycleSy: existing?.observation.form_cycle_sy ?? schedule.school_year,
  });

  const openAxes = formAxes(openForm?.existing ?? null);

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
      // Fields the observer actually edits. Everything identifying the form —
      // which slot, which kind, whose name, and the two axes — is set once on
      // insert and never rewritten, so a later edit to the schedule cannot
      // retroactively restate what was rated.
      const editable = {
        observation_date: values.observation_date || null,
        time_started: values.time_started || null,
        time_ended: values.time_ended || null,
        quarter: values.quarter,
        class_label: values.class_label || null,
        comments: values.comments || null,
        notes: values.notes || null,
        status: values.submit ? "submitted" : "draft",
        submitted_at: values.submit ? new Date().toISOString() : null,
      };

      let observationId = openForm.existing?.observation.id ?? null;
      if (observationId) {
        const { error } = await supabase
          .from("sms_cot_observations")
          .update(editable)
          .eq("id", Number(observationId));
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase
          .from("sms_cot_observations")
          .insert({
            ...editable,
            schedule_id: Number(schedule.id),
            school_id: Number(schedule.school_id),
            kind: openForm.kind,
            observer_id: openForm.observerId ? Number(openForm.observerId) : null,
            observer_name: openForm.observerName || null,
            // Stored, not re-derived: the scale and the indicator set are
            // frozen at the moment the form is first filed.
            career_stage: schedule.career_stage,
            form_cycle_sy: schedule.school_year,
            observation_round: schedule.observation_round,
            created_by: currentUserId ? Number(currentUserId) : null,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        observationId = String(data.id);
      }

      if (openForm.kind !== "notes") {
        const rows = values.ratings
          .filter((r) => r.rating != null || r.not_observed || r.not_applicable)
          .map((r) => ({
            observation_id: Number(observationId),
            indicator_code: r.indicator_code,
            rating: r.rating,
            not_observed: r.not_observed,
            not_applicable: r.not_applicable,
          }));

        // Upsert first, prune second. The previous order deleted every rating
        // and then re-inserted: a failure in between left a *submitted* rating
        // sheet with no scores at all and no way back. Writing first means the
        // worst case is a stale extra row, not a destroyed form.
        if (rows.length > 0) {
          const { error: upErr } = await supabase
            .from("sms_cot_ratings")
            .upsert(rows, { onConflict: "observation_id,indicator_code" });
          if (upErr) throw new Error(upErr.message);
        }

        // An indicator cleared in the UI must not survive from an earlier save.
        const keep = rows.map((r) => `"${r.indicator_code}"`).join(",");
        const prune = supabase
          .from("sms_cot_ratings")
          .delete()
          .eq("observation_id", Number(observationId));
        const { error: delErr } = keep
          ? await prune.not("indicator_code", "in", `(${keep})`)
          : await prune;
        if (delErr) throw new Error(delErr.message);
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
    const saved = openForm.existing?.observation;
    const base = {
      // The stored axes, not the schedule's current ones — reprinting a signed
      // form must reproduce the form that was signed.
      ...openAxes,
      teacherObserved: teacherName,
      classLabel: values.class_label,
      date: saved?.observation_date
        ? formatSlotDate(saved.observation_date)
        : formatSlotDate(schedule.observation_at),
      quarter: values.quarter,
      observationRound: saved?.observation_round ?? schedule.observation_round,
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

  const canEdit = (observerId: string) => {
    if (editMode === "none") return false;
    if (editMode === "all") return true;
    // "own": the caller must be a real, identified user matching this column.
    return (
      currentUserId != null &&
      currentUserId !== "" &&
      String(currentUserId) === String(observerId)
    );
  };

  /** The E-3 is a consensus of the assigned observers, so only they may file it. */
  const canEditAgreement =
    editMode === "all" ||
    (editMode === "own" &&
      observers.some((o) => String(o.user_id) === String(currentUserId)));

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
    // With nobody assigned, the viewer may file the notes themselves — but only
    // if they are permitted to edit at all and are not the teacher being
    // observed. Otherwise the rated teacher ends up authoring the observation
    // notes about themselves, signed in their own name.
    const mayFileOwnNotes =
      editMode !== "none" &&
      currentUserId != null &&
      currentUserId !== "" &&
      String(currentUserId) !== String(schedule.teacher_id);
    const noteObservers = observers.length
      ? observers
      : mayFileOwnNotes
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
            careerStage={openAxes.careerStage}
            formCycleSy={openAxes.formCycleSy}
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
                disabled={busy || !canEditAgreement}
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
          careerStage={openAxes.careerStage}
          formCycleSy={openAxes.formCycleSy}
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
