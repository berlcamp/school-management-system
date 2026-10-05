"use client";

import { LearnerSexGroupRow } from "@/components/LearnerSexGroupHeader";
import { Button } from "@/components/ui/button";
import { PACE_RATINGS, PACE_RATING_LABELS, PACE_RATING_LABELS_FILIPINO } from "@/lib/constants/pace";
import { buildRatingColumns, type RatingSheet } from "@/lib/utils/grade1Workbook";
import { groupLearnersBySex } from "@/lib/utils/learnerSex";
import type { PaceCompetency, PaceRating, PaceTerm } from "@/types";
import { CheckCircle2, Keyboard, MousePointerClick, PaintBucket } from "lucide-react";
import { Fragment, useMemo, useRef, useState, type KeyboardEvent } from "react";
import toast from "react-hot-toast";
import { ratingKey, type WorkbookLearner } from "../useGrade1Workbook";

/**
 * A class-summary sheet: one row per learner, one column per competency rated
 * in the sheet's term — the workbook's entry surface. Type a letter A-E and the
 * cursor drops to the next learner, so a whole column is rated top to bottom
 * the way the adviser fills it in Excel. Backspace / Delete clears a cell.
 *
 * The bar above the grid always says which competency the cursor is on (the
 * column labels alone are just numbers), and offers "fill blanks" for the
 * column — the usual case is most of the class on one level, with the
 * exceptions typed first.
 */

export const RATING_STYLES: Record<PaceRating | "", string> = {
  "": "",
  A: "bg-emerald-100 text-emerald-800",
  B: "bg-sky-100 text-sky-800",
  C: "bg-amber-100 text-amber-800",
  D: "bg-orange-100 text-orange-800",
  E: "bg-red-100 text-red-800",
};

interface RatingGridSheetProps {
  sheet: RatingSheet;
  learners: WorkbookLearner[];
  competencies: PaceCompetency[];
  ratings: Record<string, PaceRating>;
  disabled: boolean;
  onRate: (studentId: string, competencyId: string, term: PaceTerm, value: PaceRating | "") => void;
  onFillBlanks: (competencyId: string, term: PaceTerm, value: PaceRating, studentIds: string[]) => number;
}

