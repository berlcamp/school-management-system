"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
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
import { Textarea } from "@/components/ui/textarea";
import {
  CAREER_STAGE_ORDER,
  CAREER_STAGES,
  careerStageLabel,
  cotIndicators,
  kraForIndicator,
  MAX_OBSERVERS_PER_OBSERVATION,
  RPMS_KRAS,
  suggestCareerStage,
  SUPERVISION_TERMS,
  SUPERVISION_TYPE_LABELS,
  type CareerStage,
  type SupervisionType,
} from "@/lib/constants/supervision";
import { toDatetimeLocal } from "@/lib/utils/supervision";
import type { SupervisionSchedule, SupervisionScheduleObserver } from "@/types";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { SupervisionStaff } from "../useSupervision";

export interface ScheduleFormValues {
  teacher_id: string;
  teacher_position: string;
  career_stage: CareerStage;
  supervision_type: SupervisionType;
  term: number;
  observation_round: number;
  quarter: number | null;
  class_label: string;
  pre_conference_at: string;
  observation_at: string;
  observation_end_at: string;
  focus_kra: string;
  focus_indicator: string;
  lesson_plan_url: string;
  notes: string;
  observer_ids: string[];
}

interface ScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolYear: string;
  /** Editing an existing slot, or null to propose a new one. */
  existing: {
    schedule: SupervisionSchedule;
    observers: SupervisionScheduleObserver[];
  } | null;
  staff: SupervisionStaff[];
  /** Designated observers for the school year — the assignable pool. */
  observerPool: SupervisionStaff[];
  /**
   * A teacher proposing their own slot: the teacher select is locked to them
   * and observer assignment is hidden, since the School Head assigns observers.
   */
  lockedTeacher?: SupervisionStaff | null;
  submitting?: boolean;
  onSubmit: (values: ScheduleFormValues) => void | Promise<void>;
}

function blankValues(): ScheduleFormValues {
  // Default to the term the current date falls in, so the common case needs no
  // change. December belongs to no term in the plan; it falls through to Term 3,
  // which is the next one to be planned.
  const month = new Date().getMonth();
  const term = month >= 5 && month <= 7 ? 1 : month >= 8 && month <= 10 ? 2 : 3;
  return {
    teacher_id: "",
    teacher_position: "",
    career_stage: "proficient_a",
    supervision_type: "rated",
    term,
    observation_round: 1,
    quarter: null,
    class_label: "",
    pre_conference_at: "",
    observation_at: "",
    observation_end_at: "",
    focus_kra: "",
    focus_indicator: "",
    lesson_plan_url: "",
    notes: "",
    observer_ids: [],
  };
}

