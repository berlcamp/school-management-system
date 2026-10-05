"use client";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PACE_TERMS } from "@/lib/constants/pace";
import {
  buildRatingColumns,
  countRatedCells,
  rateableCellsPerLearner,
  ratingSheetFor,
} from "@/lib/utils/grade1Workbook";
import type { PaceArea, PaceTerm } from "@/types";
import {
  ArrowLeft,
  CalendarCheck,
  Check,
  FileSpreadsheet,
  Info,
  Loader2,
  MessageSquareText,
  Printer,
  Sheet,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { PaceModal } from "../../../pace/components/PaceModal";
import { AttendanceSummarySheet } from "./components/AttendanceSummarySheet";
import { InputDataSheet } from "./components/InputDataSheet";
import { LearnerPrintSheet } from "./components/LearnerPrintSheet";
import { RatingGridSheet } from "./components/RatingGridSheet";
import { isNarrativeComplete, TermSummarySheet } from "./components/TermSummarySheet";
import {
  narrativeKey,
  ratingKey,
  useGrade1Workbook,
  type WorkbookLearner,
} from "./useGrade1Workbook";

/**
 * Grade 1 workbook for one section — the sheets of the issued
 * "[Grade 1] ECR, PACE Form, and SF9" workbook, regrouped by what the adviser
 * is doing rather than as seventeen spreadsheet tabs:
 *
 *   Input Data          INPUT DATA
 *   Rate Competencies   TERM 1/2/3 READING & LITERACY, TERM 1/2/3 LANGUAGE,
 *                       TERM 1-3 MATHEMATICS / GMRC / MAKABANSA
 *   Progress Card       TERM 1/2/3 SUMMARY
 *   Attendance          G1 - ATTENDANCE SUMMARY
 *   Print               PACE - GRADE 1, SF9 - GRADE 1
 *
 * Each view names the workbook sheet it stands for, so the mapping to the file
 * the division issued is never lost. The view, area and term live in the URL,
 * so a reload or a shared link reopens the same sheet.
 *
 * The class sheets are entry surfaces over the same rows as the per-learner
 * PACE form (migration 180).
 */

const VIEWS = [
  { key: "input", label: "Input Data", icon: UsersRound },
  { key: "rate", label: "Rate Competencies", icon: Sheet },
  { key: "card", label: "Progress Card", icon: MessageSquareText },
  { key: "attendance", label: "Attendance", icon: CalendarCheck },
  { key: "print", label: "Print", icon: Printer },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

const isView = (v: string | null): v is ViewKey => VIEWS.some((x) => x.key === v);
const toTerm = (v: string | null): PaceTerm => (v === "2" ? 2 : v === "3" ? 3 : 1);

export default function Grade1WorkbookPage() {
  const params = useParams();
  const sectionId = params.id as string;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const wb = useGrade1Workbook(sectionId);
  const [editing, setEditing] = useState<WorkbookLearner | null>(null);

  const view: ViewKey = isView(searchParams.get("view")) ? (searchParams.get("view") as ViewKey) : "input";
  const term = toTerm(searchParams.get("term"));
  const area: PaceArea | undefined =
    wb.areas.find((a) => a.code === searchParams.get("area")) ?? wb.areas[0];

  const navigate = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(searchParams.toString());
      Object.entries(patch).forEach(([k, v]) => next.set(k, v));
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const learnerIds = useMemo(() => wb.learners.map((l) => l.id), [wb.learners]);
  const isRated = useCallback(
    (s: string, c: string, t: PaceTerm) => !!wb.ratings[ratingKey(s, c, t)],
    [wb.ratings],
  );

  /** Rated / total cells for an area in a term — the counts on the pickers. */
  const progressOf = useCallback(
    (a: PaceArea, t: PaceTerm) => {
      const cols = buildRatingColumns(wb.competencies, ratingSheetFor(a, t)).flatMap((g) => g.columns);
      return countRatedCells(cols, learnerIds, isRated);
    },
    [wb.competencies, learnerIds, isRated],
  );

  const ratedCount = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.keys(wb.ratings).forEach((k) => {
      const sid = k.split(":")[0];
      counts[sid] = (counts[sid] ?? 0) + 1;
    });
    return counts;
  }, [wb.ratings]);
  const rateableTotal = useMemo(() => rateableCellsPerLearner(wb.competencies), [wb.competencies]);

  const narrativeDone = useCallback(
    (studentId: string, t: PaceTerm) => isNarrativeComplete(wb.narratives[narrativeKey(studentId, t)]),
    [wb.narratives],
  );

  if (wb.loading || !wb.info) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground" role="status">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        Loading Grade 1 workbook...
      </div>
    );
  }

  const info = wb.info;
  const sheet = area ? ratingSheetFor(area, term) : null;
  const sheetCaption: Record<ViewKey, string> = {
    input: "INPUT DATA",
    rate: sheet?.title ?? "",
    card: `TERM ${term} SUMMARY`,
    attendance: "G1 - ATTENDANCE SUMMARY",
    print: "PACE - GRADE 1 · SF9 - GRADE 1",
  };

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-[34rem] flex-col">
      {/* Header */}
      <div className="app__title flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="shrink-0" aria-label="Back to section">
            <Link href={`/teacher/sections/${sectionId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="app__title_text truncate">Grade 1 - {info.sectionName}</h1>
            <p className="truncate text-xs text-muted-foreground">
              Grade 1 Workbook · S.Y. {info.schoolYear} · {wb.learners.length} learner
              {wb.learners.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
            wb.saving ? "text-muted-foreground" : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
          role="status"
          aria-live="polite"
        >
          {wb.saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Saving…
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden /> All changes saved
            </>
          )}
        </span>
      </div>

      <div className="app__content flex min-h-0 flex-1 flex-col gap-3">
        {wb.yearLocked && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Editing records from previous school years is disabled. Enable it in School Settings to make changes.
          </p>
        )}

        {/* Level 1: what the adviser is doing. */}
        <div className="-mx-1 overflow-x-auto px-1 pb-0.5">
          <Tabs value={view} onValueChange={(v) => navigate({ view: v })}>
            <TabsList className="h-10">
              {VIEWS.map(({ key, label, icon: Icon }) => (
                <TabsTrigger key={key} value={key} className="px-3">
                  <Icon aria-hidden />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Level 2: which sheet, with progress, for the two views that have several. */}
        {view === "rate" && area && (
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div className="-mx-1 overflow-x-auto px-1">
              <div className="flex w-max gap-1.5" role="group" aria-label="Learning area">
                {wb.areas.map((a) => {
                  const p = progressOf(a, term);
                  const active = a.id === area.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => navigate({ area: a.code })}
                      className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                        active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
                      }`}
                    >
                      <span className="font-medium">{a.name}</span>
                      <ProgressPill rated={p.rated} total={p.total} inverted={active} />
                    </button>
                  );
                })}
              </div>
            </div>
            <TermSwitch
              term={term}
              onChange={(t) => navigate({ term: String(t) })}
              progress={(t) => progressOf(area, t)}
            />
          </div>
        )}

        {view === "card" && (
          <TermSwitch
            term={term}
            onChange={(t) => navigate({ term: String(t) })}
            progress={(t) => ({
              rated: wb.learners.filter((l) => narrativeDone(l.id, t)).length,
              total: wb.learners.length,
            })}
          />
        )}

        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
          Workbook sheet: <span className="font-medium text-foreground/80">{sheetCaption[view]}</span>
        </p>

        {wb.learners.length === 0 && view !== "input" ? (
          <div className="rounded-lg border border-dashed py-12 text-center">
            <p className="text-sm font-medium">No learners are enrolled in this section yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">Enrol learners first; they appear here automatically.</p>
          </div>
        ) : view === "input" ? (
          <InputDataSheet info={info} learners={wb.learners} />
        ) : view === "rate" && sheet ? (
          <RatingGridSheet
            key={sheet.key}
            sheet={sheet}
            learners={wb.learners}
            competencies={wb.competencies}
            ratings={wb.ratings}
            disabled={wb.isLocked}
            onRate={wb.setRating}
            onFillBlanks={wb.fillBlanks}
          />
        ) : view === "card" ? (
          <TermSummarySheet
            key={term}
            term={term}
            schoolYear={info.schoolYear}
            learners={wb.learners}
            narratives={wb.narratives}
            disabled={wb.isLocked}
            onChange={wb.setNarrative}
          />
        ) : view === "attendance" ? (
          <AttendanceSummarySheet
            sectionId={sectionId}
            schoolYear={info.schoolYear}
            learners={wb.learners}
            attendance={wb.attendance}
          />
        ) : view === "print" ? (
          <LearnerPrintSheet
            sectionId={sectionId}
            info={info}
            learners={wb.learners}
            ratedCount={ratedCount}
            rateableTotal={rateableTotal}
            narrativeDone={narrativeDone}
            onEdit={setEditing}
          />
        ) : null}
      </div>

      {editing && (
        <PaceModal
          open
          onOpenChange={(open) => {
            if (!open) {
              setEditing(null);
              // The learner's form may have changed ratings and narratives
              // shown on the class sheets; refresh in place.
              void wb.reload();
            }
          }}
          schoolId={info.schoolId}
          studentId={editing.id}
          studentName={editing.name}
          sectionId={sectionId}
          sectionName={info.sectionName}
          schoolYear={info.schoolYear}
        />
      )}
    </div>
  );
}