export function RatingGridSheet({
  sheet,
  learners,
  competencies,
  ratings,
  disabled,
  onRate,
  onFillBlanks,
}: RatingGridSheetProps) {
  const groups = useMemo(() => buildRatingColumns(competencies, sheet), [competencies, sheet]);
  const columns = useMemo(() => groups.flatMap((g) => g.columns), [groups]);
  const strandOf = useMemo(() => groups.flatMap((g) => g.columns.map(() => g.strand)), [groups]);
  const sexGroups = useMemo(() => groupLearnersBySex(learners, (l) => l.gender), [learners]);
  const tableRef = useRef<HTMLTableElement>(null);
  const [focused, setFocused] = useState<{ row: number; col: number } | null>(null);

  const rated = (studentId: string, col: number) =>
    ratings[ratingKey(studentId, String(columns[col].competency.id), columns[col].term)] ?? "";

  const focusCell = (row: number, col: number) => {
    const el = tableRef.current?.querySelector<HTMLInputElement>(
      `input[data-row="${row}"][data-col="${col}"]`,
    );
    el?.focus();
    el?.select();
  };

  /** Clicking a column number jumps to its first unrated learner. */
  const focusColumn = (col: number) => {
    const firstBlank = learners.findIndex((l) => !rated(l.id, col));
    focusCell(firstBlank === -1 ? 0 : firstBlank, col);
  };

  const rate = (row: number, col: number, value: PaceRating | "") => {
    if (disabled) return;
    const column = columns[col];
    onRate(learners[row].id, String(column.competency.id), column.term, value);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    const key = e.key;
    const last = learners.length - 1;
    if (/^[a-eA-E]$/.test(key)) {
      e.preventDefault();
      rate(row, col, key.toUpperCase() as PaceRating);
      focusCell(Math.min(row + 1, last), col);
    } else if (key === "Backspace" || key === "Delete") {
      e.preventDefault();
      rate(row, col, "");
    } else if (key === "ArrowDown" || key === "Enter") {
      e.preventDefault();
      focusCell(Math.min(row + 1, last), col);
    } else if (key === "ArrowUp") {
      e.preventDefault();
      focusCell(Math.max(row - 1, 0), col);
    } else if (key === "ArrowRight") {
      e.preventDefault();
      focusCell(row, Math.min(col + 1, columns.length - 1));
    } else if (key === "ArrowLeft") {
      e.preventDefault();
      focusCell(row, Math.max(col - 1, 0));
    } else if (key.length === 1) {
      // Anything else typed is not a rating.
      e.preventDefault();
    }
  };

  // Phone keyboards report "Unidentified" to keydown, so the typed letter
  // arrives through onChange instead.
  const handleTyped = (raw: string, current: string, row: number, col: number) => {
    if (!raw) {
      rate(row, col, "");
      return;
    }
    const typed = raw.replace(current, "").slice(-1).toUpperCase();
    if (/^[A-E]$/.test(typed)) {
      rate(row, col, typed as PaceRating);
      focusCell(Math.min(row + 1, learners.length - 1), col);
    }
  };

  const columnRatedCount = (col: number) => learners.filter((l) => rated(l.id, col)).length;
  const rowRatedCount = (studentId: string) =>
    columns.reduce((n, _, col) => n + (rated(studentId, col) ? 1 : 0), 0);

  if (columns.length === 0) {
    return (
      <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
        No competencies are rated in this term for this learning area.
      </p>
    );
  }

  const fc = focused ? columns[focused.col] : null;
  const fcBlanks = focused ? learners.length - columnRatedCount(focused.col) : 0;

  const fill = (value: PaceRating) => {
    if (!focused || !fc) return;
    const n = onFillBlanks(String(fc.competency.id), fc.term, value, learners.map((l) => l.id));
    if (n > 0) toast.success(`${value} given to ${n} unrated learner${n === 1 ? "" : "s"}`);
    focusCell(focused.row, focused.col);
  };

  // Row numbers run across the MALE and FEMALE blocks, matching `learners`.
  const groupOffsets = sexGroups.map((_, i) =>
    sexGroups.slice(0, i).reduce((n, g) => n + g.rows.length, 0),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* What the cursor is on, and what can be done to its column. */}
      <div className="rounded-lg border bg-card px-3 py-2.5 shadow-xs" aria-live="polite">
        {fc && focused ? (
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">{strandOf[focused.col] || "Competency"}</p>
              <p className="text-sm leading-snug">
                <span className="mr-1 font-semibold tabular-nums">{fc.label}.</span>
                {fc.competency.description}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {fcBlanks === 0 ? (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  Column complete — every learner is rated
                </span>
              ) : (
                <span className="mr-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <PaintBucket className="h-3.5 w-3.5" aria-hidden />
                  Fill {fcBlanks} blank{fcBlanks === 1 ? "" : "s"} with
                </span>
              )}
              {fcBlanks > 0 && PACE_RATINGS.map((r) => (
                <Button
                  key={r}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || fcBlanks === 0}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => fill(r)}
                  title={`${r} — ${PACE_RATING_LABELS[r]}: every learner not yet rated in this column`}
                  aria-label={`Fill blanks in column ${fc.label} with ${r}, ${PACE_RATING_LABELS[r]}`}
                  className={`h-8 w-9 px-0 font-semibold pointer-coarse:h-11 pointer-coarse:w-11 ${RATING_STYLES[r]}`}
                >
                  {r}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <p className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
            <MousePointerClick className="h-4 w-4 shrink-0" aria-hidden />
            Click a cell or a column number to see its learning competency.
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card">
        <table ref={tableRef} className="border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-20 bg-muted">
            <tr>
              <th className="sticky left-0 z-30 border-b border-r bg-muted px-3 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Strand
              </th>
              {groups.map((g, i) => (
                <th
                  key={`${g.term}-${i}`}
                  colSpan={g.columns.length}
                  title={g.strand}
                  className="max-w-0 border-b border-r px-1.5 py-1 text-left align-bottom text-[11px] font-medium leading-tight"
                >
                  {/* A strand one or two columns wide cannot hold its name;
                      the bar above the grid spells it out on focus. */}
                  <span className={g.columns.length < 3 ? "block truncate" : "line-clamp-2"}>{g.strand}</span>
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 z-30 min-w-[15rem] border-b border-r bg-muted px-3 py-1.5 text-left font-medium">
                Learners&rsquo; Names
              </th>
              {columns.map((c, col) => {
                const done = columnRatedCount(col);
                const isFocused = focused?.col === col;
                return (
                  <th key={`${c.competency.id}-${c.term}`} className="border-b border-r p-0">
                    <button
                      type="button"
                      onClick={() => focusColumn(col)}
                      title={`${c.label}. ${c.competency.description} (${done}/${learners.length} rated)`}
                      aria-label={`Competency ${c.label}: ${done} of ${learners.length} rated`}
                      className={`flex w-full flex-col items-center gap-1 px-0.5 pb-1 pt-1.5 font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                        isFocused ? "bg-primary text-primary-foreground" : "hover:bg-background/70"
                      }`}
                    >
                      {c.label}
                      <span
                        aria-hidden
                        className={`h-1 w-6 overflow-hidden rounded-full ${isFocused ? "bg-primary-foreground/30" : "bg-border"}`}
                      >
                        <span
                          className={`block h-full rounded-full ${
                            done === learners.length ? "bg-emerald-500" : isFocused ? "bg-primary-foreground" : "bg-primary/60"
                          }`}
                          style={{ width: `${learners.length ? (done / learners.length) * 100 : 0}%` }}
                        />
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sexGroups.map((group, groupIdx) => (
              <Fragment key={group.key}>
                <LearnerSexGroupRow label={group.label} count={group.rows.length} colSpan={columns.length + 1} />
                {group.rows.map((learner, idx) => {
                  const row = groupOffsets[groupIdx] + idx;
                  const rowDone = rowRatedCount(learner.id);
                  const isRow = focused?.row === row;
                  return (
                    <tr key={learner.id} className="group">
                      <td
                        className={`sticky left-0 z-10 whitespace-nowrap border-b border-r px-3 py-1 ${
                          isRow ? "bg-accent font-semibold" : "bg-card group-hover:bg-muted"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="w-5 text-right text-muted-foreground tabular-nums">{idx + 1}</span>
                          <span className="flex-1">{learner.name}</span>
                          <span
                            className={`text-[11px] tabular-nums ${
                              rowDone === columns.length ? "text-emerald-700" : "text-muted-foreground"
                            }`}
                            title={`${rowDone} of ${columns.length} rated`}
                          >
                            {rowDone}/{columns.length}
                          </span>
                        </span>
                      </td>
                      {columns.map((c, col) => {
                        const value = rated(learner.id, col);
                        const inCross = focused && (focused.col === col || isRow);
                        return (
                          <td key={`${c.competency.id}-${c.term}`} className="border-b border-r p-0">
                            <input
                              data-row={row}
                              data-col={col}
                              value={value}
                              inputMode="text"
                              autoCapitalize="characters"
                              autoComplete="off"
                              spellCheck={false}
                              disabled={disabled}
                              aria-label={`${learner.name}, competency ${c.label}`}
                              onFocus={() => setFocused({ row, col })}
                              onKeyDown={(e) => handleKey(e, row, col)}
                              onChange={(e) => handleTyped(e.target.value, value, row, col)}
                              className={`block h-8 w-10 cursor-cell text-center text-[13px] font-semibold uppercase caret-transparent outline-none transition-colors focus:relative focus:z-10 focus:ring-2 focus:ring-inset focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60 pointer-coarse:h-11 pointer-coarse:w-12 ${
                                value ? RATING_STYLES[value] : inCross ? "bg-accent/60" : "bg-transparent group-hover:bg-muted/60"
                              }`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Keyboard className="h-3.5 w-3.5" aria-hidden />
          Type <kbd className="rounded border bg-muted px-1 font-mono">A</kbd>–
          <kbd className="rounded border bg-muted px-1 font-mono">E</kbd> to rate and move down ·{" "}
          <kbd className="rounded border bg-muted px-1 font-mono">Backspace</kbd> clears · arrow keys move
        </span>
        <span className="flex flex-wrap gap-2">
          {PACE_RATINGS.map((r) => (
            <span key={r} title={PACE_RATING_LABELS_FILIPINO[r]} className="flex items-center gap-1">
              <span className={`rounded px-1.5 font-semibold ${RATING_STYLES[r]}`}>{r}</span>
              {PACE_RATING_LABELS[r]}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
