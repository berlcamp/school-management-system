"use client";

/**
 * Printable exam paper (and optional answer key), rendered from persisted exam
 * data. Pure render — no data fetching.
 */

import { getGradeLevelLabel } from "@/lib/constants";
import {
  EXAM_DEFAULT_DIRECTIONS,
  getExamQuestionTypeLabel,
  optionLetter,
  toRoman,
  type ExamQuestionType,
} from "@/lib/constants/examinations";
import { examImageUrl } from "@/lib/utils/examImages";
import { generateTosTitle } from "@/lib/utils/tos";

export interface ExamPreviewHeader {
  title?: string | null;
  version_label: string;
  subject_name: string;
  grade_level: number;
  exam_type: string;
  school_year: string;
  grading_period: number;
  instructions?: string | null;
}

export interface ExamPreviewOption {
  choice_text: string | null;
  is_correct: boolean;
  /** Storage object path of this choice's figure, if any (migration 159). */
  image_path?: string | null;
}

export interface ExamPreviewSubitem {
  prompt_text: string | null;
  correct_answer: string | null;
}

export interface ExamPreviewQuestion {
  item_number: number;
  item_count: number;
  question_type: ExamQuestionType;
  question_text: string | null;
  answer_key: string | null;
  /** Storage object path of the question's figure, if any (migration 159). */
  image_path?: string | null;
  options: ExamPreviewOption[];
  subitems: ExamPreviewSubitem[];
}

interface ExamPreviewProps {
  header: ExamPreviewHeader;
  questions: ExamPreviewQuestion[];
  /** Per-question-type directions (falls back to defaults). */
  directions?: Partial<Record<ExamQuestionType, string>>;
  showAnswerKey?: boolean;
}

function correctOptionLetter(q: ExamPreviewQuestion): string {
  const idx = q.options.findIndex((o) => o.is_correct);
  return idx >= 0 ? optionLetter(idx) : "—";
}

/**
 * A figure on the printed paper (migration 159).
 *
 * Sized in millimetres, not pixels: this component IS the print copy (the same
 * markup is portalled out for `window.print()`), and a photo left at its
 * natural size takes a whole sheet. `break-inside: avoid` keeps a figure from
 * being split across two pages, away from the item it belongs to.
 *
 * The `alt` deliberately does not describe the picture — nobody has typed a
 * description, and inventing one is exactly what a test item must not do.
 */
function Figure({
  path,
  maxHeightMm,
}: {
  path?: string | null;
  maxHeightMm: number;
}) {
  const url = examImageUrl(path);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      className="exam-figure mt-1 h-auto max-w-full object-contain"
      style={{ maxHeight: `${maxHeightMm}mm`, breakInside: "avoid" }}
    />
  );
}

