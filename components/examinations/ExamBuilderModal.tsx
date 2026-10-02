"use client";

/**
 * Shared Exam builder (create / edit), used by the Division and Teacher
 * examination pages. Diverges only by `mode`:
 *   - division: saved with school_id = NULL (shared to all teachers)
 *   - teacher:  saved with school_id = <schoolId>, and `is_school_shared`
 *               chooses between the two school-level tiers (migration 160):
 *               shared with every teacher at that school, or private to
 *               created_by, which is what school-level meant before 160.
 *
 * The exam is authored as an ordered list of PARTS. Each part is one question
 * type (e.g. "Part I. Multiple Choice") with its own directions and its own
 * questions. A type may open MORE THAN ONE part (migration 187) — DepEd papers
 * routinely run I. Multiple Choice / II. Essay / III. Multiple Choice, and the
 * teacher cannot alter the paper they were issued. A part is identified by its
 * position, not by its type. Item numbering runs continuously across parts.
 *
 * On save: upsert sms_exams; flatten parts → sms_exam_questions (preserve ids);
 * rebuild each question's options + subitems; rebuild sms_exam_sections from the
 * parts that carry questions.
 */

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  EXAM_DEFAULT_DIRECTIONS,
  EXAM_QUESTION_TYPES,
  getExamQuestionTypeLabel,
  optionLetter,
  toRoman,
  type CognitiveLevel,
  type ExamQuestionType,
} from "@/lib/constants/examinations";
import {
  BANK_LEVEL_MISMATCH_CONFIRM,
  NEW_QUESTION_WORDING,
  isBankSupportedType,
} from "@/lib/constants/questionBank";
import { useAppDispatch } from "@/lib/redux/hook";
import { addItem, updateList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { groupExamParts, type ExamPartSection } from "@/lib/utils/examParts";
import { visibleTierFilter } from "@/lib/utils/examVisibility";
import {
  bankSlotStatus,
  type BankSlotStatus,
  type SlotInfo,
} from "@/lib/utils/questionBank";
import { generateTosTitle } from "@/lib/utils/tos";
import type { Exam } from "@/types";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { BankPickerDialog, type BankMeta } from "./bank/BankPickerDialog";
import {
  ExamQuestionEditor,
  questionItemCount,
  seedForType,
  type QuestionDraft,
} from "./ExamQuestionEditor";

interface TosOption {
  id: string;
  label: string;
}

/** One authored part: a question type + directions + its questions. */
interface PartDraft {
  key: string;
  question_type: ExamQuestionType;
  instructions: string;
  questions: QuestionDraft[];
}

interface ExamBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  editData?: Exam | null;
  mode: "division" | "teacher";
  schoolId: number | null;
  userId: string | number | null;
  /** Preselect this TOS when creating a new exam (Division TOS → Create exam). */
  initialTosId?: string | null;
}

let seq = 0;
const newKey = () => `q${Date.now()}_${seq++}`;

const blankQuestion = (type: ExamQuestionType): QuestionDraft =>
  seedForType(
    {
      key: newKey(),
      tos_item_id: null,
      item_count: 1,
      question_type: type,
      question_text: "",
      answer_key: "",
      points: 1,
      image_path: "",
      image_name: "",
      source_bank_question_id: null,
      bank_level_override: false,
      options: [],
      subitems: [],
    },
    type,
  );

const blankPart = (type: ExamQuestionType): PartDraft => ({
  key: newKey(),
  question_type: type,
  instructions: EXAM_DEFAULT_DIRECTIONS[type],
  questions: [],
});

