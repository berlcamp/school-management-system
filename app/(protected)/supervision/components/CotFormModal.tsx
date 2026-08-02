"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CAREER_STAGES,
  COT_FORM_LABELS,
  cotIndicators,
  ratingScale,
  type CareerStage,
  type CotFormKind,
} from "@/lib/constants/supervision";
import { cn } from "@/lib/utils";
import type { CotObservation, CotRating } from "@/types";
import { Loader2, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/** One indicator's state while the form is being filled. */
export interface CotRatingDraft {
  indicator_code: string;
  rating: number | null;
  not_observed: boolean;
  not_applicable: boolean;
}

export interface CotFormValues {
  observation_date: string;
  time_started: string;
  time_ended: string;
  class_label: string;
  quarter: number | null;
  comments: string;
  notes: string;
  ratings: CotRatingDraft[];
  submit: boolean;
}

interface CotFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: CotFormKind;
  careerStage: CareerStage;
  /** School year whose indicator set this form carries. */
  formCycleSy: string;
  teacherName: string;
  observerName: string;
  /** Existing form being edited, or null when opening a fresh one. */
  existing: { observation: CotObservation; ratings: CotRating[] } | null;
  /** Defaults taken from the schedule when creating a new form. */
  defaults: {
    observation_date: string;
    time_started: string;
    time_ended: string;
    class_label: string;
    quarter: number | null;
  };
  submitting?: boolean;
  onSubmit: (values: CotFormValues) => void | Promise<void>;
  onPrint?: (values: CotFormValues) => void;
}