export function ScheduleModal({
  open,
  onOpenChange,
  schoolYear,
  existing,
  staff,
  observerPool,
  lockedTeacher,
  submitting,
  onSubmit,
}: ScheduleModalProps) {
  const [values, setValues] = useState<ScheduleFormValues>(blankValues);
  const [error, setError] = useState<string | null>(null);

  // Re-seed whenever the dialog opens or targets a different slot.
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (existing) {
      const s = existing.schedule;
      setValues({
        teacher_id: String(s.teacher_id),
        teacher_position: s.teacher_position ?? "",
        career_stage: s.career_stage as CareerStage,
        supervision_type: s.supervision_type,
        term: s.term,
        observation_round: s.observation_round,
        quarter: s.quarter,
        class_label: s.class_label ?? "",
        pre_conference_at: toDatetimeLocal(s.pre_conference_at),
        observation_at: toDatetimeLocal(s.observation_at),
        observation_end_at: toDatetimeLocal(s.observation_end_at),
        focus_kra: s.focus_kra ?? "",
        focus_indicator: s.focus_indicator ?? "",
        lesson_plan_url: s.lesson_plan_url ?? "",
        notes: s.notes ?? "",
        observer_ids: existing.observers
          .slice()
          .sort((a, b) => a.slot - b.slot)
          .map((o) => String(o.user_id)),
      });
      return;
    }
    const base = blankValues();
    if (lockedTeacher) {
      base.teacher_id = lockedTeacher.id;
      base.teacher_position = lockedTeacher.position ?? "";
      base.career_stage = suggestCareerStage(lockedTeacher.position) ?? "proficient_a";
    }
    setValues(base);
  }, [open, existing, lockedTeacher, schoolYear]);

  const indicators = useMemo(() => cotIndicators(schoolYear), [schoolYear]);
  const stage = CAREER_STAGES[values.career_stage];

  const set = <K extends keyof ScheduleFormValues>(
    key: K,
    value: ScheduleFormValues[K],
  ) => setValues((prev) => ({ ...prev, [key]: value }));

  /** Picking a teacher re-suggests their career stage from their position. */
  const onTeacherChange = (id: string) => {
    const picked = staff.find((s) => s.id === id);
    setValues((prev) => ({
      ...prev,
      teacher_id: id,
      teacher_position: picked?.position ?? "",
      career_stage: suggestCareerStage(picked?.position) ?? prev.career_stage,
    }));
  };

  /** Choosing a focus indicator fills the KRA it belongs to, if still blank. */
  const onIndicatorChange = (code: string) => {
    setValues((prev) => ({
      ...prev,
      focus_indicator: code,
      focus_kra: prev.focus_kra || (kraForIndicator(code)?.label ?? ""),
    }));
  };

  const toggleObserver = (id: string) => {
    setValues((prev) => {
      if (prev.observer_ids.includes(id)) {
        return {
          ...prev,
          observer_ids: prev.observer_ids.filter((x) => x !== id),
        };
      }
      if (prev.observer_ids.length >= MAX_OBSERVERS_PER_OBSERVATION) return prev;
      return { ...prev, observer_ids: [...prev.observer_ids, id] };
    });
  };

  const handleSubmit = async () => {
    if (!values.teacher_id) {
      setError("Select the teacher to be observed.");
      return;
    }
    if (!values.observation_at) {
      setError("Set the date and time of the actual observation.");
      return;
    }
    if (
      values.observation_end_at &&
      new Date(values.observation_end_at) <= new Date(values.observation_at)
    ) {
      setError("The observation must end after it starts.");
      return;
    }
    setError(null);
    await onSubmit(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit observation schedule" : "Suggest observation schedule"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Name of teacher</Label>
              {lockedTeacher ? (
                <Input value={lockedTeacher.name} disabled />
              ) : (
                <Select value={values.teacher_id} onValueChange={onTeacherChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {s.position ? ` — ${s.position}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Position</Label>
              <Input
                value={values.teacher_position}
                onChange={(e) => set("teacher_position", e.target.value)}
                placeholder="e.g. Teacher III"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Career stage (sets the COT rating scale)</Label>
            <Select
              value={values.career_stage}
              onValueChange={(v) => set("career_stage", v as CareerStage)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAREER_STAGE_ORDER.map((key) => (
                  <SelectItem key={key} value={key}>
                    {careerStageLabel(key)} · levels {CAREER_STAGES[key].minRating}–
                    {CAREER_STAGES[key].maxRating}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Suggested from the position above — confirm it. Observers will rate on
              a {stage.minRating}–{stage.maxRating} scale, and &ldquo;Not
              Observed&rdquo; scores {stage.notObserved}.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Type of supervision</Label>
              <Select
                value={values.supervision_type}
                onValueChange={(v) => set("supervision_type", v as SupervisionType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(SUPERVISION_TYPE_LABELS) as SupervisionType[]
                  ).map((key) => (
                    <SelectItem key={key} value={key}>
                      {SUPERVISION_TYPE_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Term</Label>
              <Select
                value={String(values.term)}
                onValueChange={(v) => set("term", Number(v))}
              >
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

            <div className="space-y-1.5">
              <Label>Observation</Label>
              <Select
                value={String(values.observation_round)}
                onValueChange={(v) => set("observation_round", Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1st observation</SelectItem>
                  <SelectItem value="2">2nd observation</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Grade and section of class for observation</Label>
              <Input
                value={values.class_label}
                onChange={(e) => set("class_label", e.target.value)}
                placeholder="e.g. Mathematics — Grade 5 Sampaguita"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Quarter</Label>
              <Select
                value={values.quarter != null ? String(values.quarter) : "none"}
                onValueChange={(v) => set("quarter", v === "none" ? null : Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {[1, 2, 3, 4].map((q) => (
                    <SelectItem key={q} value={String(q)}>
                      {q}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Date &amp; time of pre-conference</Label>
              <Input
                type="datetime-local"
                value={values.pre_conference_at}
                onChange={(e) => set("pre_conference_at", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date &amp; time of actual observation</Label>
              <Input
                type="datetime-local"
                value={values.observation_at}
                onChange={(e) => set("observation_at", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ends (optional)</Label>
              <Input
                type="datetime-local"
                value={values.observation_end_at}
                onChange={(e) => set("observation_end_at", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Focus KRA</Label>
              <Select
                value={values.focus_kra || "none"}
                onValueChange={(v) => set("focus_kra", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select KRA" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {RPMS_KRAS.map((k) => (
                    <SelectItem key={k.key} value={k.label}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Focus indicator</Label>
              <Select
                value={values.focus_indicator || "none"}
                onValueChange={(v) => onIndicatorChange(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select indicator" />
                </SelectTrigger>
                <SelectContent className="max-w-[32rem]">
                  <SelectItem value="none">Not specified</SelectItem>
                  {indicators.map((ind) => (
                    <SelectItem key={ind.code} value={ind.code}>
                      {ind.code} — {ind.text}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The COT indicator set for S.Y. {schoolYear}.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>ILAW lesson plan link (optional)</Label>
            <Input
              value={values.lesson_plan_url}
              onChange={(e) => set("lesson_plan_url", e.target.value)}
              placeholder="https://…"
            />
          </div>

          {!lockedTeacher && (
            <div className="space-y-1.5">
              <Label>
                Observer/s (up to {MAX_OBSERVERS_PER_OBSERVATION})
              </Label>
              {observerPool.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No observers designated for S.Y. {schoolYear} yet. Designate them
                  first under Supervision &rarr; Observers.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 rounded-md border p-3">
                  {observerPool.map((o) => {
                    const checked = values.observer_ids.includes(o.id);
                    return (
                      <label
                        key={o.id}
                        className="flex items-start gap-2 text-sm cursor-pointer"
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={checked}
                          onChange={() => toggleObserver(o.id)}
                          disabled={
                            !checked &&
                            values.observer_ids.length >=
                              MAX_OBSERVERS_PER_OBSERVATION
                          }
                        />
                        <span>
                          {o.name}
                          {o.position ? (
                            <span className="text-muted-foreground">
                              {" "}
                              — {o.position}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              {values.observer_ids.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  With more than one observer, an Inter-Observer Agreement form
                  (Annex E-3) is required to record the final consensus rating.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              rows={3}
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Anything the observer should know beforehand"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {existing ? "Save changes" : "Submit for approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
