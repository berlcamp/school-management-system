"use client";

/**
 * The per-exam scanning workspace: answer key → answer sheets → scan → results.
 *
 * Mounted for both the teacher and the division pages because the answer key is
 * a property of the exam, not of who is looking at it. What differs is what the
 * role can do:
 *
 *   - the exam's author edits the key; everyone else sees it read-only, so a
 *     division-authored exam cannot pick up a different key at each school;
 *   - sheets, scanning and results are per-section and belong to a teacher, so
 *     the division view offers a single sample sheet to check the layout
 *     against a printer and nothing more.
 *
 * The key is loaded once here and passed down. Every tab has to agree on it:
 * the sheet is laid out from it, the scan is read against it and the slips are
 * printed from it, and a tab holding a stale copy would silently mis-score.
 *
 * The section and the class roster are loaded once here for the same reason.
 * Three tabs used to ask for the section separately and each ran its own roster
 * query against the answer — one control, one query, one list, three readers.
 *
 * What each step is waiting on is computed here too, because the rail has to
 * say it while the step itself is closed: the answer key from the loaded key,
 * the sheets from the roster, the scan from the panel's unsaved draft, and the
 * results from a cheap count that does not need the Results tab to be open.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useSectionRoster, useTeacherSections } from "@/hooks/useExamRoster";
import { getGradeLevelLabel } from "@/lib/constants";
import type { AnswerKeyItem } from "@/lib/omr/score";
import { generateAnswerSheets } from "@/lib/pdf/generateAnswerSheets";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { fetchAnswerKey } from "@/lib/utils/examAnswerKey";
import {
  getCurrentSchoolYear,
  getGradingPeriodLabel,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { generateTosTitle } from "@/lib/utils/tos";
import {
  FileDown,
  FileSpreadsheet,
  KeyRound,
  ListChecks,
  Loader2,
  Lock,
  LockOpen,
  ScanLine,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { AnswerKeyEditor } from "./AnswerKeyEditor";
import { canReadExamPaper } from "@/lib/utils/examReleaseCode";
import { canManageTieredRow } from "@/lib/utils/examVisibility";
import { AnswerSheetPanel } from "./AnswerSheetPanel";
import { ExamContextBar } from "./ExamContextBar";
import { ExamReleaseCodeCard } from "./ExamReleaseCodeCard";
import { ExamStepRail, type ExamStep, type StepTone } from "./ExamStepRail";
import { ExamUnlockPanel } from "./ExamUnlockPanel";
import { ExamResultsPanel } from "./ExamResultsPanel";
import { ScanScorePanel } from "./ScanScorePanel";

interface ExamHeader {
  id: string;
  versionLabel: string;
  title: string | null;
  schoolId: number | null;
  isSchoolShared: boolean;
  createdBy: string | null;
  tos: {
    subject_name: string;
    grade_level: number;
    exam_type: string;
    grading_period: number;
    school_year: string;
    title: string | null;
  };
}

interface ExamScanWorkspaceProps {
  examId: string;
  mode: "teacher" | "division";
}

/** What the Scan step reports back so the rail can speak for it while closed. */
export interface ScanDraftSummary {
  sheets: number;
  needsAttention: number;
}

