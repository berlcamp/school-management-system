/**
 * How an RMA scoresheet reads — the shape shared by the three places a learner
 * row is rendered: the entry table on screen, the division's Excel workbook
 * (`lib/excel/generateRmaScoresheetWorkbook.ts`) and the printed A4 sheet
 * (`lib/pdf/generateRmaScoresheet.ts`).
 *
 * The levelling in particular lives here rather than in each generator. The
 * workbook's own column-V formula rounds the percentage to two decimals before
 * banding it, so a score landing on a band edge has to round the same way in
 * all three or a learner sits in one band on screen and another on the paper
 * the teacher signs — which is exactly the drift migration 153 describes
 * between the report card and SF9.
 */

import { bandLabelForScore } from "@/lib/constants";
import { RmaBand, RmaItem, Student } from "@/types";

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Percentage of the total possible, to two decimals. */
export function percentage(total: number, max: number): number {
  return max > 0 ? round2((total / max) * 100) : 0;
}

/** Levelling label for a total, looked up on the two-decimal percentage. */
export function masteryForScore(
  bands: RmaBand[],
  total: number,
  max: number,
): string | null {
  return bandLabelForScore(
    bands.map((b) => ({
      min_score: Number(b.min_score),
      max_score: Number(b.max_score),
      label: b.label,
    })),
    percentage(total, max),
  );
}

/** "Dela Cruz Jr., Juan Miguel" — the issued form's own name order. */
export function learnerName(s: Student): string {
  const last = [s.last_name, s.suffix].filter(Boolean).join(" ");
  const rest = [s.first_name, s.middle_name].filter(Boolean).join(" ");
  return `${last}, ${rest}`.trim();
}

/** The task's own name, as the division wrote it on the material. */
export function taskName(item: RmaItem, index: number): string {
  const domain = item.domain?.trim();
  if (domain) return domain;
  return `Item ${item.item_no ?? index + 1}`;
}

/** The workbook's row 8: the task name, its question, and what it is worth. */
export function taskHeader(item: RmaItem, index: number): string {
  const question = item.question_text?.trim();
  const name = taskName(item, index);
  const label = question && question !== name ? `${name}: ${question}` : name;
  return `${label} (${Number(item.max_score)})`;
}

/** "KS1" for Grades 1-3, "KS2" for 4-6, "KS3" for 7-10, "KS4" for 11-12; null outside them. */
export function rmaKeyStage(gradeLevel: number | null | undefined): string | null {
  if (gradeLevel == null) return null;
  if (gradeLevel >= 1 && gradeLevel <= 3) return "KS1";
  if (gradeLevel >= 4 && gradeLevel <= 6) return "KS2";
  if (gradeLevel >= 7 && gradeLevel <= 10) return "KS3";
  if (gradeLevel >= 11 && gradeLevel <= 12) return "KS4";
  return null;
}

/**
 * A band's percentage range as the guide prints it. Bands are stored with the
 * upper edge just below the next band (0-74.99, 75-84.99, 85-100), so the
 * bottom band reads "Below 75%" and the top one "85% and above".
 */
export function rmaBandRange(band: Pick<RmaBand, "min_score" | "max_score">): string {
  const min = Number(band.min_score);
  const max = Number(band.max_score);
  const fmt = (n: number) => String(round2(n));
  if (min <= 0 && max < 100) return `Below ${fmt(Math.ceil(max))}%`;
  if (max >= 100) return min <= 0 ? "0–100%" : `${fmt(min)}% and above`;
  return `${fmt(min)}–${fmt(Math.floor(max))}%`;
}

/**
 * The Levelling Guide for the material in use: one entry per band, in band
 * order, so the guide always matches how the learners are actually levelled.
 * The definition is the KS1 profile's sentence when the band carries one of
 * its three labels, else blank.
 */
export function rmaLevellingGuide(
  bands: Pick<RmaBand, "min_score" | "max_score" | "label" | "position">[],
  definitions: { label: string; definition: string }[],
): { label: string; range: string; definition: string }[] {
  return [...bands]
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((b) => ({
      label: b.label,
      range: rmaBandRange(b),
      definition:
        definitions.find((d) => d.label.toLowerCase() === b.label.trim().toLowerCase())
          ?.definition ?? "",
    }));
}
