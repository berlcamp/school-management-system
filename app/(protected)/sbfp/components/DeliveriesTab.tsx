"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getGradeLevelLabel } from "@/lib/constants";
import {
  SBFP_DELIVERY_COMPONENT_OPTIONS,
  type SbfpDeliveryComponent,
} from "@/lib/constants/sbfp";
import {
  deleteDelivery,
  fetchDeliveries,
  saveDelivery,
} from "@/lib/sbfp/queries";
import type { SbfpDelivery } from "@/lib/utils/sbfp";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import type { SbfpTabProps } from "./types";

type Draft = Omit<SbfpDelivery, "id"> & { id?: string };

const blankDraft = (gradeLevel: number): Draft => ({
  component: "nfp",
  grade_level: gradeLevel,
  delivered_on: null,
  packs_new: 0,
  packs_replacement: 0,
  packs_rejected: 0,
  remarks: "",
});

const toCount = (v: string) => Math.max(0, Math.trunc(Number(v) || 0));

export function DeliveriesTab({ program, sections, canManage }: SbfpTabProps) {
  const gradeLevels = useMemo(() => {
    const levels = new Set<number>([0, 1, 2, 3, 4, 5, 6]);
    for (const s of sections) levels.add(s.grade_level);
    return [...levels].sort((a, b) => a - b);
  }, [sections]);

  const [deliveries, setDeliveries] = useState<SbfpDelivery[]>([]);
  const [draft, setDraft] = useState<Draft>(() => blankDraft(0));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!program) return;
    try {
      setDeliveries(await fetchDeliveries(program.id));
    } catch (err) {
      console.error("Error loading deliveries:", err);
      toast.error("Failed to load deliveries");
    }
  }, [program]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (isMounted) await load();
    })();
    return () => {
      isMounted = false;
    };
  }, [load]);

  const handleSave = async () => {
    if (!program) return;
    setSaving(true);
    try {
      await saveDelivery(program.id, draft);
      toast.success(draft.id ? "Delivery updated" : "Delivery added");
      setDraft(blankDraft(draft.grade_level));
      await load();
    } catch (err) {
      console.error("Error saving delivery:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDelivery(id);
      await load();
    } catch (err) {
      console.error("Error deleting delivery:", err);
      toast.error("Failed to delete");
    }
  };

  return (
    <div className="space-y-4">
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {draft.id ? "Edit delivery" : "Record a delivery"}
            </CardTitle>
            <CardDescription>
              One line per delivery per grade level. Beneficiary counts on Form 6
              come from the beneficiary list, so they are not typed here.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Component</Label>
              <Select
                value={draft.component}
                onValueChange={(v) =>
                  setDraft((d) => ({ ...d, component: v as SbfpDeliveryComponent }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SBFP_DELIVERY_COMPONENT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Grade level</Label>
              <Select
                value={String(draft.grade_level)}
                onValueChange={(v) => setDraft((d) => ({ ...d, grade_level: Number(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {gradeLevels.map((g) => (
                    <SelectItem key={g} value={String(g)}>
                      {getGradeLevelLabel(g)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date delivered</Label>
              <Input
                type="date"
                value={draft.delivered_on ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, delivered_on: e.target.value || null }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Remarks</Label>
              <Input
                value={draft.remarks ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, remarks: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Packs received — new</Label>
              <Input
                type="number"
                min={0}
                value={draft.packs_new}
                onChange={(e) => setDraft((d) => ({ ...d, packs_new: toCount(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Packs received — replacement</Label>
              <Input
                type="number"
                min={0}
                value={draft.packs_replacement}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, packs_replacement: toCount(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Packs for replacement / rejected</Label>
              <Input
                type="number"
                min={0}
                value={draft.packs_rejected}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, packs_rejected: toCount(e.target.value) }))
                }
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                {draft.id ? "Update" : "Add"}
              </Button>
              {draft.id && (
                <Button variant="ghost" onClick={() => setDraft(blankDraft(draft.grade_level))}>
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {deliveries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No deliveries recorded.
        </p>
      ) : (
        <div className="app__table_shell">
          <div className="app__table_wrapper">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left font-medium">Component</th>
                  <th className="text-left font-medium">Grade level</th>
                  <th className="text-left font-medium">Date delivered</th>
                  <th className="text-right font-medium">New</th>
                  <th className="text-right font-medium">Replacement</th>
                  <th className="text-right font-medium">Total</th>
                  <th className="text-right font-medium">Rejected</th>
                  <th className="text-left font-medium">Remarks</th>
                  {canManage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id}>
                    <td>{d.component === "nfp" ? "NFP" : "Milk"}</td>
                    <td>{getGradeLevelLabel(d.grade_level)}</td>
                    <td>{d.delivered_on ?? "—"}</td>
                    <td className="text-right tabular-nums">{d.packs_new}</td>
                    <td className="text-right tabular-nums">{d.packs_replacement}</td>
                    <td className="text-right tabular-nums">
                      {d.packs_new + d.packs_replacement}
                    </td>
                    <td className="text-right tabular-nums">{d.packs_rejected}</td>
                    <td>{d.remarks}</td>
                    {canManage && (
                      <td className="whitespace-nowrap text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit"
                          onClick={() => setDraft({ ...d })}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete"
                          onClick={() => handleDelete(d.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
