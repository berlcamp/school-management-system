"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { INTERVENTION_STATUS_LABELS } from "@/lib/constants/manifestation";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import type {
  ManifestationIntervention,
  ManifestationInterventionStatus,
} from "@/types";
import {
  HandHelping,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface InterventionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  learnerName: string;
  tagId: string | null;
  interventions: ManifestationIntervention[];
  /** Reloads the roster after any change. */
  onChanged: () => void;
}

interface FormState {
  intervention_date: string;
  focus_area: string;
  strategy: string;
  resources: string;
  expected_outcome: string;
  progress: string;
  status: ManifestationInterventionStatus;
  ta_requested: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function blankForm(): FormState {
  return {
    intervention_date: today(),
    focus_area: "",
    strategy: "",
    resources: "",
    expected_outcome: "",
    progress: "",
    status: "planned",
    ta_requested: false,
  };
}

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * The adviser's intervention plans for one tagged learner, plus the School
 * Head's technical assistance on each.
 *
 * The adviser designs interventions and may flag one as needing TA; only a
 * school head / assistant school head / super admin can render the TA itself.
 */
export function InterventionsModal({
  open,
  onOpenChange,
  learnerName,
  tagId,
  interventions,
  onChanged,
}: InterventionsModalProps) {
  const user = useAppSelector((state) => state.user.user);
  const canRenderTa =
    user?.type === "school_head" ||
    user?.type === "assistant_school_head" ||
    user?.type === "super admin";

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(blankForm());
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const [taFor, setTaFor] = useState<string | null>(null);
  const [taNotes, setTaNotes] = useState("");
  const [savingTa, setSavingTa] = useState(false);

  useEffect(() => {
    if (!open) {
      setFormOpen(false);
      setEditingId(null);
      setTaFor(null);
    }
  }, [open]);

  const startAdd = () => {
    setForm(blankForm());
    setEditingId(null);
    setTouched(false);
    setFormOpen(true);
  };

  const startEdit = (iv: ManifestationIntervention) => {
    setForm({
      intervention_date: iv.intervention_date,
      focus_area: iv.focus_area ?? "",
      strategy: iv.strategy,
      resources: iv.resources ?? "",
      expected_outcome: iv.expected_outcome ?? "",
      progress: iv.progress ?? "",
      status: iv.status,
      ta_requested: iv.ta_requested,
    });
    setEditingId(iv.id);
    setTouched(false);
    setFormOpen(true);
  };

  const handleSave = async () => {
    setTouched(true);
    if (!tagId || !form.strategy.trim() || !form.intervention_date) return;
    setSaving(true);
    const payload = {
      intervention_date: form.intervention_date,
      focus_area: form.focus_area.trim() || null,
      strategy: form.strategy.trim(),
      resources: form.resources.trim() || null,
      expected_outcome: form.expected_outcome.trim() || null,
      progress: form.progress.trim() || null,
      status: form.status,
      ta_requested: form.ta_requested,
    };
    const { error } = editingId
      ? await supabase
          .from("sms_manifestation_interventions")
          .update(payload)
          .eq("id", editingId)
      : await supabase.from("sms_manifestation_interventions").insert({
          ...payload,
          tag_id: Number(tagId),
          created_by: user?.system_user_id ?? null,
        });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editingId ? "Intervention updated." : "Intervention added.");
    setFormOpen(false);
    setEditingId(null);
    onChanged();
  };

