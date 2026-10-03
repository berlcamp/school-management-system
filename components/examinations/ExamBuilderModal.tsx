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
  EXAM_DEFAULT_DIRECTIONS,
  EXAM_QUESTION_TYPES,
  getExamQuestionType,
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
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Library,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import toast from "react-hot-toast";
import { BankPickerDialog, type BankMeta } from "./bank/BankPickerDialog";
import {
  FormSection,
  RequiredMark,
  SummaryStat,
  ToggleCard,
} from "./BuilderLayout";
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
  const formId = useId();

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
        className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/50 p-2.5"
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
              aria-label={`Remove item ${start}`}
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

  const questionCount = parts.reduce((s, p) => s + p.questions.length, 0);
  const totalPoints = parts.reduce(
    (s, p) => s + p.questions.reduce((t, q) => t + (Number(q.points) || 0), 0),
    0,
  );
  const autoScoredItems = parts.reduce(
    (s, p) =>
      s +
      p.questions.reduce(
        (t, q) =>
          t +
          (getExamQuestionType(q.question_type)?.autoScorable
            ? questionItemCount(q)
            : 0),
        0,
      ),
    0,
  );
  const itemsDelta =
    totalTosItems != null ? placedItems - totalTosItems : null;
  const saveHint = !tosId
    ? "Select a Table of Specification to build from."
    : questionCount === 0
      ? "Add a part and at least one question."
      : null;
  const fieldId = (name: string) => `${formId}-${name}`;

  const confirmRemovePart = (pi: number) => {
    const n = parts[pi]?.questions.length ?? 0;
    if (
      n > 0 &&
      !window.confirm(
        `Remove Part ${toRoman(pi + 1)} and its ${n} question${n === 1 ? "" : "s"}? This can't be undone once you save.`,
      )
    )
      return;
    removePart(pi);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && !isSubmitting && onClose()}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        {/* Header — stays put while the body scrolls */}
        <div className="border-b px-6 pt-5 pb-4">
          <DialogHeader className="pr-8">
            <DialogTitle className="text-xl font-semibold">
              {editData ? "Edit" : "Create"} Exam
            </DialogTitle>
            <DialogDescription>
              {mode === "division"
                ? "Division-authored exams are visible to all subject teachers once approved."
                : "Build the paper part by part. Items are numbered in order across parts."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <SummaryStat
              label="Items vs TOS"
              value={
                totalTosItems != null
                  ? `${placedItems} / ${totalTosItems}`
                  : `${placedItems}`
              }
              progress={
                totalTosItems ? placedItems / totalTosItems : 0
              }
              tone={itemsDelta === 0 && placedItems > 0 ? "ok" : "warn"}
              note={
                itemsDelta == null
                  ? "Pick a TOS"
                  : itemsDelta === 0
                    ? "Matches the TOS"
                    : `${Math.abs(itemsDelta)} ${itemsDelta > 0 ? "over" : "short"}`
              }
            />
            <SummaryStat
              label="Questions"
              value={`${questionCount}`}
              progress={questionCount > 0 ? 1 : 0}
              tone={questionCount > 0 ? "ok" : "warn"}
              note={`${parts.length} part${parts.length === 1 ? "" : "s"}`}
            />
            <SummaryStat
              label="Total points"
              value={formatPoints(totalPoints)}
              progress={placedItems > 0 ? autoScoredItems / placedItems : 0}
              tone={placedItems > 0 ? "ok" : "warn"}
              note={
                placedItems > 0
                  ? `${autoScoredItems} of ${placedItems} items auto-scored`
                  : "No items yet"
              }
            />
          </div>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-muted/30 px-6 py-5">
          {/* 1 — Source */}
          <FormSection
            step={1}
            title="Build from"
            description="The exam follows this TOS: its item count is the target above."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Label htmlFor={fieldId("tos")} className="mb-1.5 block">
                  Table of Specification <RequiredMark />
                </Label>
                <Select
                  value={tosId}
                  onValueChange={handleTosChange}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id={fieldId("tos")} className="w-full">
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
                {tosOptions.length === 0 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    No TOS available yet — create one under Table of
                    Specification first.
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor={fieldId("version")} className="mb-1.5 block">
                  Version <RequiredMark />
                </Label>
                <Input
                  id={fieldId("version")}
                  value={versionLabel}
                  onChange={(e) => setVersionLabel(e.target.value)}
                  placeholder="e.g., Set A"
                  disabled={isSubmitting}
                />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor={fieldId("title")} className="mb-1.5 block">
                  Title{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <Input
                  id={fieldId("title")}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Leave blank to use the TOS title"
                  disabled={isSubmitting}
                />
              </div>
              <div className="sm:col-span-3">
                <Label htmlFor={fieldId("directions")} className="mb-1.5 block">
                  General directions{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </Label>
                <Textarea
                  id={fieldId("directions")}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Shown at the top of the exam, before Part I…"
                  rows={2}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </FormSection>

          {/* 2 — Parts */}
          <FormSection
            step={2}
            title="Parts and questions"
            description="Each part is one question type with its own directions. A type can appear in more than one part."
          >
            {loading ? (
              <div className="space-y-2" aria-busy="true">
                {[0, 1].map((i) => (
                  <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {parts.length === 0 && (
                  <div className="rounded-lg border border-dashed px-4 py-8 text-center">
                    <p className="text-sm font-medium">No parts yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {tosId
                        ? "Choose a question type below to add Part I."
                        : "Select a TOS in step 1, then add parts below."}
                    </p>
                  </div>
                )}

                {partViews.map(({ part, pi, entries, nextItem }) => {
                  const first = entries[0]?.start;
                  const last = nextItem - 1;
                  const bankable =
                    mode === "division" &&
                    isBankSupportedType(part.question_type);
                  const slot = bankable ? slots.get(nextItem) : undefined;
                  return (
                    <div
                      key={part.key}
                      className="overflow-hidden rounded-lg border bg-background"
                    >
                      {/* Part header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-foreground px-1.5 text-xs font-semibold text-background">
                            {toRoman(pi + 1)}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold leading-tight">
                              Part {toRoman(pi + 1)}.{" "}
                              {getExamQuestionTypeLabel(part.question_type)}
                            </p>
                            <p className="text-xs tabular-nums text-muted-foreground">
                              {entries.length === 0
                                ? "No questions yet"
                                : `${entries.length} question${entries.length === 1 ? "" : "s"} · ${first === last ? `Item ${first}` : `Items ${first}–${last}`}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => movePart(pi, -1)}
                            disabled={isSubmitting || pi === 0}
                            aria-label={`Move Part ${toRoman(pi + 1)} up`}
                            title="Move part up"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => movePart(pi, 1)}
                            disabled={isSubmitting || pi === parts.length - 1}
                            aria-label={`Move Part ${toRoman(pi + 1)} down`}
                            title="Move part down"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => confirmRemovePart(pi)}
                            disabled={isSubmitting}
                            aria-label={`Remove Part ${toRoman(pi + 1)}`}
                            title="Remove part"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3 p-3">
                        <div>
                          <Label
                            htmlFor={fieldId(`dir-${part.key}`)}
                            className="mb-1 block text-xs"
                          >
                            Directions for this part
                          </Label>
                          <Textarea
                            id={fieldId(`dir-${part.key}`)}
                            value={part.instructions}
                            onChange={(e) =>
                              setPartInstructions(pi, e.target.value)
                            }
                            placeholder="Directions for this part…"
                            rows={2}
                            disabled={isSubmitting}
                            className="bg-background"
                          />
                        </div>

                        {entries.length > 0 && (
                          <div className="space-y-3">
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

                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              className="flex-1 justify-center border border-dashed text-muted-foreground hover:text-foreground"
                              onClick={() => addQuestion(pi)}
                              disabled={isSubmitting}
                              title={
                                mode === "division"
                                  ? NEW_QUESTION_WORDING
                                  : undefined
                              }
                            >
                              <Plus className="h-4 w-4" />
                              {mode === "division"
                                ? "New question"
                                : "Add question"}
                              {nextItem > 0 && (
                                <span className="font-normal tabular-nums text-muted-foreground">
                                  (item {nextItem})
                                </span>
                              )}
                            </Button>
                            {bankable && (
                              <Button
                                type="button"
                                variant="outline"
                                disabled={
                                  isSubmitting || !slot?.catalogue_competency_id
                                }
                                onClick={() =>
                                  setPicker({ pi, qi: null, itemNumber: nextItem })
                                }
                              >
                                <Library className="h-4 w-4" />
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
                      </div>
                    </div>
                  );
                })}

                {/* Add part — every type stays on offer (migration 187) */}
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {parts.length === 0
                      ? "Add Part I:"
                      : `Add Part ${toRoman(parts.length + 1)}:`}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {EXAM_QUESTION_TYPES.map((t) => (
                      <Button
                        key={t.value}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addPart(t.value)}
                        disabled={isSubmitting || !tosId}
                        aria-label={`Add part: ${t.label}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {t.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </FormSection>

          {/* 3 — Settings */}
          <FormSection
            step={3}
            title="Status and sharing"
            description="Who can see this exam and whether it is in use."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ToggleCard
                id={fieldId("active")}
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={isSubmitting}
                label="Active"
                hint={
                  isActive
                    ? "Shown in lists and available for printing and scanning."
                    : "Archived — kept, but hidden from the lists."
                }
              />
              {/* Sharing tier (migration 160). Division exams are shared by
                  definition, so the choice only exists school-side. */}
              {mode === "teacher" && (
                <ToggleCard
                  id={fieldId("shared")}
                  checked={isSchoolShared}
                  onCheckedChange={setIsSchoolShared}
                  disabled={isSubmitting || schoolId == null}
                  label="Share with my whole school"
                  hint={
                    schoolId == null
                      ? "No school is set for your account, so this can only be private to you."
                      : isSchoolShared
                        ? "Every teacher at your school can see and build from this. Your school head can edit it."
                        : "Private — only you can see this."
                  }
                />
              )}
            </div>
          </FormSection>
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

        {/* Footer — always reachable */}
        <div className="flex flex-col-reverse gap-3 border-t bg-background px-6 py-3 sm:flex-row sm:items-center sm:justify-end">
          {saveHint && (
            <p
              className="flex items-start gap-2 text-sm text-amber-700 sm:mr-auto"
              role="status"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {saveHint}
            </p>
          )}
          <div className="flex gap-2 sm:shrink-0">
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="default"
              onClick={onSubmit}
              disabled={isSubmitting || !tosId}
              className="min-w-[120px] flex-1 sm:flex-none"
            >
              {isSubmitting && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              {isSubmitting
                ? "Saving…"
                : editData
                  ? "Save changes"
                  : "Create exam"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const formatPoints = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);