export function CotFormModal({
  open,
  onOpenChange,
  kind,
  careerStage,
  formCycleSy,
  teacherName,
  observerName,
  existing,
  defaults,
  submitting,
  onSubmit,
  onPrint,
}: CotFormModalProps) {
  const indicators = useMemo(() => cotIndicators(formCycleSy), [formCycleSy]);
  const scale = useMemo(() => ratingScale(careerStage), [careerStage]);
  const stage = CAREER_STAGES[careerStage];
  const isRated = kind !== "notes";

  const [values, setValues] = useState<CotFormValues>(() => ({
    observation_date: "",
    time_started: "",
    time_ended: "",
    class_label: "",
    quarter: null,
    comments: "",
    notes: "",
    ratings: [],
    submit: false,
  }));

  useEffect(() => {
    if (!open) return;
    const saved = new Map(
      (existing?.ratings ?? []).map((r) => [r.indicator_code, r]),
    );
    setValues({
      observation_date:
        existing?.observation.observation_date ?? defaults.observation_date,
      time_started: existing?.observation.time_started ?? defaults.time_started,
      time_ended: existing?.observation.time_ended ?? defaults.time_ended,
      class_label: existing?.observation.class_label ?? defaults.class_label,
      quarter: existing?.observation.quarter ?? defaults.quarter,
      comments: existing?.observation.comments ?? "",
      notes: existing?.observation.notes ?? "",
      ratings: indicators.map((ind) => {
        const row = saved.get(ind.code);
        return {
          indicator_code: ind.code,
          rating: row?.rating ?? null,
          not_observed: row?.not_observed ?? false,
          not_applicable: row?.not_applicable ?? false,
        };
      }),
      submit: existing?.observation.status === "submitted",
    });
  }, [open, existing, defaults, indicators]);

  const set = <K extends keyof CotFormValues>(key: K, value: CotFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const updateRating = (code: string, patch: Partial<CotRatingDraft>) =>
    setValues((prev) => ({
      ...prev,
      ratings: prev.ratings.map((r) =>
        r.indicator_code === code ? { ...r, ...patch } : r,
      ),
    }));

  /** Picking a level clears the NO / N/A marks — the three are exclusive. */
  const pickLevel = (code: string, level: number) => {
    const current = values.ratings.find((r) => r.indicator_code === code);
    const clearing = current?.rating === level && !current.not_observed;
    updateRating(code, {
      rating: clearing ? null : level,
      not_observed: false,
      not_applicable: false,
    });
  };

  /**
   * "NO" is not a blank and not a zero: the form states it automatically gets
   * the lowest rating of the career stage, so that value is written through.
   */
  const toggleNotObserved = (code: string) => {
    const current = values.ratings.find((r) => r.indicator_code === code);
    const next = !current?.not_observed;
    updateRating(code, {
      not_observed: next,
      not_applicable: false,
      rating: next ? stage.notObserved : null,
    });
  };

  const toggleNotApplicable = (code: string) => {
    const current = values.ratings.find((r) => r.indicator_code === code);
    const next = !current?.not_applicable;
    updateRating(code, {
      not_applicable: next,
      not_observed: false,
      rating: next ? null : current?.rating ?? null,
    });
  };

  const rated = values.ratings.filter(
    (r) => !r.not_applicable && r.rating != null,
  ).length;
  const scorable = values.ratings.filter((r) => !r.not_applicable).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{COT_FORM_LABELS[kind]}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="grid gap-1 sm:grid-cols-2">
              <div>
                <span className="font-medium">Teacher observed:</span>{" "}
                {teacherName}
              </div>
              <div>
                <span className="font-medium">
                  {kind === "agreement" ? "Observers:" : "Observer:"}
                </span>{" "}
                {observerName || "—"}
              </div>
              <div>
                <span className="font-medium">Career stage:</span>{" "}
                {stage.formLabel} ({stage.positionLabel})
              </div>
              <div>
                <span className="font-medium">Rating scale:</span>{" "}
                {stage.minRating}–{stage.maxRating} · NO = {stage.notObserved}
              </div>
            </div>
            {kind === "agreement" && (
              <p className="mt-2 text-xs text-muted-foreground">
                The final rating is <strong>not an average</strong> — it is a
                reasoned, consensual judgment agreed by the observers.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={values.observation_date}
                onChange={(e) => set("observation_date", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Time started</Label>
              <Input
                value={values.time_started}
                onChange={(e) => set("time_started", e.target.value)}
                placeholder="8:20 AM"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Time ended</Label>
              <Input
                value={values.time_ended}
                onChange={(e) => set("time_ended", e.target.value)}
                placeholder="9:20 AM"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Quarter</Label>
              <Input
                value={values.quarter != null ? String(values.quarter) : ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  set(
                    "quarter",
                    e.target.value === "" || Number.isNaN(n) ? null : n,
                  );
                }}
                placeholder="1"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Subject &amp; grade level taught</Label>
            <Input
              value={values.class_label}
              onChange={(e) => set("class_label", e.target.value)}
            />
          </div>

          {isRated && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  Indicators — S.Y. {formCycleSy} set ({indicators.length})
                </Label>
                <span className="text-xs text-muted-foreground">
                  {rated} of {scorable} rated
                </span>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="p-2 text-left font-medium">Indicator</th>
                      {kind === "rating" ? (
                        <>
                          {scale.map((level) => (
                            <th
                              key={level}
                              className="w-10 p-2 text-center font-medium"
                            >
                              {level}
                            </th>
                          ))}
                          <th className="w-12 p-2 text-center font-medium">NO</th>
                        </>
                      ) : (
                        <th className="w-40 p-2 text-center font-medium">
                          Final rating
                        </th>
                      )}
                      <th className="w-12 p-2 text-center font-medium">N/A</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indicators.map((ind) => {
                      const row = values.ratings.find(
                        (r) => r.indicator_code === ind.code,
                      );
                      const disabled = row?.not_applicable ?? false;
                      return (
                        <tr key={ind.code} className="border-t align-top">
                          <td
                            className={cn(
                              "p-2",
                              disabled && "text-muted-foreground line-through",
                            )}
                          >
                            <span className="font-medium">{ind.code}</span>{" "}
                            {ind.text}
                          </td>

                          {kind === "rating" ? (
                            <>
                              {scale.map((level) => (
                                <td key={level} className="p-1 text-center">
                                  <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => pickLevel(ind.code, level)}
                                    className={cn(
                                      "h-7 w-7 rounded border text-xs transition-colors",
                                      row?.rating === level && !row?.not_observed
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "hover:bg-muted",
                                      disabled && "opacity-40",
                                    )}
                                  >
                                    {row?.rating === level && !row?.not_observed
                                      ? "✓"
                                      : ""}
                                  </button>
                                </td>
                              ))}
                              <td className="p-1 text-center">
                                <button
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => toggleNotObserved(ind.code)}
                                  className={cn(
                                    "h-7 w-9 rounded border text-xs transition-colors",
                                    row?.not_observed
                                      ? "bg-amber-500 text-white border-amber-500"
                                      : "hover:bg-muted",
                                    disabled && "opacity-40",
                                  )}
                                >
                                  {row?.not_observed ? stage.notObserved : ""}
                                </button>
                              </td>
                            </>
                          ) : (
                            <td className="p-1 text-center">
                              <div className="flex justify-center gap-1">
                                {scale.map((level) => (
                                  <button
                                    key={level}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => pickLevel(ind.code, level)}
                                    className={cn(
                                      "h-7 w-7 rounded border text-xs transition-colors",
                                      row?.rating === level
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "hover:bg-muted",
                                      disabled && "opacity-40",
                                    )}
                                  >
                                    {level}
                                  </button>
                                ))}
                              </div>
                            </td>
                          )}

                          <td className="p-1 text-center">
                            <button
                              type="button"
                              onClick={() => toggleNotApplicable(ind.code)}
                              className={cn(
                                "h-7 w-9 rounded border text-xs transition-colors",
                                row?.not_applicable
                                  ? "bg-muted-foreground text-background border-muted-foreground"
                                  : "hover:bg-muted",
                              )}
                            >
                              N/A
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Mark <strong>NO</strong> for an indicator that was not observed —
                it automatically scores {stage.notObserved}, the lowest level of
                this career stage. Mark <strong>N/A</strong> for one that does not
                apply to this observation period; it is excluded entirely.
              </p>
            </div>
          )}

          {isRated ? (
            <div className="space-y-1.5">
              <Label>Other comments</Label>
              <Textarea
                rows={4}
                value={values.comments}
                onChange={(e) => set("comments", e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Observation notes</Label>
              <Textarea
                rows={14}
                value={values.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Write your observations on the teacher's classroom performance."
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {onPrint ? (
            <Button
              variant="outline"
              onClick={() => onPrint(values)}
              disabled={submitting}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onSubmit({ ...values, submit: false })}
              disabled={submitting}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save draft
            </Button>
            <Button
              onClick={() => onSubmit({ ...values, submit: true })}
              disabled={submitting}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit form
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
