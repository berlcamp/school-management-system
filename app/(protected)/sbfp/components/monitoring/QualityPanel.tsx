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
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSchoolSettings } from "@/hooks/useSchoolSettings";
import { SBFP_FACE_SCALE, type SbfpQualityQuestionKind } from "@/lib/constants/sbfp";
import { mdy, printSbfpQualitySummary } from "@/lib/pdf/generateSbfpForms";
import {
  deleteQualityResponse,
  fetchBeneficiaryViews,
  fetchQualityQuestions,
  fetchQualityResponses,
  saveQualityQuestion,
  saveQualityResponse,
  type SbfpQualityResponse,
  type SbfpQualityResponseInput,
} from "@/lib/sbfp/queries";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/utils/schoolCalendar";
import {
  schoolYearMonths,
  summarizeQuality,
  type QualityQuestion,
} from "@/lib/utils/sbfp";
import { Loader2, Pencil, Plus, Printer, Settings2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { buildSbfpHeaderInfo } from "../headerInfo";
import { gradeSectionLabel } from "../types";
import {
  ALL_MONTHS,
  canEditEntry,
  defaultMonth,
  monthLabel,
  MonthFilter,
  type MonitoringPanelProps,
} from "./shared";

const ANONYMOUS = "__anon__";

const blankDraft = (day: string): SbfpQualityResponseInput => ({
  evaluated_on: day,
  beneficiary_id: null,
  answers: {},
});

const faceFor = (v: string | number | undefined) =>
  SBFP_FACE_SCALE.find((f) => f.value === Number(v));

export function QualityPanel({
  isDivisionManager,
  ...props
}: MonitoringPanelProps & {
  /** Super admin / division_admin maintain the division-wide questions. */
  isDivisionManager: boolean;
}) {
  const { schoolId, schoolYear, program, canLog } = props;
  const { settings } = useSchoolSettings(true, schoolId);
  const months = useMemo(() => schoolYearMonths(schoolYear), [schoolYear]);
  const [month, setMonth] = useState(() => defaultMonth(months, todayIso()));
  const [questions, setQuestions] = useState<QualityQuestion[]>([]);
  const [responses, setResponses] = useState<SbfpQualityResponse[]>([]);
  const [learners, setLearners] = useState<{ id: string; name: string; gradeSection: string }[]>([]);
  const [draft, setDraft] = useState<SbfpQualityResponseInput>(() => blankDraft(todayIso()));
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [managing, setManaging] = useState(false);

  const load = useCallback(async () => {
    try {
      const [qs, rs, bens] = await Promise.all([
        fetchQualityQuestions(),
        fetchQualityResponses(program.id),
        fetchBeneficiaryViews(program),
      ]);
      setQuestions(qs);
      setResponses(rs);
      setLearners(
        bens.map((b) => ({
          id: b.id,
          name: b.name,
          gradeSection: gradeSectionLabel(b.grade_level, b.section_name),
        })),
      );
    } catch (err) {
      console.error("Error loading quality evaluations:", err);
      toast.error("Failed to load quality evaluations");
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

  const active = useMemo(() => questions.filter((q) => q.is_active), [questions]);
  const learnerById = useMemo(() => new Map(learners.map((l) => [l.id, l])), [learners]);

  const shown = useMemo(
    () =>
      month === ALL_MONTHS ? responses : responses.filter((r) => r.evaluated_on.startsWith(month)),
    [responses, month],
  );
  const summaries = useMemo(() => summarizeQuality(questions, shown), [questions, shown]);

  // While editing, a retired question this response answered stays on the form.
  const formQuestions = useMemo(
    () => questions.filter((q) => q.is_active || draft.answers[q.id] !== undefined),
    [questions, draft.answers],
  );

  const setAnswer = (qid: string, v: string | number) =>
    setDraft((d) => ({ ...d, answers: { ...d.answers, [qid]: v } }));

  const handleSave = async () => {
    const answered = Object.values(draft.answers).filter((v) => v !== "" && v != null).length;
    if (answered === 0) {
      toast.error("Answer at least one question");
      return;
    }
    setSaving(true);
    try {
      await saveQualityResponse(program.id, draft);
      toast.success(draft.id ? "Evaluation updated" : "Evaluation saved — ready for the next learner");
      // Keep the date: evaluations are taken one learner after another.
      setDraft(blankDraft(draft.evaluated_on));
      await load();
    } catch (err) {
      console.error("Error saving quality evaluation:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r: SbfpQualityResponse) => {
    if (!window.confirm("Remove this evaluation?")) return;
    try {
      await deleteQualityResponse(r.id);
      if (draft.id === r.id) setDraft(blankDraft(todayIso()));
      await load();
    } catch (err) {
      console.error("Error deleting quality evaluation:", err);
      toast.error("Failed to delete");
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const info = await buildSbfpHeaderInfo(program, schoolId, schoolYear, settings);
      printSbfpQualitySummary(
        info,
        summaries,
        shown.length,
        month === ALL_MONTHS ? `SY ${schoolYear}` : monthLabel(month),
      );
    } catch (err) {
      console.error("Error printing quality summary:", err);
      toast.error("Failed to generate the printout");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-4">
      {isDivisionManager && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setManaging(true)}>
            <Settings2 className="h-4 w-4 mr-2" />
            Manage questions
          </Button>
        </div>
      )}

      {canLog && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {draft.id ? "Edit evaluation" : "Daily Hot Meals Quality Evaluation Tool"}
            </CardTitle>
            <CardDescription>
              One evaluation per learner. Let the learner pick the face that best
              describes their answer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={draft.evaluated_on}
                  onChange={(e) => setDraft((d) => ({ ...d, evaluated_on: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Learner (optional)</Label>
                <Select
                  value={draft.beneficiary_id ?? ANONYMOUS}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, beneficiary_id: v === ANONYMOUS ? null : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANONYMOUS}>Anonymous</SelectItem>
                    {learners.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                        <span className="ml-2 text-xs text-muted-foreground">{l.gradeSection}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formQuestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No questions are set up. The division office adds them.
              </p>
            ) : (
              <div className="space-y-4">
                {formQuestions.map((q) =>
                  q.kind === "face" ? (
                    <div key={q.id} className="space-y-2">
                      <Label className="text-sm">{q.prompt}</Label>
                      <div className="flex flex-wrap gap-2">
                        {SBFP_FACE_SCALE.map((f) => {
                          const on = Number(draft.answers[q.id]) === f.value;
                          return (
                            <button
                              key={f.value}
                              type="button"
                              aria-pressed={on}
                              aria-label={f.label}
                              onClick={() => setAnswer(q.id, f.value)}
                              className={cn(
                                "flex w-20 flex-col items-center rounded-lg border p-2 transition-colors",
                                on
                                  ? "border-primary bg-primary/10 ring-2 ring-primary"
                                  : "hover:bg-muted",
                              )}
                            >
                              <span className="text-3xl leading-none">{f.emoji}</span>
                              <span className="mt-1 text-[11px] text-muted-foreground">
                                {f.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div key={q.id} className="space-y-1.5">
                      <Label className="text-sm">{q.prompt}</Label>
                      <Textarea
                        rows={2}
                        value={String(draft.answers[q.id] ?? "")}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                      />
                    </div>
                  ),
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving || formQuestions.length === 0}>
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                {draft.id ? "Update" : "Save"}
              </Button>
              {draft.id && (
                <Button variant="ghost" onClick={() => setDraft(blankDraft(todayIso()))}>
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthFilter months={months} value={month} onChange={setMonth} />
        <Button variant="outline" onClick={handlePrint} disabled={printing || shown.length === 0}>
          {printing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Printer className="h-4 w-4 mr-2" />
          )}
          Print summary
        </Button>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No evaluations recorded.</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Summary — {shown.length} evaluation{shown.length === 1 ? "" : "s"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {summaries
                .filter((s) => s.question.kind === "face")
                .map((s) => (
                  <div key={s.question.id} className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>{s.question.prompt}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {s.mean == null ? "—" : `${faceFor(Math.round(s.mean))?.emoji ?? ""} ${s.mean.toFixed(2)}`}{" "}
                        ({s.answered})
                      </span>
                    </div>
                    <div className="flex h-3 overflow-hidden rounded bg-muted">
                      {SBFP_FACE_SCALE.map((f, i) => {
                        const n = s.distribution.get(f.value) ?? 0;
                        if (!n) return null;
                        return (
                          <div
                            key={f.value}
                            title={`${f.emoji} ${f.label}: ${n}`}
                            className="h-full"
                            style={{
                              width: `${(n / s.answered) * 100}%`,
                              backgroundColor: `hsl(${(i / (SBFP_FACE_SCALE.length - 1)) * 120} 60% 50%)`,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              {summaries
                .filter((s) => s.question.kind === "text" && s.texts.length > 0)
                .map((s) => (
                  <div key={s.question.id} className="space-y-1">
                    <div className="text-sm font-medium">{s.question.prompt}</div>
                    <ul className="list-disc pl-5 text-sm text-muted-foreground max-h-40 overflow-y-auto">
                      {s.texts.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </div>
                ))}
            </CardContent>
          </Card>

          <div className="app__table_shell">
            <div className="app__table_wrapper">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left font-medium">Date</th>
                    <th className="text-left font-medium">Learner</th>
                    <th className="text-left font-medium">Grade &amp; Section</th>
                    {active
                      .filter((q) => q.kind === "face")
                      .map((q, i) => (
                        <th key={q.id} className="text-center font-medium" title={q.prompt}>
                          Q{i + 1}
                        </th>
                      ))}
                    <th className="text-left font-medium">Recorded by</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{mdy(r.evaluated_on)}</td>
                      <td>
                        {r.beneficiary_id ? learnerById.get(r.beneficiary_id)?.name ?? "—" : "Anonymous"}
                      </td>
                      <td className="whitespace-nowrap">
                        {r.beneficiary_id ? learnerById.get(r.beneficiary_id)?.gradeSection ?? "—" : "—"}
                      </td>
                      {active
                        .filter((q) => q.kind === "face")
                        .map((q) => (
                          <td key={q.id} className="text-center text-lg">
                            {faceFor(r.answers[q.id])?.emoji ?? ""}
                          </td>
                        ))}
                      <td className="text-xs text-muted-foreground">{r.created_by_name ?? ""}</td>
                      <td className="whitespace-nowrap text-right">
                        {canEditEntry(props, r.created_by) && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Edit"
                              onClick={() => {
                                setDraft({
                                  id: r.id,
                                  evaluated_on: r.evaluated_on,
                                  beneficiary_id: r.beneficiary_id,
                                  answers: r.answers,
                                });
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Delete"
                              onClick={() => handleDelete(r)}
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
        </>
      )}

      {isDivisionManager && (
        <ManageQuestionsDialog
          open={managing}
          onOpenChange={setManaging}
          questions={questions}
          onSaved={load}
        />
      )}
    </div>
  );
}

function ManageQuestionsDialog({
  open,
  onOpenChange,
  questions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  questions: QualityQuestion[];
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<{
    id?: string;
    kind: SbfpQualityQuestionKind;
    prompt: string;
    sort_order: number;
    is_active: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (q: NonNullable<typeof editing>) => {
    if (!q.prompt.trim()) {
      toast.error("Enter the question");
      return;
    }
    setSaving(true);
    try {
      await saveQualityQuestion(q);
      setEditing(null);
      await onSaved();
    } catch (err) {
      console.error("Error saving question:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const nextOrder = Math.max(0, ...questions.map((q) => q.sort_order)) + 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Hot Meals Quality Evaluation — questions</DialogTitle>
          <DialogDescription>
            Shared by every school in the division. A question is retired rather than
            deleted, so evaluations already taken still print against it. To change what
            a question means, retire it and add a new one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {questions.map((q) => (
            <div
              key={q.id}
              className={cn(
                "flex items-center gap-2 rounded-md border p-2 text-sm",
                !q.is_active && "opacity-60",
              )}
            >
              <span className="w-6 text-right tabular-nums text-muted-foreground">
                {q.sort_order}
              </span>
              <Badge variant="outline">{q.kind === "face" ? "Smileys" : "Text"}</Badge>
              <span className="flex-1">{q.prompt}</span>
              <span className="text-xs text-muted-foreground">
                {q.is_active ? "Active" : "Retired"}
              </span>
              <Switch
                checked={q.is_active}
                disabled={saving}
                onCheckedChange={(v) => save({ ...q, is_active: v })}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Edit"
                onClick={() => setEditing({ ...q })}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {editing ? (
          <div className="space-y-3 rounded-md border p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_140px_90px]">
              <div className="space-y-1.5">
                <Label>Question</Label>
                <Input
                  value={editing.prompt}
                  onChange={(e) => setEditing({ ...editing, prompt: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Answer</Label>
                <Select
                  value={editing.kind}
                  onValueChange={(v) =>
                    setEditing({ ...editing, kind: v as SbfpQualityQuestionKind })
                  }
                  disabled={!!editing.id}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="face">Smileys</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Order</Label>
                <Input
                  type="number"
                  value={editing.sort_order}
                  onChange={(e) =>
                    setEditing({ ...editing, sort_order: Math.trunc(Number(e.target.value) || 0) })
                  }
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => save(editing)} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() =>
              setEditing({ kind: "face", prompt: "", sort_order: nextOrder, is_active: true })
            }
          >
            <Plus className="h-4 w-4 mr-2" />
            Add question
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