/** "12/40" with a check once complete; colours flip on a selected (dark) button. */
function ProgressPill({ rated, total, inverted }: { rated: number; total: number; inverted?: boolean }) {
  // A term in which the area rates nothing has no count to show.
  if (total === 0) return null;
  const complete = rated === total;
  return (
    <span
      className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
        inverted
          ? "bg-primary-foreground/20 text-primary-foreground"
          : complete
            ? "bg-emerald-100 text-emerald-800"
            : "bg-muted text-muted-foreground"
      }`}
    >
      {complete && <Check className="h-3 w-3" aria-hidden />}
      {rated}/{total}
    </span>
  );
}

function TermSwitch({
  term,
  onChange,
  progress,
}: {
  term: PaceTerm;
  onChange: (t: PaceTerm) => void;
  progress: (t: PaceTerm) => { rated: number; total: number };
}) {
  return (
    <div className="inline-flex w-fit rounded-lg border bg-muted p-1" role="group" aria-label="Term">
      {PACE_TERMS.map((t) => {
        const p = progress(t);
        const active = t === term;
        return (
          <button
            key={t}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(t)}
            className={`flex min-h-9 items-center gap-2 rounded-md px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
              active ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Term {t}
            <ProgressPill rated={p.rated} total={p.total} />
          </button>
        );
      })}
    </div>
  );
}
