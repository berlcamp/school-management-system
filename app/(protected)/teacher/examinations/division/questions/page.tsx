"use client";

import { BankQuestionModal } from "@/components/examinations/bank/BankQuestionModal";
import { DivisionReviewActions } from "@/components/examinations/review/DivisionReviewActions";
import { ReviewHistoryDialogProvider } from "@/components/examinations/review/ReviewHistoryDialogContext";
import { ReviewStatusBadge } from "@/components/examinations/review/ReviewStatusBadge";
import { TableSkeleton } from "@/components/TableSkeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLearningAreas } from "@/hooks/useCatalogue";
import { useDivisionAuthorStatus } from "@/hooks/useDivisionAuthorStatus";
import {
  BLOOM_LEVELS,
  getCognitiveLevelLabel,
  getExamQuestionTypeLabel,
} from "@/lib/constants/examinations";
import {
  QA_UNAUTHORIZED_MESSAGE,
  REVIEW_STATUS_LABEL,
  type ReviewStatus,
} from "@/lib/constants/examReview";
import {
  CATALOGUE_GRADES,
  catalogueGradeLabel,
} from "@/lib/constants/questionBank";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { escapeIlikePattern } from "@/lib/utils";
import { canEditReviewRow } from "@/lib/utils/examReview";
import { normalizeLcCode } from "@/lib/utils/questionBank";
import type { BankQuestion } from "@/types";
import { Library, MoreHorizontal, Pencil, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Row extends BankQuestion {
  competency: {
    lc_code: string;
    competency_text: string;
    grade_level: number;
    learning_area_id: string;
    area: { name: string } | null;
  } | null;
}

type TabKey = "mine" | "approved" | "pending" | "returned";

const TABS: { key: TabKey; label: string; mine: boolean; statuses: ReviewStatus[] }[] = [
  {
    key: "mine",
    label: "My Questions",
    mine: true,
    statuses: ["draft", "submitted", "under_review", "approved", "rejected"],
  },
  { key: "approved", label: "Approved", mine: false, statuses: ["approved"] },
  { key: "pending", label: "Pending", mine: true, statuses: ["submitted", "under_review"] },
  { key: "returned", label: "Returned", mine: true, statuses: ["rejected"] },
];

const ALL = "all";

/** Debounce a typed filter so each keystroke is not a query. */
function useDebounced(value: string, ms = 300): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * The teacher's Question Bank (195): their own questions in every review
 * status, plus every QA-approved question. Questions are written from the
 * Least Learned page; this page edits drafts / returned ones and submits
 * them to QA through 194's review workflow (entity "question").
 */
export default function Page() {
  const userId = useAppSelector((s) => s.user.user?.system_user_id ?? null);
  const { loading: authLoading, isAuthorized } = useDivisionAuthorStatus();
  const { areas } = useLearningAreas();
  const [tab, setTab] = useState<TabKey>("mine");
  const [areaId, setAreaId] = useState(ALL);
  const [grade, setGrade] = useState(ALL);
  const [level, setLevel] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [lcCode, setLcCode] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search);
  const debouncedLc = useDebounced(lcCode);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editRow, setEditRow] = useState<Row | null>(null);

  const activeTab = TABS.find((x) => x.key === tab) ?? TABS[0];

  useEffect(() => {
    let isMounted = true;
    if (!isAuthorized || userId == null) return;
    const t = TABS.find((x) => x.key === tab) ?? TABS[0];
    const statuses =
      status !== ALL && t.statuses.includes(status as ReviewStatus)
        ? [status as ReviewStatus]
        : t.statuses;
    (async () => {
      setLoading(true);
      let q = supabase
        .from("sms_exam_bank_questions")
        .select(
          "*, competency:catalogue_competency_id!inner(lc_code, competency_text, grade_level, learning_area_id, area:learning_area_id(name))",
        )
        .in("review_status", statuses)
        .order("updated_at", { ascending: false });
      if (t.mine) q = q.eq("created_by", Number(userId));
      if (areaId !== ALL) q = q.eq("competency.learning_area_id", Number(areaId));
      if (grade !== ALL) q = q.eq("competency.grade_level", Number(grade));
      if (level !== ALL) q = q.eq("cognitive_level", level);
      const lc = normalizeLcCode(debouncedLc);
      if (lc) q = q.ilike("competency.lc_code", `%${escapeIlikePattern(lc)}%`);
      const s = debouncedSearch.trim();
      if (s) q = q.ilike("question_text", `%${escapeIlikePattern(s)}%`);
      const { data, error } = await q;
      if (!isMounted) return;
      if (error) console.error(error);
      setRows((data as Row[] | null) ?? []);
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [
    tab,
    areaId,
    grade,
    level,
    status,
    debouncedLc,
    debouncedSearch,
    userId,
    isAuthorized,
    refreshKey,
  ]);

  const filtered =
    areaId !== ALL || grade !== ALL || level !== ALL || status !== ALL ||
    !!lcCode.trim() || !!search.trim();

  const clearFilters = () => {
    setAreaId(ALL);
    setGrade(ALL);
    setLevel(ALL);
    setStatus(ALL);
    setLcCode("");
    setSearch("");
  };

  return (
    <ReviewHistoryDialogProvider>
      <div>
        <div className="app__title">
          <Link
            href="/teacher/examinations"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Examinations
          </Link>
          <h1 className="app__title_text flex items-center gap-2">
            <Library className="h-5 w-5" />
            Question Bank
          </h1>
          <div className="app__title_actions">
            {isAuthorized && (
              <Button asChild variant="green" size="sm">
                <Link href="/teacher/examinations/division/llc">
                  <TrendingDown className="mr-1.5 h-4 w-4" />
                  Write for a least learned competency
                </Link>
              </Button>
            )}
          </div>
        </div>
        <div className="app__content space-y-4">
          {authLoading ? (
            <TableSkeleton />
          ) : !isAuthorized ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {QA_UNAUTHORIZED_MESSAGE}
            </div>
          ) : (
            <>
              <Tabs
                value={tab}
                onValueChange={(v) => {
                  setTab(v as TabKey);
                  setStatus(ALL);
                }}
              >
                <TabsList>
                  {TABS.map((t) => (
                    <TabsTrigger key={t.key} value={t.key}>
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                <Select value={areaId} onValueChange={setAreaId}>
                  <SelectTrigger aria-label="Learning area">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All learning areas</SelectItem>
                    {areas.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={grade} onValueChange={setGrade}>
                  <SelectTrigger aria-label="Grade level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All grades</SelectItem>
                    {CATALOGUE_GRADES.map((g) => (
                      <SelectItem key={g} value={String(g)}>
                        {catalogueGradeLabel(g)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={lcCode}
                  onChange={(e) => setLcCode(e.target.value)}
                  placeholder="LC code…"
                  aria-label="LC code"
                />
                <Select value={level} onValueChange={setLevel}>
                  <SelectTrigger aria-label="Cognitive level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All cognitive levels</SelectItem>
                    {BLOOM_LEVELS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label} ({l.tier})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={status}
                  onValueChange={setStatus}
                  disabled={activeTab.statuses.length < 2}
                >
                  <SelectTrigger aria-label="Status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All statuses</SelectItem>
                    {activeTab.statuses.map((st) => (
                      <SelectItem key={st} value={st}>
                        {REVIEW_STATUS_LABEL[st]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search question text…"
                  aria-label="Search question text"
                />
              </div>
              {filtered && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}

              {loading ? (
                <TableSkeleton />
              ) : rows.length === 0 ? (
                <div className="app__empty_state">
                  <p className="app__empty_state_title">No questions here</p>
                  <p className="text-sm text-muted-foreground">
                    {filtered
                      ? "No question matches these filters."
                      : tab === "mine"
                        ? "Write your first question from the Least Learned page."
                        : "Nothing in this list yet."}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-1 pr-2">LC code</th>
                        <th className="py-1 pr-2">Question</th>
                        <th className="py-1 pr-2">Area · Grade</th>
                        <th className="py-1 pr-2">Level</th>
                        <th className="py-1 pr-2">Type</th>
                        <th className="py-1 pr-2">Status</th>
                        <th className="py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const row = {
                          id: String(r.id),
                          created_by: r.created_by,
                          school_id: null,
                          review_status: r.review_status,
                        };
                        const canEdit = canEditReviewRow(row, {
                          userId,
                          isAuthorizedAuthor: isAuthorized,
                        });
                        return (
                          <tr key={r.id} className="border-b align-top">
                            <td className="py-1.5 pr-2 font-mono text-xs">
                              {r.competency?.lc_code}
                            </td>
                            <td className="max-w-md py-1.5 pr-2">
                              <p className="line-clamp-2">
                                {r.question_text ?? "(figure only)"}
                              </p>
                              {r.review_status === "rejected" && r.review_comment && (
                                <p className="mt-1 text-xs text-red-700">
                                  QA: {r.review_comment}
                                </p>
                              )}
                            </td>
                            <td className="py-1.5 pr-2">
                              {r.competency?.area?.name}
                              {r.competency &&
                                ` · ${catalogueGradeLabel(r.competency.grade_level)}`}
                            </td>
                            <td className="py-1.5 pr-2">
                              {getCognitiveLevelLabel(r.cognitive_level)}
                            </td>
                            <td className="py-1.5 pr-2">
                              {getExamQuestionTypeLabel(r.question_type)}
                            </td>
                            <td className="py-1.5 pr-2">
                              <ReviewStatusBadge status={r.review_status} />
                            </td>
                            <td className="py-1.5 text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label="Open menu"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {canEdit && (
                                    <DropdownMenuItem
                                      className="cursor-pointer"
                                      onClick={() => setEditRow(r)}
                                    >
                                      <Pencil className="mr-2 h-4 w-4" /> Edit
                                    </DropdownMenuItem>
                                  )}
                                  <DivisionReviewActions
                                    entity="question"
                                    row={row}
                                    userId={userId}
                                    isAuthorizedAuthor={isAuthorized}
                                    onChanged={() => setRefreshKey((k) => k + 1)}
                                  />
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {editRow?.competency && (
            <BankQuestionModal
              isOpen
              editId={String(editRow.id)}
              onClose={() => setEditRow(null)}
              onSaved={() => setRefreshKey((k) => k + 1)}
              competency={{
                id: String(editRow.catalogue_competency_id),
                lc_code: editRow.competency.lc_code,
                competency_text: editRow.competency.competency_text,
              }}
              schoolYear={editRow.source_llc_school_year}
            />
          )}
        </div>
      </div>
    </ReviewHistoryDialogProvider>
  );
}