export function ExamScanWorkspace({ examId, mode }: ExamScanWorkspaceProps) {
  const user = useAppSelector((state) => state.user.user);
  const userId = user?.system_user_id ?? null;
  const schoolId = user?.school_id != null ? Number(user.school_id) : null;

  const [exam, setExam] = useState<ExamHeader | null>(null);
  const [answerKey, setAnswerKey] = useState<AnswerKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [sectionId, setSectionId] = useState("");
  const [resultsToken, setResultsToken] = useState(0);
  const [step, setStep] = useState("key");
  const [scanDraft, setScanDraft] = useState<ScanDraftSummary>({
    sheets: 0,
    needsAttention: 0,
  });
  const [sealed, setSealed] = useState(false);
  const [resultCount, setResultCount] = useState<number | null>(null);
  const [resultMps, setResultMps] = useState<number | null>(null);
  // Whether this account may read the paper at all (migration 161). Asked of
  // the database, so the UI cannot disagree with the RLS that will answer the
  // question again when the questions are actually fetched.
  const [paperUnlocked, setPaperUnlocked] = useState(true);

  // A super admin's roster is the whole division and a school head's is the
  // whole school — right for "what may this account reach", useless for picking
  // the class whose answer sheets are on the desk. Both are narrowed to the
  // sections that could actually have sat THIS paper: the TOS's grade level,
  // and for the super admin the exam's own school — or, for a division-authored
  // exam that belongs to no school, the active school AuthGuard put them in
  // (094/113); a head is confined to their own school already. A teacher's list
  // is their own assignments and is left alone.
  const { sections, loading: sectionsLoading } = useTeacherSections(
    schoolYear,
    {
      teacherId: userId,
      userType: user?.type ?? null,
      schoolId,
    },
    {
      gradeLevel: exam?.tos.grade_level ?? null,
      schoolId: exam?.schoolId ?? schoolId,
    },
  );
  // One roster for the three steps that need it. They must agree on it exactly:
  // the sheets are printed from this list, the scans are matched against it and
  // the results are saved for it.
  const { learners, loading: rosterLoading } = useSectionRoster(
    sectionId,
    schoolYear,
  );
  const [schoolName, setSchoolName] = useState("");
  /** The exam's author, shown in the header when it is not the reader's own. */
  const [authorName, setAuthorName] = useState("");

  // Whoever may edit the exam may edit its key and hold its release code:
  // division rows in division mode, and school-side the author plus — for a
  // school-wide exam (160) — that school's head. Mirrors `can_manage_exam` in
  // migration 161, which is the copy the database enforces.
  const canManage =
    exam != null &&
    (mode === "division" ||
      canManageTieredRow(
        {
          school_id: exam.schoolId,
          is_school_shared: exam.isSchoolShared,
          created_by: exam.createdBy,
        },
        { userId, schoolId, type: user?.type ?? null },
      ));

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const { data, error } = await supabase
      .from("sms_exams")
      // Kept as one literal — PostgREST types the select string at the type
      // level, and a concatenated string loses that inference.
      .select(
        "id, version_label, title, school_id, is_school_shared, created_by, tos:tos_id!inner(subject_name, grade_level, exam_type, grading_period, school_year, title)",
      )
      .eq("id", Number(examId))
      .maybeSingle();

    if (error || !data) {
      setLoadError(error?.message ?? "This exam could not be found.");
      setLoading(false);
      return;
    }

    const tos = (
      Array.isArray(data.tos) ? data.tos[0] : data.tos
    ) as ExamHeader["tos"];

    setExam({
      id: String(data.id),
      versionLabel: data.version_label,
      title: data.title,
      schoolId: data.school_id != null ? Number(data.school_id) : null,
      isSchoolShared: data.is_school_shared === true,
      createdBy: data.created_by != null ? String(data.created_by) : null,
      tos,
    });
    setSchoolYear(tos.school_year || getCurrentSchoolYear());

    // Ask before fetching: a sealed exam returns an empty key rather than an
    // error (RLS filters rows, it does not raise), which would otherwise look
    // like an exam nobody had keyed yet.
    //
    // A check that could not be run is NOT a seal. It says the gate could not
    // be asked — the function missing, EXECUTE not granted — so it is reported
    // and the workspace opens. RLS still decides what the rows are, so nothing
    // is exposed by carrying on; treating this as "sealed" only locked out the
    // people the exam belongs to.
    const { allowed, error: gateError } = await canReadExamPaper(examId);
    if (gateError) {
      toast.error(`Could not check the release status: ${gateError}`);
    }
    setPaperUnlocked(allowed);

    if (allowed) {
      try {
        setAnswerKey(await fetchAnswerKey(examId));
      } catch (keyError) {
        toast.error(
          keyError instanceof Error ? keyError.message : String(keyError),
        );
      }
    } else {
      setAnswerKey([]);
    }
    setLoading(false);
  }, [examId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!schoolId) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("sms_schools")
        .select("name")
        .eq("id", schoolId)
        .maybeSingle();
      if (active && data?.name) setSchoolName(data.name as string);
    })();
    return () => {
      active = false;
    };
  }, [schoolId]);

  // Whose paper this is. Worth naming because a super admin (or a school head)
  // reaches exams they did not write, and "answer key" plus a class list gives
  // no clue which teacher's test is open. Skipped when it is the reader's own.
  const authorId = exam?.createdBy ?? null;
  const authorIsMe = authorId != null && String(authorId) === String(userId);
  useEffect(() => {
    if (!authorId || authorIsMe) {
      setAuthorName("");
      return;
    }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("sms_users")
        .select("name")
        .eq("id", Number(authorId))
        .maybeSingle();
      if (active && data?.name) setAuthorName(data.name as string);
    })();
    return () => {
      active = false;
    };
  }, [authorId, authorIsMe]);

  /**
   * How many learners already have a saved result for this section.
   *
   * Read here rather than taken from the Results panel because the rail has to
   * say it while that tab is closed — and Radix unmounts a closed tab, so the
   * panel is not there to ask. Two head counts, re-run when the scan tab saves.
   */
  useEffect(() => {
    if (mode !== "teacher" || !sectionId || !examId) {
      setResultCount(null);
      setResultMps(null);
      return;
    }
    let active = true;
    (async () => {
      const { data: result } = await supabase
        .from("sms_exam_results")
        .select("id, mps")
        .eq("exam_id", Number(examId))
        .eq("section_id", Number(sectionId))
        .eq("school_year", schoolYear)
        .maybeSingle();
      if (!active) return;

      if (!result?.id) {
        setResultCount(0);
        setResultMps(null);
        return;
      }

      const { count } = await supabase
        .from("sms_exam_result_students")
        .select("student_id", { count: "exact", head: true })
        .eq("result_id", result.id);
      if (!active) return;

      setResultCount(count ?? 0);
      setResultMps(result.mps != null ? Number(result.mps) : null);
    })();
    return () => {
      active = false;
    };
  }, [mode, examId, sectionId, schoolYear, resultsToken]);

  const handleSectionChange = useCallback((id: string) => setSectionId(id), []);
  const handleSchoolYearChange = useCallback((sy: string) => {
    setSchoolYear(sy);
    setSectionId("");
  }, []);
  const handleScanDraftChange = useCallback(
    (draft: ScanDraftSummary) => setScanDraft(draft),
    [],
  );

  const keyed = useMemo(
    () => answerKey.filter((i) => i.correctAnswer).length,
    [answerKey],
  );
  const activeSection = useMemo(
    () => sections.find((s) => s.id === sectionId) ?? null,
    [sections, sectionId],
  );

  /**
   * The rail's four status lines.
   *
   * Each is the specific fact, and each blocked step names what is blocking it
   * rather than simply reading as unavailable — "Needs the answer key" tells a
   * teacher where to go, "Not available" sends them clicking.
   */
  const steps: ExamStep[] = useMemo(() => {
    const keyStep: { tone: StepTone; status: string } =
      answerKey.length === 0
        ? { tone: "attention", status: "Not set yet" }
        : keyed === 0
          ? { tone: "attention", status: `${answerKey.length} items, none keyed` }
          : keyed < answerKey.length
            ? {
                tone: "attention",
                status: `${keyed} of ${answerKey.length} keyed`,
              }
            : { tone: "done", status: `All ${answerKey.length} items keyed` };

    const sheetStep: { tone: StepTone; status: string } =
      answerKey.length === 0
        ? { tone: "waiting", status: "Needs the answer key" }
        : !sectionId
          ? { tone: "waiting", status: "Choose a section" }
          : rosterLoading
            ? { tone: "waiting", status: "Loading the class list…" }
            : learners.length === 0
              ? { tone: "attention", status: "No learners in this section" }
              : {
                  tone: "waiting",
                  status: `${learners.length} sheet${
                    learners.length === 1 ? "" : "s"
                  } ready to print`,
                };

    const scanStep: { tone: StepTone; status: string } =
      answerKey.length === 0
        ? { tone: "waiting", status: "Needs the answer key" }
        : !sectionId
          ? { tone: "waiting", status: "Choose a section" }
          : scanDraft.needsAttention > 0
            ? {
                tone: "attention",
                status: `${scanDraft.needsAttention} sheet${
                  scanDraft.needsAttention === 1 ? "" : "s"
                } need a look`,
              }
            : scanDraft.sheets > 0
              ? {
                  tone: "attention",
                  status: `${scanDraft.sheets} scanned, not saved`,
                }
              : { tone: "waiting", status: "Nothing scanned yet" };

    const resultStep: { tone: StepTone; status: string } = !sectionId
      ? { tone: "waiting", status: "Choose a section" }
      : resultCount == null
        ? { tone: "waiting", status: "Checking…" }
        : resultCount === 0
          ? { tone: "waiting", status: "Nothing saved yet" }
          : {
              tone: "done",
              status:
                resultMps != null
                  ? `${resultCount} saved · MPS ${resultMps.toFixed(1)}%`
                  : `${resultCount} result${resultCount === 1 ? "" : "s"} saved`,
            };

    return [
      {
        value: "key",
        label: "Answer Key",
        icon: KeyRound,
        tone: keyStep.tone,
        status: keyStep.status,
      },
      {
        value: "sheets",
        label: "Answer Sheets",
        icon: FileSpreadsheet,
        tone: sheetStep.tone,
        status: sheetStep.status,
      },
      {
        value: "scan",
        label: "Scan & Score",
        icon: ScanLine,
        tone: scanStep.tone,
        status: scanStep.status,
      },
      {
        value: "results",
        label: "Results",
        icon: ListChecks,
        tone: resultStep.tone,
        status: resultStep.status,
      },
    ];
  }, [
    answerKey.length,
    keyed,
    sectionId,
    rosterLoading,
    learners.length,
    scanDraft,
    resultCount,
    resultMps,
  ]);

  if (loading) {
    return (
      <div className="app__content flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading exam…
      </div>
    );
  }

  if (loadError || !exam) {
    return (
      <div className="app__content">
        <div className="app__empty_state">
          <p className="app__empty_state_title">Exam not available</p>
          <p className="app__empty_state_description">{loadError}</p>
        </div>
      </div>
    );
  }

  const examTitle =
    exam.title?.trim() || generateTosTitle(exam.tos) || "Examination";
  const backHref =
    mode === "teacher"
      ? "/teacher/examinations/exam"
      : "/division/examinations/exam";

  const meta = [
    exam.versionLabel,
    exam.tos.subject_name,
    getGradeLevelLabel(exam.tos.grade_level),
    getGradingPeriodLabel(exam.tos.school_year, exam.tos.grading_period),
    exam.schoolId == null
      ? "Authored by the division office"
      : authorName
        ? `Authored by ${authorName}`
        : "",
  ].filter(Boolean);

  const printSampleSheet = () => {
    if (answerKey.length === 0) {
      toast.error("Set the answer key first — it defines the sheet layout.");
      return;
    }
    try {
      generateAnswerSheets({
        schoolName: schoolName || "Schools Division of Bayugan City",
        examTitle,
        subjectName: exam.tos.subject_name,
        sectionName: "SAMPLE",
        schoolYear: exam.tos.school_year,
        versionLabel: exam.versionLabel,
        answerKey,
        learners: [{ studentId: 0, name: "Sample Learner", lrn: null }],
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div>
      <div className="app__title flex-wrap gap-y-1">
        <Link
          href={backHref}
          className="shrink-0 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          ← Exam Creator
        </Link>
        <h1 className="app__title_text flex min-w-0 flex-1 items-center gap-2 text-xl sm:text-2xl">
          <ScanLine className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="truncate">{examTitle}</span>
        </h1>
        {canManage && (
          <div className="app__title_actions">
            <Badge
              variant="outline"
              className={
                sealed
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-emerald-300 bg-emerald-50 text-emerald-800"
              }
            >
              {sealed ? (
                <Lock className="h-3 w-3" />
              ) : (
                <LockOpen className="h-3 w-3" />
              )}
              {sealed ? "Sealed" : "Open"}
            </Badge>
          </div>
        )}
      </div>

      <div className="app__content space-y-4">
        {!paperUnlocked ? (
          <ExamUnlockPanel
            examId={examId}
            examTitle={examTitle}
            onUnlocked={() => void load()}
          />
        ) : mode === "division" ? (
          <>
            <ExamIdentityStrip meta={meta} />

            {canManage && (
              <ExamReleaseCodeCard examId={examId} onSealedChange={setSealed} />
            )}

            <AnswerKeyEditor
              examId={examId}
              answerKey={answerKey}
              canEdit={canManage}
              onChange={setAnswerKey}
              onSaved={setAnswerKey}
            />

            <div className="rounded-lg border bg-card p-3.5">
              <p className="mb-1 text-sm font-semibold">Check the layout</p>
              <p className="mb-3 text-[0.8125rem] text-muted-foreground">
                Print one sample sheet and run it through a school scanner
                before sharing this exam. Schools print their own personalised
                sheets per learner from the teacher workspace.
              </p>
              <Button size="sm" variant="outline" onClick={printSampleSheet}>
                <FileDown className="mr-1.5 h-4 w-4" />
                Download sample answer sheet
              </Button>
            </div>
          </>
        ) : (
          <>
            <ExamContextBar
              meta={meta}
              sections={sections}
              sectionId={sectionId}
              onSectionChange={handleSectionChange}
              sectionsLoading={sectionsLoading}
              schoolYear={schoolYear}
              schoolYearOptions={getSchoolYearOptions()}
              onSchoolYearChange={handleSchoolYearChange}
              learnerCount={learners.length}
              rosterLoading={rosterLoading}
            />

            <Tabs value={step} onValueChange={setStep} className="w-full gap-4">
              <ExamStepRail steps={steps} />

              <TabsContent value="key" className="mt-0 space-y-4">
                {/* Who may edit the key is who may seal the exam, so the
                    control sits with it rather than on a tab of its own. */}
                {canManage && (
                  <ExamReleaseCodeCard
                    examId={examId}
                    onSealedChange={setSealed}
                  />
                )}

                <AnswerKeyEditor
                  examId={examId}
                  answerKey={answerKey}
                  canEdit={canManage}
                  onChange={setAnswerKey}
                  onSaved={setAnswerKey}
                  onContinue={() => setStep("sheets")}
                />
              </TabsContent>

              <TabsContent value="sheets" className="mt-0">
                <AnswerSheetPanel
                  answerKey={answerKey}
                  schoolName={schoolName}
                  examTitle={examTitle}
                  subjectName={exam.tos.subject_name}
                  versionLabel={exam.versionLabel}
                  schoolYear={schoolYear}
                  sectionId={sectionId}
                  sectionName={activeSection?.name ?? ""}
                  learners={learners}
                  rosterLoading={rosterLoading}
                  onGoToStep={setStep}
                />
              </TabsContent>

              {/* forceMount: a closed Radix tab unmounts, and this one holds
                  the scanned-but-unsaved batch. Leaving to check the Results
                  tab mid-review used to throw away every decoded sheet with no
                  warning — the one place on this page where work was lost. */}
              <TabsContent
                value="scan"
                forceMount
                className="mt-0 data-[state=inactive]:hidden"
              >
                <ScanScorePanel
                  examId={examId}
                  answerKey={answerKey}
                  schoolYear={schoolYear}
                  sectionId={sectionId}
                  sectionSchoolId={activeSection?.school_id ?? null}
                  learners={learners}
                  teacherId={userId}
                  fallbackSchoolId={schoolId}
                  onSaved={() => {
                    setResultsToken((n) => n + 1);
                    setStep("results");
                  }}
                  onDraftChange={handleScanDraftChange}
                  onGoToStep={setStep}
                />
              </TabsContent>

              <TabsContent value="results" className="mt-0">
                <ExamResultsPanel
                  examId={examId}
                  answerKey={answerKey}
                  schoolName={schoolName}
                  examTitle={examTitle}
                  subjectName={exam.tos.subject_name}
                  versionLabel={exam.versionLabel}
                  schoolYear={schoolYear}
                  sectionId={sectionId}
                  sectionName={activeSection?.name ?? ""}
                  sectionGradeLevel={activeSection?.grade_level ?? 0}
                  learners={learners}
                  teacherName={user?.name ?? null}
                  refreshToken={resultsToken}
                  onGoToStep={setStep}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}

/** The paper's identity for the division view, which has no section to pick. */
function ExamIdentityStrip({ meta }: { meta: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-card px-3.5 py-2.5 text-xs text-muted-foreground">
      {meta.map((item, index) => (
        <span key={item} className="flex items-center gap-2">
          {index > 0 && <span aria-hidden>·</span>}
          {item}
        </span>
      ))}
    </div>
  );
}