  const handleDelete = async (iv: ManifestationIntervention) => {
    if (!window.confirm("Delete this intervention?")) return;
    const { error } = await supabase
      .from("sms_manifestation_interventions")
      .delete()
      .eq("id", iv.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Intervention deleted.");
    onChanged();
  };

  const startTa = (iv: ManifestationIntervention) => {
    setTaFor(iv.id);
    setTaNotes(iv.ta_notes ?? "");
  };

  const saveTa = async (iv: ManifestationIntervention) => {
    setSavingTa(true);
    const clearing = !taNotes.trim();
    const { error } = await supabase
      .from("sms_manifestation_interventions")
      .update({
        ta_notes: clearing ? null : taNotes.trim(),
        ta_by: clearing ? null : (user?.system_user_id ?? null),
        ta_date: clearing ? null : today(),
        // Answering a request closes it out.
        ta_requested: clearing ? iv.ta_requested : false,
      })
      .eq("id", iv.id);
    setSavingTa(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(clearing ? "Technical assistance cleared." : "Technical assistance saved.");
    setTaFor(null);
    onChanged();
  };

  const invalidStrategy = touched && !form.strategy.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Interventions — {learnerName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!formOpen && (
            <Button size="sm" onClick={startAdd} disabled={!tagId}>
              <Plus className="mr-1 h-4 w-4" /> Add Intervention
            </Button>
          )}

          {formOpen && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {editingId ? "Edit Intervention" : "New Intervention"}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setFormOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Date<span className="text-red-500"> *</span>
                  </label>
                  <Input
                    type="date"
                    value={form.intervention_date}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        intervention_date: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Focus Area</label>
                  <Input
                    placeholder="e.g. Difficulty in Seeing"
                    value={form.focus_area}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, focus_area: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Status</label>
                  <Select
                    value={form.status}
                    onValueChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        status: v as ManifestationInterventionStatus,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.keys(
                          INTERVENTION_STATUS_LABELS,
                        ) as ManifestationInterventionStatus[]
                      ).map((s) => (
                        <SelectItem key={s} value={s}>
                          {INTERVENTION_STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Intervention / Strategy<span className="text-red-500"> *</span>
                </label>
                <Textarea
                  rows={3}
                  placeholder="What the adviser will do to support this learner."
                  value={form.strategy}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, strategy: e.target.value }))
                  }
                  className={invalidStrategy ? "border-red-500" : undefined}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Resources Needed
                  </label>
                  <Textarea
                    rows={2}
                    value={form.resources}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, resources: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Expected Outcome
                  </label>
                  <Textarea
                    rows={2}
                    value={form.expected_outcome}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        expected_outcome: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Progress</label>
                <Textarea
                  rows={2}
                  value={form.progress}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, progress: e.target.value }))
                  }
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.ta_requested}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, ta_requested: e.target.checked }))
                  }
                />
                Request technical assistance from the School Head
              </label>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFormOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save
                </Button>
              </div>
            </div>
          )}

          {interventions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No intervention designed yet for this learner.
            </p>
          ) : (
            <div className="space-y-3">
              {interventions.map((iv) => (
                <div key={iv.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {fmtDate(iv.intervention_date)}
                      </span>
                      <Badge variant="secondary">
                        {INTERVENTION_STATUS_LABELS[iv.status]}
                      </Badge>
                      {iv.focus_area && (
                        <Badge variant="outline">{iv.focus_area}</Badge>
                      )}
                      {iv.ta_requested && !iv.ta_notes && (
                        <Badge variant="orange">TA requested</Badge>
                      )}
                      {iv.ta_notes && <Badge variant="green">TA given</Badge>}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => startEdit(iv)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-600"
                        onClick={() => handleDelete(iv)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <dl className="mt-2 space-y-1 text-sm">
                    <div>
                      <dt className="inline font-medium">Strategy: </dt>
                      <dd className="inline whitespace-pre-wrap">
                        {iv.strategy}
                      </dd>
                    </div>
                    {iv.resources && (
                      <div>
                        <dt className="inline font-medium">Resources: </dt>
                        <dd className="inline whitespace-pre-wrap">
                          {iv.resources}
                        </dd>
                      </div>
                    )}
                    {iv.expected_outcome && (
                      <div>
                        <dt className="inline font-medium">
                          Expected outcome:{" "}
                        </dt>
                        <dd className="inline whitespace-pre-wrap">
                          {iv.expected_outcome}
                        </dd>
                      </div>
                    )}
                    {iv.progress && (
                      <div>
                        <dt className="inline font-medium">Progress: </dt>
                        <dd className="inline whitespace-pre-wrap">
                          {iv.progress}
                        </dd>
                      </div>
                    )}
                  </dl>

                  <div className="mt-3 rounded-md bg-muted/50 p-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <HandHelping className="h-3.5 w-3.5" />
                      Technical Assistance — School Head
                    </p>
                    {taFor === iv.id ? (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          rows={3}
                          placeholder="Technical assistance on this intervention."
                          value={taNotes}
                          onChange={(e) => setTaNotes(e.target.value)}
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setTaFor(null)}
                            disabled={savingTa}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => saveTa(iv)}
                            disabled={savingTa}
                          >
                            {savingTa && (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Save TA
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1">
                        <p className="whitespace-pre-wrap text-sm">
                          {iv.ta_notes ||
                            (iv.ta_requested
                              ? "Requested — awaiting the School Head."
                              : "No technical assistance rendered.")}
                        </p>
                        {iv.ta_notes && iv.ta_date && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Rendered {fmtDate(iv.ta_date)}
                          </p>
                        )}
                        {canRenderTa && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => startTa(iv)}
                          >
                            {iv.ta_notes ? "Edit TA" : "Render TA"}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
