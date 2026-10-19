"use client";

import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import {
  SBFP_FEEDBACK_CATEGORIES,
  SBFP_FEEDBACK_SOURCES,
  SBFP_FEEDBACK_STATUS_OPTIONS,
  type SbfpFeedbackStatus,
} from "@/lib/constants/sbfp";
import { mdy, printSbfpFeedbackLog } from "@/lib/pdf/generateSbfpForms";
import {
  deleteFeedback,
  fetchFeedback,
  saveFeedback,
  type SbfpFeedback,
  type SbfpFeedbackInput,
} from "@/lib/sbfp/queries";
import { todayIso } from "@/lib/utils/schoolCalendar";
import { Loader2, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { buildSbfpHeaderInfo } from "./headerInfo";
import type { SbfpTabProps } from "./types";

const ALL = "__all__";
const NONE = "__none__";

const blankDraft = (): SbfpFeedbackInput => ({
  received_on: todayIso(),
  source: null,
  raised_by: "",
  category: null,
  concern: "",
  action_taken: "",
  status: "open",
  resolved_on: null,
});

const STATUS_VARIANT: Record<SbfpFeedbackStatus, "destructive" | "secondary" | "outline"> = {
  open: "destructive",
  in_progress: "secondary",
  resolved: "outline",
};

const statusLabel = (s: SbfpFeedbackStatus) =>
  SBFP_FEEDBACK_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;

/** A stored value no longer in the list still shows in the picker (migration 212). */
const withStored = (list: readonly string[], stored: string | null) =>
  stored && !list.includes(stored) ? [...list, stored] : list;

export function FeedbackTab({
  schoolId,
  schoolYear,
  program,
  canManage,
  actorId,
  canLog,
}: SbfpTabProps & {
  /** A manager or a teacher of the school (migration 212). */
  canLog: boolean;
}) {
  const { settings } = useSchoolSettings(true, schoolId);
  const [entries, setEntries] = useState<SbfpFeedback[]>([]);
  const [draft, setDraft] = useState<SbfpFeedbackInput>(blankDraft);
  const [filter, setFilter] = useState<string>(ALL);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    if (!program) return;
    try {
      setEntries(await fetchFeedback(program.id));
    } catch (err) {
      console.error("Error loading SBFP feedback:", err);
      toast.error("Failed to load feedback");
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

  const shown = useMemo(
    () => (filter === ALL ? entries : entries.filter((e) => e.status === filter)),
    [entries, filter],
  );

  const counts = useMemo(() => {
    const c: Record<SbfpFeedbackStatus, number> = { open: 0, in_progress: 0, resolved: 0 };
    for (const e of entries) c[e.status] += 1;
    return c;
  }, [entries]);

  if (!program) return null;

  const canEdit = (e: SbfpFeedback) =>
    canManage || (canLog && actorId != null && e.created_by === actorId);

  const handleSave = async () => {
    if (!draft.concern.trim()) {
      toast.error("Describe the issue or concern");
      return;
    }
    if (!draft.received_on) {
      toast.error("Enter the date received");
      return;
    }
    if (draft.status === "resolved" && draft.resolved_on && draft.resolved_on < draft.received_on) {
      toast.error("Date resolved cannot be before the date received");
      return;
    }
    setSaving(true);
    try {
      await saveFeedback(program.id, draft);
      toast.success(draft.id ? "Entry updated" : "Entry added");
      setDraft(blankDraft());
      await load();
    } catch (err) {
      console.error("Error saving SBFP feedback:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: SbfpFeedback) => {
    if (!window.confirm("Remove this entry?")) return;
    try {
      await deleteFeedback(e.id);
      if (draft.id === e.id) setDraft(blankDraft());
      await load();
    } catch (err) {
      console.error("Error deleting SBFP feedback:", err);
      toast.error("Failed to delete");
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const info = await buildSbfpHeaderInfo(program, schoolId, schoolYear, settings);
      printSbfpFeedbackLog(info, shown);
    } catch (err) {
      console.error("Error printing SBFP feedback:", err);
      toast.error("Failed to generate the printout");
    } finally {
      setPrinting(false);
    }
  };

  const edit = (e: SbfpFeedback) => {
    setDraft({
      id: e.id,
      received_on: e.received_on,
      source: e.source,
      raised_by: e.raised_by ?? "",
      category: e.category,
      concern: e.concern,
      action_taken: e.action_taken ?? "",
      status: e.status,
      resolved_on: e.resolved_on,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-4">
      {canLog && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {draft.id ? "Edit issue / concern" : "Record an issue or concern"}
            </CardTitle>
            <CardDescription>
              Log each issue or concern raised about the feeding programme, what was
              done about it, and whether it is resolved.
              {!canManage && " You can edit only the entries you recorded."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Date received</Label>
              <Input
                type="date"
                value={draft.received_on}
                onChange={(e) => setDraft((d) => ({ ...d, received_on: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Raised by</Label>
              <Select
                value={draft.source ?? NONE}
                onValueChange={(v) => setDraft((d) => ({ ...d, source: v === NONE ? null : v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {withStored(SBFP_FEEDBACK_SOURCES, draft.source).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Name (optional)</Label>
              <Input
                value={draft.raised_by ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, raised_by: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={draft.category ?? NONE}
                onValueChange={(v) =>
                  setDraft((d) => ({ ...d, category: v === NONE ? null : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {withStored(SBFP_FEEDBACK_CATEGORIES, draft.category).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Issue / concern</Label>
              <Textarea
                rows={3}
                value={draft.concern}
                onChange={(e) => setDraft((d) => ({ ...d, concern: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Action taken</Label>
              <Textarea
                rows={3}
                value={draft.action_taken ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, action_taken: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={draft.status}
                onValueChange={(v) =>
                  setDraft((d) => ({
                    ...d,
                    status: v as SbfpFeedbackStatus,
                    resolved_on: v === "resolved" ? d.resolved_on ?? todayIso() : null,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SBFP_FEEDBACK_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date resolved</Label>
              <Input
                type="date"
                disabled={draft.status !== "resolved"}
                value={draft.resolved_on ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, resolved_on: e.target.value || null }))
                }
              />
            </div>
            <div className="flex items-end gap-2 md:col-span-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                {draft.id ? "Update" : "Add"}
              </Button>
              {draft.id && (
                <Button variant="ghost" onClick={() => setDraft(blankDraft())}>
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All ({entries.length})</SelectItem>
              {SBFP_FEEDBACK_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label} ({counts[o.value]})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={handlePrint} disabled={printing}>
          {printing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Printer className="h-4 w-4 mr-2" />
          )}
          Print{filter === ALL ? "" : ` (${statusLabel(filter as SbfpFeedbackStatus)})`}
        </Button>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No issues or concerns recorded.
        </p>
      ) : (
        <div className="app__table_shell">
          <div className="app__table_wrapper">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left font-medium">#</th>
                  <th className="text-left font-medium">Date received</th>
                  <th className="text-left font-medium">Raised by</th>
                  <th className="text-left font-medium">Category</th>
                  <th className="text-left font-medium">Issue / concern</th>
                  <th className="text-left font-medium">Action taken</th>
                  <th className="text-left font-medium">Status</th>
                  <th className="text-left font-medium">Recorded by</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e, i) => (
                  <tr key={e.id} className="align-top">
                    <td>{i + 1}</td>
                    <td className="whitespace-nowrap">{mdy(e.received_on)}</td>
                    <td>
                      {e.source ?? "—"}
                      {e.raised_by && (
                        <div className="text-xs text-muted-foreground">{e.raised_by}</div>
                      )}
                    </td>
                    <td>{e.category ?? "—"}</td>
                    <td className="whitespace-pre-line min-w-[200px]">{e.concern}</td>
                    <td className="whitespace-pre-line min-w-[180px]">{e.action_taken}</td>
                    <td className="whitespace-nowrap">
                      <Badge variant={STATUS_VARIANT[e.status]}>{statusLabel(e.status)}</Badge>
                      {e.resolved_on && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {mdy(e.resolved_on)}
                        </div>
                      )}
                    </td>
                    <td className="text-xs text-muted-foreground">{e.created_by_name ?? ""}</td>
                    <td className="whitespace-nowrap text-right">
                      {canEdit(e) && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit"
                            onClick={() => edit(e)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete"
                            onClick={() => handleDelete(e)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </td>
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
