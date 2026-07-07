"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  CRLA_GRADES,
  CRLA_LANGUAGES,
  CRLA_OBSERVATION_LEVELS,
  getGradeLevelLabel,
} from "@/lib/constants";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addItem, updateList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { CrlaRecordForm } from "@/types";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface LineRow {
  id?: string;
  line_text: string;
  word_count: number;
  question: string;
  answer_key: string;
}

interface ObservationRow {
  level_no: number;
  description: string;
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  editData?: CrlaRecordForm | null;
}

const emptyLine = (): LineRow => ({
  line_text: "",
  word_count: 0,
  question: "",
  answer_key: "",
});

export const AddModal = ({ isOpen, onClose, editData }: ModalProps) => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.user.user);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingChildren, setLoadingChildren] = useState(false);

  const [title, setTitle] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [language, setLanguage] = useState("");
  const [storyTitle, setStoryTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [observations, setObservations] = useState<ObservationRow[]>([]);
  const [originalLineIds, setOriginalLineIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    if (editData?.id) {
      setTitle(editData.title || "");
      setGradeLevel(String(editData.grade_level));
      setLanguage(editData.language || "");
      setStoryTitle(editData.story_title || "");
      setInstructions(editData.instructions || "");
      setIsActive(editData.is_active ?? true);

      const loadChildren = async () => {
        setLoadingChildren(true);
        const [{ data: lineRows }, { data: obsRows }] = await Promise.all([
          supabase
            .from("sms_crla_record_form_lines")
            .select("*")
            .eq("record_form_id", editData.id)
            .order("position"),
          supabase
            .from("sms_crla_record_form_observations")
            .select("*")
            .eq("record_form_id", editData.id)
            .order("level_no"),
        ]);
        setLines(
          (lineRows || []).map((l) => ({
            id: String(l.id),
            line_text: l.line_text || "",
            word_count: Number(l.word_count),
            question: l.question || "",
            answer_key: l.answer_key || "",
          })),
        );
        setOriginalLineIds((lineRows || []).map((l) => String(l.id)));
        const obs =
          obsRows && obsRows.length > 0
            ? obsRows.map((o) => ({
                level_no: Number(o.level_no),
                description: o.description || "",
              }))
            : CRLA_OBSERVATION_LEVELS.map((o) => ({ ...o }));
        setObservations(obs);
        setLoadingChildren(false);
      };
      loadChildren();
    } else {
      setTitle("");
      setGradeLevel("");
      setLanguage("");
      setStoryTitle("");
      setInstructions("");
      setIsActive(true);
      setLines([emptyLine()]);
      setOriginalLineIds([]);
      setObservations(CRLA_OBSERVATION_LEVELS.map((o) => ({ ...o })));
    }
  }, [isOpen, editData]);

  const setLine = (idx: number, patch: Partial<LineRow>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const setObservation = (idx: number, description: string) =>
    setObservations((prev) =>
      prev.map((o, i) => (i === idx ? { ...o, description } : o)),
    );

  const totalWords = lines.reduce((sum, l) => sum + (Number(l.word_count) || 0), 0);

  const onSubmit = async () => {
    if (isSubmitting) return;
    if (!title.trim()) return toast.error("Title is required.");
    if (!gradeLevel) return toast.error("Grade level is required.");
    if (!language) return toast.error("Language is required.");
    const validLines = lines.filter((l) => l.line_text.trim());
    if (validLines.length === 0)
      return toast.error("Add at least one passage line.");

    setIsSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        grade_level: Number(gradeLevel),
        language,
        story_title: storyTitle.trim() || null,
        instructions: instructions.trim() || null,
        is_active: isActive,
      };

      let formId: string;
      if (editData?.id) {
        const { error } = await supabase
          .from("sms_crla_record_forms")
          .update(payload)
          .eq("id", editData.id);
        if (error) throw new Error(error.message);
        formId = String(editData.id);
      } else {
        const { data: inserted, error } = await supabase
          .from("sms_crla_record_forms")
          .insert([{ ...payload, created_by: user?.system_user_id ?? null }])
          .select()
          .single();
        if (error) throw new Error(error.message);
        formId = String(inserted.id);
      }

      // Sync lines: update existing (preserve recorded line scores), insert
      // new, delete removed.
      const keptIds: string[] = [];
      for (let i = 0; i < validLines.length; i++) {
        const l = validLines[i];
        const row = {
          position: i,
          line_text: l.line_text.trim(),
          word_count: Number(l.word_count) || 0,
          question: l.question.trim() || null,
          answer_key: l.answer_key.trim() || null,
        };
        if (l.id) {
          keptIds.push(l.id);
          await supabase
            .from("sms_crla_record_form_lines")
            .update(row)
            .eq("id", l.id);
        } else {
          await supabase
            .from("sms_crla_record_form_lines")
            .insert([{ ...row, record_form_id: Number(formId) }]);
        }
      }
      const removedIds = originalLineIds.filter((id) => !keptIds.includes(id));
      if (removedIds.length > 0) {
        await supabase
          .from("sms_crla_record_form_lines")
          .delete()
          .in("id", removedIds);
      }

      // Observations: replace wholesale (record.observation_level is a plain int,
      // not an FK, so this is safe).
      await supabase
        .from("sms_crla_record_form_observations")
        .delete()
        .eq("record_form_id", formId);
      await supabase.from("sms_crla_record_form_observations").insert(
        observations.map((o) => ({
          record_form_id: Number(formId),
          level_no: o.level_no,
          description: o.description.trim() || `Level ${o.level_no}`,
        })),
      );

      const { data: fresh } = await supabase
        .from("sms_crla_record_forms")
        .select("*")
        .eq("id", formId)
        .single();
      if (fresh) {
        dispatch(editData?.id ? updateList(fresh) : addItem(fresh));
      }

      toast.success(editData ? "Record form updated!" : "Record form added!");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error saving record form");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-[820px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {editData ? "Edit" : "Add"} CRLA Record Form
          </DialogTitle>
          <DialogDescription>
            Part 2 — Reading Fluency &amp; Comprehension. Break the story into
            passage lines (with word counts and optional questions) and set the
            observation rubric.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label className="mb-1.5 block">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., English Reading Fluency and Comprehension – Grade 3"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">
                Grade Level <span className="text-red-500">*</span>
              </Label>
              <Select value={gradeLevel} onValueChange={setGradeLevel} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select grade" />
                </SelectTrigger>
                <SelectContent>
                  {CRLA_GRADES.map((g) => (
                    <SelectItem key={g} value={String(g)}>
                      {getGradeLevelLabel(g)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">
                Language <span className="text-red-500">*</span>
              </Label>
              <Select value={language} onValueChange={setLanguage} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {CRLA_LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Story title</Label>
              <Input
                value={storyTitle}
                onChange={(e) => setStoryTitle(e.target.value)}
                placeholder="e.g., STORY 1 – PARA THE PARROT"
                disabled={isSubmitting}
              />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Switch checked={isActive} onCheckedChange={setIsActive} disabled={isSubmitting} />
              <Label>Active</Label>
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">Instructions</Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Administration notes…"
              rows={2}
              disabled={isSubmitting}
            />
          </div>

          {/* Passage lines editor */}
          <div className="rounded-md border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                Passage Lines{" "}
                <span className="font-normal text-muted-foreground">
                  (total words: {totalWords})
                </span>
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
                disabled={isSubmitting}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add line
              </Button>
            </div>
            {loadingChildren ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <div className="grid grid-cols-12 gap-2 text-[11px] font-medium text-muted-foreground">
                  <div className="col-span-4">Passage line</div>
                  <div className="col-span-1"># words</div>
                  <div className="col-span-3">Question (optional)</div>
                  <div className="col-span-3">Answer key</div>
                  <div className="col-span-1" />
                </div>
                {lines.map((l, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-4">
                      <Textarea
                        value={l.line_text}
                        onChange={(e) => setLine(idx, { line_text: e.target.value })}
                        placeholder="Passage line"
                        rows={2}
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="col-span-1">
                      <Input
                        type="number"
                        min={0}
                        value={l.word_count}
                        onChange={(e) =>
                          setLine(idx, { word_count: Number(e.target.value || 0) })
                        }
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="col-span-3">
                      <Textarea
                        value={l.question}
                        onChange={(e) => setLine(idx, { question: e.target.value })}
                        placeholder="Comprehension question"
                        rows={2}
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="col-span-3">
                      <Textarea
                        value={l.answer_key}
                        onChange={(e) => setLine(idx, { answer_key: e.target.value })}
                        placeholder="Acceptable answer(s)"
                        rows={2}
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setLines((prev) => prev.filter((_, i) => i !== idx))
                        }
                        disabled={isSubmitting}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Observations rubric */}
          <div className="rounded-md border p-4 space-y-3">
            <p className="text-sm font-semibold">Observations (Fluency Levels)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {observations.map((o, idx) => (
                <div key={o.level_no}>
                  <Label className="mb-1 block text-xs">Level {o.level_no}</Label>
                  <Input
                    value={o.description}
                    onChange={(e) => setObservation(idx, e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={isSubmitting} className="min-w-[100px]">
            {isSubmitting ? "Saving…" : editData ? "Update" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