export function ExamBuilderModal({
  isOpen,
  onClose,
  editData,
  mode,
  schoolId,
  userId,
  initialTosId,
}: ExamBuilderModalProps) {
  const dispatch = useAppDispatch();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);

  const [tosOptions, setTosOptions] = useState<TosOption[]>([]);
  const [tosId, setTosId] = useState("");
  const [versionLabel, setVersionLabel] = useState("Set A");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isActive, setIsActive] = useState(true);
  // Sharing tier (migration 160): false = private to created_by, true =
  // visible to every teacher at schoolId. Meaningless in division mode.
  const [isSchoolShared, setIsSchoolShared] = useState(false);
  const [parts, setParts] = useState<PartDraft[]>([]);
  const [originalQuestionIds, setOriginalQuestionIds] = useState<string[]>([]);
  const [totalTosItems, setTotalTosItems] = useState<number | null>(null);

  // Question Bank (migration 195, division mode only). `slots` is what each TOS
  // item asks for, keyed by item number; `bankMeta` is each bank item's own
  // competency + level, keyed by source_bank_question_id. Together they mirror
  // exam_guard_bank_link so a moved bank item is flagged before Save.
  const [slots, setSlots] = useState<Map<number, SlotInfo>>(new Map());
  // False until the slots for the current TOS are in (or when they failed):
  // until then the builder does not judge a bank item, the database does.
  const [slotsReady, setSlotsReady] = useState(false);
  const [bankMeta, setBankMeta] = useState<Map<string, BankMeta>>(new Map());
  /** Open picker: append to part `pi`, or replace question `qi` of it. */
  const [picker, setPicker] = useState<{
    pi: number;
    qi: number | null;
    itemNumber: number;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    setSlotsReady(false);
    if (!isOpen || mode !== "division" || !tosId) {
      setSlots(new Map());
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("sms_tos_items")
        .select(
          "item_number, cognitive_level, competency:competency_id(catalogue_competency_id, lc_code, competency_text)",
        )
        .eq("tos_id", Number(tosId));
      if (!isMounted) return;
      if (error) {
        console.error(error);
        toast.error(`Could not load the TOS items: ${error.message}`);
        setSlots(new Map());
        return;
      }
      const m = new Map<number, SlotInfo>();
      (
        (data ?? []) as unknown as {
          item_number: number;
          cognitive_level: CognitiveLevel;
          competency: {
            catalogue_competency_id: number | null;
            lc_code: string | null;
            competency_text: string;
          } | null;
        }[]
      ).forEach((r) =>
        m.set(r.item_number, {
          catalogue_competency_id:
            r.competency?.catalogue_competency_id != null
              ? String(r.competency.catalogue_competency_id)
              : null,
          cognitive_level: r.cognitive_level,
          lc_code: r.competency?.lc_code ?? null,
          competency_text: r.competency?.competency_text ?? "",
        }),
      );
      setSlots(m);
      setSlotsReady(true);
    })();
    return () => {
      isMounted = false;
    };
  }, [isOpen, mode, tosId]);

  // Load selectable TOS with the same visibility as the lists. In edit mode the
  // exam's current TOS is merged in even if it is inactive / out of filter, so
  // it stays selectable.
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const tosSelect =
      "id, title, subject_name, grade_level, exam_type, grading_period, school_year";
    (async () => {
      let query = supabase
        .from("sms_tos")
        .select(tosSelect)
        .eq("is_active", true);
      query =
        mode === "division"
          ? query.is("school_id", null).eq("review_status", "approved")
          : query.or(visibleTierFilter(userId, schoolId));
      const { data } = await query.order("created_at", { ascending: false });
      if (!active) return;
      let opts: TosOption[] = (data || []).map((t) => ({
        id: String(t.id),
        label: `${t.title?.trim() || generateTosTitle(t)} · ${t.school_year}`,
      }));
      if (
        editData?.tos_id &&
        !opts.some((o) => o.id === String(editData.tos_id))
      ) {
        const { data: cur } = await supabase
          .from("sms_tos")
          .select(tosSelect)
          .eq("id", editData.tos_id)
          .single();
        if (cur) {
          opts = [
            {
              id: String(cur.id),
              label: `${cur.title?.trim() || generateTosTitle(cur)} · ${cur.school_year}`,
            },
            ...opts,
          ];
        }
      }
      if (!active) return;
      setTosOptions(opts);
    })();
    return () => {
      active = false;
    };
  }, [isOpen, editData, mode, userId, schoolId]);

  // Reset / hydrate on open.
  useEffect(() => {
    if (!isOpen) return;

    if (editData?.id) {
      setTosId(String(editData.tos_id));
      setVersionLabel(editData.version_label || "Set A");
      setTitle(editData.title || "");
      setInstructions(editData.instructions || "");
      setIsActive(editData.is_active ?? true);
      setIsSchoolShared(editData.is_school_shared ?? false);
      void loadExamChildren(String(editData.id), String(editData.tos_id));
    } else {
      setTosId(initialTosId ?? "");
      if (initialTosId) void fetchTosItemCount(initialTosId);
      setVersionLabel("Set A");
      setTitle("");
      setInstructions("");
      setIsActive(true);
      setIsSchoolShared(false);
      setParts([]);
      setBankMeta(new Map());
      setOriginalQuestionIds([]);
      setTotalTosItems(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editData, initialTosId]);

  async function fetchTosItemCount(selectedTosId: string) {
    const { count } = await supabase
      .from("sms_tos_items")
      .select("id", { count: "exact", head: true })
      .eq("tos_id", selectedTosId);
    setTotalTosItems(count ?? 0);
  }

  async function loadExamChildren(examId: string, examTosId: string) {
    setLoading(true);
    void fetchTosItemCount(examTosId);

    const { data: qRows } = await supabase
      .from("sms_exam_questions")
      .select("*")
      .eq("exam_id", examId)
      .order("position");
    const questionIds = (qRows || []).map((q) => q.id);

    const [{ data: oRows }, { data: sRows }, { data: secRows }] =
      await Promise.all([
        supabase
          .from("sms_exam_options")
          .select("*")
          .in("question_id", questionIds),
        supabase
          .from("sms_exam_subitems")
          .select("*")
          .in("question_id", questionIds),
        supabase
          .from("sms_exam_sections")
          .select("question_type, instructions, position")
          .eq("exam_id", examId),
      ]);

    // The parts in their printed order. A part is keyed on its position, not on
    // its type, so a type that opens two parts keeps two sets of directions.
    const sectionRows: ExamPartSection[] = (secRows || []).map((s) => ({
      question_type: s.question_type,
      instructions: s.instructions ?? null,
      position: s.position ?? 0,
    }));

    // Rebuild each question draft (already ordered by position).
    const drafts: QuestionDraft[] = (qRows || []).map((q) => ({
      key: newKey(),
      id: String(q.id),
      tos_item_id: q.tos_item_id ? String(q.tos_item_id) : null,
      item_count: Number(q.item_count) || 1,
      question_type: q.question_type as ExamQuestionType,
      question_text: q.question_text || "",
      answer_key: q.answer_key || "",
      points: Number(q.points) || 1,
      image_path: q.image_path || "",
      image_name: q.image_name || "",
      source_bank_question_id: q.source_bank_question_id != null ? String(q.source_bank_question_id) : null,
      bank_level_override: q.bank_level_override === true,
      options: (oRows || [])
        .filter((o) => String(o.question_id) === String(q.id))
        .sort((a, b) => a.position - b.position)
        .map((o) => ({
          key: newKey(),
          id: String(o.id),
          choice_text: o.choice_text || "",
          is_correct: !!o.is_correct,
          image_path: o.image_path || "",
          image_name: o.image_name || "",
        })),
      subitems: (sRows || [])
        .filter((s) => String(s.question_id) === String(q.id))
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          key: newKey(),
          id: String(s.id),
          prompt_text: s.prompt_text || "",
          correct_answer: s.correct_answer || "",
        })),
    }));

    // Recover the parts on the same rule the printed paper uses, so what is
    // edited as Part III prints as Part III. groupExamParts reads part_position
    // where the questions carry one (migration 187) and falls back to
    // consecutive runs of type where they do not, which is every pre-187 exam.
    const rebuilt: PartDraft[] = groupExamParts(
      (qRows || []).map((q, i) => ({
        draft: drafts[i],
        question_type: drafts[i].question_type,
        part_position: (q.part_position as number | null) ?? null,
      })),
      sectionRows,
    ).map((part) => ({
      key: newKey(),
      question_type: part.type,
      instructions: part.section
        ? (part.section.instructions ?? "")
        : EXAM_DEFAULT_DIRECTIONS[part.type],
      questions: part.questions.map((w) => w.draft),
    }));

    // Each bank item's own competency + level, for the slot check.
    const bankIds = [
      ...new Set(
        drafts
          .map((d) => d.source_bank_question_id)
          .filter((x): x is string => !!x),
      ),
    ];
    if (bankIds.length > 0) {
      const { data: meta, error: metaError } = await supabase
        .from("sms_exam_bank_questions")
        .select("id, catalogue_competency_id, cognitive_level")
        .in("id", bankIds.map(Number));
      if (metaError) console.error(metaError);
      setBankMeta(
        new Map(
          (meta ?? []).map((m) => [
            String(m.id),
            {
              catalogue_competency_id: String(m.catalogue_competency_id),
              cognitive_level: String(m.cognitive_level),
            },
          ]),
        ),
      );
    } else {
      setBankMeta(new Map());
    }

    setParts(rebuilt);
    setOriginalQuestionIds((qRows || []).map((q) => String(q.id)));
    setLoading(false);
  }

  const handleTosChange = (id: string) => {
    setTosId(id);
    void fetchTosItemCount(id);
  };

  // ---- part / question mutations ----
  // Every type stays on offer however many parts already use it (migration
  // 187). Filtering out a used type is what left a teacher unable to encode a
  // paper whose Part III returns to Multiple Choice.
  const addPart = (type: ExamQuestionType) =>
    setParts((prev) => [...prev, blankPart(type)]);

  const removePart = (pi: number) =>
    setParts((prev) => prev.filter((_, i) => i !== pi));

  const movePart = (pi: number, dir: -1 | 1) =>
    setParts((prev) => {
      const next = [...prev];
      const target = pi + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[pi], next[target]] = [next[target], next[pi]];
      return next;
    });

  const setPartInstructions = (pi: number, value: string) =>
    setParts((prev) =>
      prev.map((p, i) => (i === pi ? { ...p, instructions: value } : p)),
    );

  const addQuestion = (pi: number) =>
    setParts((prev) =>
      prev.map((p, i) =>
        i === pi
          ? { ...p, questions: [...p.questions, blankQuestion(p.question_type)] }
          : p,
      ),
    );

  const updateQuestion = (pi: number, qi: number, q: QuestionDraft) =>
    setParts((prev) =>
      prev.map((p, i) =>
        i === pi
          ? { ...p, questions: p.questions.map((x, j) => (j === qi ? q : x)) }
          : p,
      ),
    );

  const removeQuestion = (pi: number, qi: number) =>
    setParts((prev) =>
      prev.map((p, i) =>
        i === pi
          ? { ...p, questions: p.questions.filter((_, j) => j !== qi) }
          : p,
      ),
    );

  // ---- Question Bank items (division mode) ----
  /** Put a picked bank question at the end of part `pi`, or in place of `qi`. */
  const placeBankQuestion = (
    pi: number,
    qi: number | null,
    draft: QuestionDraft,
  ) =>
    setParts((prev) =>
      prev.map((p, i) => {
        if (i !== pi) return p;
        if (qi == null) return { ...p, questions: [...p.questions, draft] };
        return {
          ...p,
          // Keep the row id so Replace updates the same exam question.
          questions: p.questions.map((x, j) =>
            j === qi ? { ...draft, id: x.id } : x,
          ),
        };
      }),
    );

  /** Clear: the copy becomes an ordinary, editable question of this exam. */
  const clearBankLink = (pi: number, qi: number) => {
    const q = parts[pi]?.questions[qi];
    if (!q) return;
    updateQuestion(pi, qi, {
      ...q,
      source_bank_question_id: null,
      bank_level_override: false,
    });
  };

  /**
   * Mirrors exam_guard_bank_link for one bank item at `itemNumber`. Null when
   * the bank question's own competency or the TOS items could not be read (or
   * are still loading) — the database still decides on Save; the builder just
   * cannot say in advance.
   */
  const statusOf = (
    q: QuestionDraft,
    itemNumber: number,
  ): BankSlotStatus | null => {
    const meta = q.source_bank_question_id
      ? bankMeta.get(q.source_bank_question_id)
      : undefined;
    if (!meta || !slotsReady) return null;
    return bankSlotStatus(meta, slots.get(itemNumber));
  };
  const isRefused = (q: QuestionDraft, st: BankSlotStatus | null) =>
    st === "wrong_competency" ||
    st === "no_slot" ||
    (st === "level_mismatch" && !q.bank_level_override);

  // Numbering across parts (in order) for the item labels. `nextItem` is the
  // number a question appended to that part receives; parts after it shift by
  // one, which is exactly what statusOf flags on their bank items.
  let running = 1;
  const partViews = parts.map((part, pi) => {
    const entries = part.questions.map((q, qi) => {
      const start = running;
      running += questionItemCount(q);
      return { q, qi, start };
    });
    return { part, pi, entries, nextItem: running };
  });
  const usedBankIds = new Set(
    parts.flatMap((p) =>
      p.questions
        .map((q) => q.source_bank_question_id)
        .filter((x): x is string => !!x),
    ),
  );
  const placedItems = parts.reduce(
    (s, p) => s + p.questions.reduce((t, q) => t + questionItemCount(q), 0),
    0,
  );

  /** A Question Bank item: read-only verbatim copy, with its slot check. */
  const renderBankItem = (
    part: PartDraft,
    pi: number,
    qi: number,
    q: QuestionDraft,
    start: number,
  ) => {
    const status = statusOf(q, start);
    const slot = slots.get(start);
    const canPick =
      mode === "division" &&
      isBankSupportedType(part.question_type) &&
      !!slot?.catalogue_competency_id;
    return (
      <div
        key={q.key}
        className="space-y-2 rounded-md border border-blue-200 bg-blue-50/40 p-2"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-900">
              From Question Bank
            </span>
            {q.bank_level_override && status !== "ok" && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900">
                Level override
              </span>
            )}
          </span>
          <span className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setPicker({ pi, qi, itemNumber: start })}
              disabled={isSubmitting || !canPick}
              title={
                canPick
                  ? "Pick a different Question Bank question for this item"
                  : "The TOS item here isn't linked to the competency catalogue."
              }
            >
              Replace
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => clearBankLink(pi, qi)}
              disabled={isSubmitting}
              title="Turn this into a new question of this exam, which you can edit"
            >
              Clear
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => removeQuestion(pi, qi)}
              disabled={isSubmitting}
              title="Remove question"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </span>
        </div>
        <ExamQuestionEditor
          question={q}
          displayStart={start}
          schoolId={null}
          disabled
          onChange={() => {}}
        />
        {(status === "wrong_competency" || status === "no_slot") && (
          <p className="text-xs font-medium text-red-700">
            Item {start}:{" "}
            {!slot
              ? "the TOS has no item at this number"
              : slot.catalogue_competency_id
                ? `the TOS item here is ${slot.lc_code ?? slot.competency_text}`
                : "the TOS item here isn't linked to the competency catalogue"}
            , but this Question Bank question is for a different competency.
            Move it back, replace it or clear it — Save will be refused.
          </p>
        )}
        {status === "level_mismatch" && (
          <label className="flex items-start gap-2 text-xs text-amber-900">
            <Checkbox
              className="mt-0.5"
              checked={q.bank_level_override}
              disabled={isSubmitting}
              onChange={(e) =>
                updateQuestion(pi, qi, {
                  ...q,
                  bank_level_override: e.target.checked,
                })
              }
            />
            <span>
              Item {start} asks for a different cognitive level than this
              question. {BANK_LEVEL_MISMATCH_CONFIRM}
              {!q.bank_level_override && " — Save will be refused until confirmed."}
            </span>
          </label>
        )}
        {status === null && (
          <p className="text-xs text-muted-foreground">
            Checking this Question Bank question against TOS item {start}…
            (if this stays, Save will still check it).
          </p>
        )}
      </div>
    );
  };

  const onSubmit = async () => {
    if (isSubmitting) return;
    if (!tosId) return toast.error("Select a TOS first.");
    if (!versionLabel.trim()) return toast.error("Version label is required.");
    const nonEmptyParts = parts.filter((p) => p.questions.length > 0);
    if (nonEmptyParts.length === 0)
      return toast.error("Add at least one part with a question.");

    // A Question Bank item may only sit on a TOS item of its own competency
    // (and level, unless the mismatch was confirmed). Refuse here, naming the
    // items, rather than let the save stop half-way at the first one.
    const misplaced = partViews.flatMap(({ entries }) =>
      entries
        .filter(
          ({ q, start }) =>
            !!q.source_bank_question_id && isRefused(q, statusOf(q, start)),
        )
        .map(({ start }) => start),
    );
    if (misplaced.length > 0)
      return toast.error(
        `Item${misplaced.length > 1 ? "s" : ""} ${misplaced.join(", ")}: the Question Bank question no longer matches the TOS item. Move it back, replace it or clear it.`,
      );
    if (mode !== "division" && usedBankIds.size > 0)
      return toast.error(
        "Question Bank questions can only be used in a Division exam. Clear them first.",
      );

    setIsSubmitting(true);
    // Every write is checked and the first refusal aborts the save: a refused
    // Question Bank item must fail loudly, naming the item, never be skipped.
    // The database's own bank messages already start "Item N:".
    const check = (
      error: { message: string } | null,
      itemNumber?: number,
    ) => {
      if (!error) return;
      throw new Error(
        itemNumber != null && !/^Item \d/.test(error.message)
          ? `Item ${itemNumber}: ${error.message}`
          : error.message,
      );
    };
    try {
      const headerPayload = {
        tos_id: Number(tosId),
        version_label: versionLabel.trim(),
        title: title.trim() || null,
        instructions: instructions.trim() || null,
        school_id: mode === "division" ? null : schoolId,
        // A division row is shared by being school_id NULL; migration 160's
        // CHECK forbids the flag there, so it is forced false.
        is_school_shared: mode === "division" ? false : isSchoolShared,
        is_active: isActive,
      };

      let examId: string;
      if (editData?.id) {
        const { error } = await supabase
          .from("sms_exams")
          .update(headerPayload)
          .eq("id", editData.id);
        if (error) throw new Error(error.message);
        examId = String(editData.id);
      } else {
        const { data: inserted, error } = await supabase
          .from("sms_exams")
          .insert([{ ...headerPayload, created_by: userId ?? null }])
          .select()
          .single();
        if (error) throw new Error(error.message);
        examId = String(inserted.id);
      }

      // Flatten parts (in order) into positioned questions with running numbers.
      // Each question carries the index of the part it belongs to, matching the
      // section row's `position` — that pair is what recovers the parts on the
      // next load, and the only thing that can tell two adjacent parts of the
      // same type apart (migration 187).
      const ordered: {
        draft: QuestionDraft;
        type: ExamQuestionType;
        partIndex: number;
      }[] = [];
      nonEmptyParts.forEach((p, partIndex) => {
        for (const q of p.questions) {
          ordered.push({ draft: q, type: p.question_type, partIndex });
        }
      });

      const keptIds: string[] = [];
      const finalQuestions: {
        id: string;
        draft: QuestionDraft;
        itemNumber: number;
      }[] = [];
      let itemNo = 1;
      for (let i = 0; i < ordered.length; i++) {
        const { draft, type, partIndex } = ordered[i];
        const count = questionItemCount(draft);
        const row = {
          tos_item_id: draft.tos_item_id ? Number(draft.tos_item_id) : null,
          item_number: itemNo,
          item_count: count,
          question_type: type,
          part_position: partIndex,
          question_text: draft.question_text.trim() || null,
          answer_key: draft.answer_key.trim() || null,
          points: draft.points,
          image_path: draft.image_path.trim() || null,
          image_name: draft.image_name.trim() || null,
          position: i,
          source_bank_question_id: draft.source_bank_question_id
            ? Number(draft.source_bank_question_id)
            : null,
          bank_level_override:
            !!draft.source_bank_question_id && draft.bank_level_override,
        };
        const thisItem = itemNo;
        itemNo += count;
        if (draft.id) {
          keptIds.push(draft.id);
          const { data: upd, error } = await supabase
            .from("sms_exam_questions")
            .update(row)
            .eq("id", draft.id)
            .select("id");
          check(error, thisItem);
          // Row-level security refuses an UPDATE by matching nothing, not by
          // raising — an unchanged row would otherwise pass as saved.
          if (!upd || upd.length === 0)
            throw new Error(
              `Item ${thisItem}: this question could not be saved (it may be locked for review).`,
            );
          finalQuestions.push({ id: draft.id, draft, itemNumber: thisItem });
        } else {
          const { data: ins, error } = await supabase
            .from("sms_exam_questions")
            .insert([{ ...row, exam_id: Number(examId) }])
            .select()
            .single();
          check(error, thisItem);
          finalQuestions.push({
            id: String(ins.id),
            draft,
            itemNumber: thisItem,
          });
        }
      }
      const removed = originalQuestionIds.filter((id) => !keptIds.includes(id));
      if (removed.length > 0) {
        const { error } = await supabase
          .from("sms_exam_questions")
          .delete()
          .in("id", removed);
        check(error);
      }

      // Rebuild options + subitems for every question. A bank item's options
      // are its verbatim copy, trimmed the way exam_guard_bank_option compares.
      for (const { id, draft, itemNumber } of finalQuestions) {
        const delOpts = await supabase
          .from("sms_exam_options")
          .delete()
          .eq("question_id", id);
        check(delOpts.error, itemNumber);
        const delSubs = await supabase
          .from("sms_exam_subitems")
          .delete()
          .eq("question_id", id);
        check(delSubs.error, itemNumber);

        if (draft.options.length > 0) {
          const { error } = await supabase.from("sms_exam_options").insert(
            draft.options.map((o, oi) => ({
              question_id: Number(id),
              label: optionLetter(oi),
              choice_text: o.choice_text.trim() || null,
              is_correct: o.is_correct,
              image_path: o.image_path.trim() || null,
              image_name: o.image_name.trim() || null,
              position: oi,
            })),
          );
          check(error, itemNumber);
        }
        if (draft.subitems.length > 0) {
          const { error } = await supabase.from("sms_exam_subitems").insert(
            draft.subitems.map((s, si) => ({
              question_id: Number(id),
              prompt_text: s.prompt_text.trim() || null,
              correct_answer: s.correct_answer.trim() || null,
              position: si,
            })),
          );
          check(error, itemNumber);
        }
      }

      // Rebuild the section rows: one per non-empty part, keyed on `position`
      // (migration 187) — which is the same index the questions above carry.
      const delSections = await supabase
        .from("sms_exam_sections")
        .delete()
        .eq("exam_id", examId);
      check(delSections.error);
      if (nonEmptyParts.length > 0) {
        const { error } = await supabase.from("sms_exam_sections").insert(
          nonEmptyParts.map((p, i) => ({
            exam_id: Number(examId),
            question_type: p.question_type,
            instructions: p.instructions.trim() || null,
            position: i,
          })),
        );
        check(error);
      }

      const { data: fresh } = await supabase
        .from("sms_exams")
        .select(
          "*, tos:tos_id!inner(subject_name, grade_level, exam_type, grading_period, school_year, title)",
        )
        .eq("id", examId)
        .single();
      if (fresh) {
        dispatch(editData?.id ? updateList(fresh) : addItem(fresh));
      }

      toast.success(editData ? "Exam updated!" : "Exam created!");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error saving exam");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {editData ? "Edit" : "Create"} Exam
          </DialogTitle>
          <DialogDescription>
            {mode === "division"
              ? "Division-authored exams are visible to all subject teachers."
              : "Your exam is private to you. Division-authored exams are shared to everyone."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label className="mb-1.5 block">
                Table of Specification <span className="text-red-500">*</span>
              </Label>
              <Select
                value={tosId}
                onValueChange={handleTosChange}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a TOS to build from" />
                </SelectTrigger>
                <SelectContent>
                  {tosOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 block">
                Version <span className="text-red-500">*</span>
              </Label>
              <Input
                value={versionLabel}
                onChange={(e) => setVersionLabel(e.target.value)}
                placeholder="e.g., Set A"
                disabled={isSubmitting}
              />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={isSubmitting}
              />
              <Label>Active</Label>
            </div>

            {/* Sharing tier (migration 160). Division exams are shared by
                definition, so the choice only exists school-side. */}
            {mode === "teacher" && (
              <div className="col-span-2 rounded-md border bg-muted/20 p-3">
                <div className="flex items-start gap-3">
                  <Switch
                    checked={isSchoolShared}
                    onCheckedChange={setIsSchoolShared}
                    disabled={isSubmitting || schoolId == null}
                  />
                  <div>
                    <Label className="text-sm">Share with my whole school</Label>
                    <p className="text-xs text-muted-foreground">
                      {schoolId == null
                        ? "No school is set for your account, so this can only be private to you."
                        : isSchoolShared
                          ? "Every teacher at your school can see and build from this. Your school head can edit it."
                          : "Only you can see this."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="col-span-2">
              <Label className="mb-1.5 block">Title (optional)</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Leave blank to use the TOS title"
                disabled={isSubmitting}
              />
            </div>
            <div className="col-span-2">
              <Label className="mb-1.5 block">Test directions (optional)</Label>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="General instructions shown at the top of the exam…"
                rows={2}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Parts */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Parts</p>
              {totalTosItems != null && (
                <span className="text-xs text-muted-foreground">
                  {placedItems} item{placedItems === 1 ? "" : "s"} · TOS target{" "}
                  {totalTosItems}
                  {placedItems !== totalTosItems && (
                    <span className="ml-1 text-amber-600">
                      ({placedItems > totalTosItems ? "over" : "under"} by{" "}
                      {Math.abs(totalTosItems - placedItems)})
                    </span>
                  )}
                </span>
              )}
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="space-y-5">
                {parts.length === 0 && (
                  <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    {tosId
                      ? "No parts yet. Add a part (e.g. Multiple Choice) to begin."
                      : "Select a TOS above, then add parts to build the exam."}
                  </p>
                )}

                {partViews.map(({ part, pi, entries, nextItem }) => (
                  <div key={part.key} className="space-y-2 rounded-md border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-semibold">
                        Part {toRoman(pi + 1)}.{" "}
                        {getExamQuestionTypeLabel(part.question_type)}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => movePart(pi, -1)}
                          disabled={isSubmitting || pi === 0}
                          title="Move part up"
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => movePart(pi, 1)}
                          disabled={isSubmitting || pi === parts.length - 1}
                          title="Move part down"
                        >
                          ↓
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removePart(pi)}
                          disabled={isSubmitting}
                          title="Remove part"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <Textarea
                      value={part.instructions}
                      onChange={(e) => setPartInstructions(pi, e.target.value)}
                      placeholder="Directions for this part…"
                      rows={2}
                      disabled={isSubmitting}
                      className="bg-background"
                    />

                    {entries.length === 0 ? (
                      <p className="rounded border border-dashed p-3 text-center text-xs text-muted-foreground">
                        No questions in this part yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {entries.map(({ q, qi, start }) =>
                          q.source_bank_question_id ? (
                            renderBankItem(part, pi, qi, q, start)
                          ) : (
                            <ExamQuestionEditor
                              key={q.key}
                              question={q}
                              displayStart={start}
                              schoolId={mode === "division" ? null : schoolId}
                              disabled={isSubmitting}
                              onChange={(nq) => updateQuestion(pi, qi, nq)}
                              onRemove={() => removeQuestion(pi, qi)}
                            />
                          ),
                        )}
                      </div>
                    )}

                    {(() => {
                      const bankable =
                        mode === "division" &&
                        isBankSupportedType(part.question_type);
                      const slot = bankable ? slots.get(nextItem) : undefined;
                      return (
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => addQuestion(pi)}
                              disabled={isSubmitting}
                              title={
                                mode === "division"
                                  ? NEW_QUESTION_WORDING
                                  : undefined
                              }
                            >
                              <Plus className="mr-1 h-3.5 w-3.5" />{" "}
                              {mode === "division"
                                ? "New question"
                                : "Add question"}
                            </Button>
                            {bankable && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={
                                  isSubmitting || !slot?.catalogue_competency_id
                                }
                                onClick={() =>
                                  setPicker({ pi, qi: null, itemNumber: nextItem })
                                }
                              >
                                From Question Bank
                              </Button>
                            )}
                          </div>
                          {bankable && slotsReady && !slot && tosId && (
                            <p className="text-xs text-muted-foreground">
                              The TOS has no item {nextItem}, so the Question
                              Bank can&apos;t be used for it.
                            </p>
                          )}
                          {bankable && slot && !slot.catalogue_competency_id && (
                            <p className="text-xs text-muted-foreground">
                              Item {nextItem}: This TOS item isn&apos;t linked
                              to the competency catalogue; the Question Bank
                              can&apos;t be used for it.
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ))}

                {/* Add part */}
                <Select
                  value=""
                  onValueChange={(v) => addPart(v as ExamQuestionType)}
                  disabled={isSubmitting || !tosId}
                >
                  <SelectTrigger className="w-full sm:w-[260px]">
                    <SelectValue placeholder="+ Add part…" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXAM_QUESTION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {picker &&
          (() => {
            const slot = slots.get(picker.itemNumber);
            const qType = parts[picker.pi]?.question_type;
            if (!slot || !qType || !isBankSupportedType(qType)) return null;
            return (
              <BankPickerDialog
                isOpen
                onClose={() => setPicker(null)}
                slot={slot}
                itemNumber={picker.itemNumber}
                questionType={qType}
                usedIds={usedBankIds}
                onPick={(draft, meta) => {
                  if (draft.source_bank_question_id)
                    setBankMeta((prev) =>
                      new Map(prev).set(
                        draft.source_bank_question_id as string,
                        meta,
                      ),
                    );
                  placeBankQuestion(picker.pi, picker.qi, draft);
                  setPicker(null);
                }}
              />
            );
          })()}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="min-w-[100px]"
          >
            {isSubmitting ? "Saving…" : editData ? "Update" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