function QuestionBody({ q }: { q: ExamPreviewQuestion }) {
  return (
    <>
      {q.question_text && <p>{q.question_text}</p>}
      <Figure path={q.image_path} maxHeightMm={60} />

      {/* Multiple choice */}
      {q.question_type === "multiple_choice" && (
        <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5">
          {q.options.map((o, i) => (
            <div key={i} style={{ breakInside: "avoid" }}>
              <span className="font-medium">{optionLetter(i)}.</span>{" "}
              {o.choice_text}
              <Figure path={o.image_path} maxHeightMm={28} />
            </div>
          ))}
        </div>
      )}

      {/* True / False */}
      {(q.question_type === "true_false" ||
        q.question_type === "modified_true_false") && (
        <p className="mt-1 text-[11px] text-neutral-600">
          _________{" "}
          {q.question_type === "modified_true_false"
            ? "(write TRUE, or the correct word if false)"
            : "(TRUE / FALSE)"}
        </p>
      )}

      {/* Matching */}
      {q.question_type === "matching" && (
        <div className="mt-1 grid grid-cols-2 gap-x-8">
          <div>
            <p className="font-medium underline">Column A</p>
            {q.subitems.map((s, i) => (
              <p key={i}>
                _____ {i + 1}. {s.prompt_text}
              </p>
            ))}
          </div>
          <div>
            <p className="font-medium underline">Column B</p>
            {q.options.map((o, i) => (
              <div key={i} style={{ breakInside: "avoid" }}>
                {optionLetter(i)}. {o.choice_text}
                <Figure path={o.image_path} maxHeightMm={28} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completion */}
      {q.question_type === "completion" && q.subitems.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {q.subitems.map((_, i) => (
            <p key={i}>{q.item_number + i}. ______________________</p>
          ))}
        </div>
      )}

      {/* Short answer */}
      {q.question_type === "short_answer" && (
        <p className="mt-1">Answer: ______________________</p>
      )}

      {/* Essay */}
      {q.question_type === "essay" && (
        <div className="mt-1 space-y-3">
          <div className="border-b border-dotted" />
          <div className="border-b border-dotted" />
          <div className="border-b border-dotted" />
        </div>
      )}
    </>
  );
}

export function ExamPreview({
  header,
  questions,
  directions,
  showAnswerKey,
}: ExamPreviewProps) {
  const title = header.title?.trim() || generateTosTitle(header);

  // Group consecutive questions of the same type into printed "parts".
  const parts: {
    type: ExamQuestionType;
    partNo: number;
    questions: ExamPreviewQuestion[];
  }[] = [];
  let lastType: ExamQuestionType | null = null;
  for (const q of questions) {
    if (q.question_type !== lastType) {
      parts.push({
        type: q.question_type,
        partNo: parts.length + 1,
        questions: [],
      });
      lastType = q.question_type;
    }
    parts[parts.length - 1].questions.push(q);
  }
  const partDirections = (type: ExamQuestionType) =>
    directions?.[type]?.trim() || EXAM_DEFAULT_DIRECTIONS[type];

  return (
    <div className="exam-preview text-[12px] leading-relaxed text-black">
      {/* Heading */}
      <div className="mb-4 text-center">
        <h2 className="text-sm font-bold uppercase">{title}</h2>
        <p className="text-xs font-semibold">
          SY {header.school_year} · {header.version_label}
        </p>
        <p className="text-[11px]">
          {header.subject_name} · {getGradeLevelLabel(header.grade_level)}
        </p>
      </div>

      <div className="mb-4 flex justify-between text-[11px]">
        <span>Name: _______________________________</span>
        <span>Score: __________</span>
      </div>

      {header.instructions && (
        <p className="mb-3 text-[11px] italic">{header.instructions}</p>
      )}

      <div className="space-y-4">
        {parts.map((part) => (
          <div key={part.partNo} className="break-inside-avoid">
            <p className="font-bold">
              Part {toRoman(part.partNo)}. {getExamQuestionTypeLabel(part.type)}
            </p>
            <p className="mb-2 text-[11px] italic">
              Directions: {partDirections(part.type)}
            </p>
            <div className="space-y-3">
              {part.questions.map((q) => (
                <div key={q.item_number} className="break-inside-avoid">
                  <div className="flex gap-2">
                    <span className="font-semibold">
                      {q.item_count > 1
                        ? `${q.item_number}–${q.item_number + q.item_count - 1}.`
                        : `${q.item_number}.`}
                    </span>
                    <div className="flex-1">
                      <QuestionBody q={q} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Answer key */}
      {showAnswerKey && (
        <div className="mt-8 border-t border-black pt-3">
          <h3 className="mb-2 text-sm font-bold uppercase">Answer Key</h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[11px] sm:grid-cols-3">
            {questions.map((q) => (
              <div key={q.item_number}>
                <span className="font-semibold">
                  {q.item_count > 1
                    ? `${q.item_number}–${q.item_number + q.item_count - 1}`
                    : q.item_number}
                  .
                </span>{" "}
                {q.question_type === "multiple_choice" && correctOptionLetter(q)}
                {(q.question_type === "true_false" ||
                  q.question_type === "modified_true_false" ||
                  q.question_type === "short_answer") &&
                  (q.answer_key || "—")}
                {q.question_type === "matching" &&
                  q.subitems
                    .map((s, i) => `${i + 1}-${s.correct_answer || "?"}`)
                    .join(", ")}
                {q.question_type === "completion" &&
                  q.subitems
                    .map((s, i) => `${q.item_number + i}. ${s.correct_answer || "—"}`)
                    .join("; ")}
                {q.question_type === "essay" && (
                  <span className="italic text-neutral-500">
                    {getExamQuestionTypeLabel(q.question_type)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
