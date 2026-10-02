"use client";

import { BankQuestionModal } from "@/components/examinations/bank/BankQuestionModal";
import { TableSkeleton } from "@/components/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLearningAreas } from "@/hooks/useCatalogue";
import { useDivisionAuthorStatus } from "@/hooks/useDivisionAuthorStatus";
import { QA_UNAUTHORIZED_MESSAGE } from "@/lib/constants/examReview";
import {
  CATALOGUE_GRADES,
  LLC_COUNT,
  LLC_COVERAGE_NOTE,
  catalogueGradeLabel,
} from "@/lib/constants/questionBank";
import { fetchLlc, fetchLlcCoverage, type LlcRow } from "@/lib/utils/questionBank";
import { getCurrentSchoolYear, getSchoolYearOptions } from "@/lib/utils/schoolYear";
import { Library, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/**
 * Least Learned Competencies (195): the division-wide lowest-MPS catalogue
 * competencies of one learning area + grade + school year, from Summative
 * Test results only. Authorized Division authors write Question Bank
 * questions from here; the list's school year becomes the question's
 * `source_llc_school_year`.
 */
export default function Page() {
  const { loading: authLoading, isAuthorized } = useDivisionAuthorStatus();
  const { areas } = useLearningAreas();
  const [areaId, setAreaId] = useState("");
  const [grade, setGrade] = useState("");
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [rows, setRows] = useState<LlcRow[]>([]);
  const [coverage, setCoverage] = useState<{
    results: number;
    schools: number;
    learners: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [writeFor, setWriteFor] = useState<LlcRow | null>(null);

  const schoolYears = useMemo(() => {
    const opts = getSchoolYearOptions(4, 0).reverse();
    const current = getCurrentSchoolYear();
    return opts.includes(current) ? opts : [current, ...opts];
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (!areaId || grade === "" || !isAuthorized) return;
    (async () => {
      setLoading(true);
      setRows([]);
      setCoverage(null);
      setError(null);
      const [llc, cov] = await Promise.all([
        fetchLlc(areaId, Number(grade), schoolYear),
        fetchLlcCoverage(areaId, Number(grade), schoolYear),
      ]);
      if (!isMounted) return;
      setRows(llc.rows);
      setError(llc.error);
      setCoverage(cov);
      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [areaId, grade, schoolYear, isAuthorized]);

  return (
    <div>
      <div className="app__title">
        <Link
          href="/teacher/examinations"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Examinations
        </Link>
        <h1 className="app__title_text flex items-center gap-2">
          <TrendingDown className="h-5 w-5" />
          Least Learned Competencies
        </h1>
        <div className="app__title_actions">
          {isAuthorized && (
            <Button asChild variant="outline" size="sm">
              <Link href="/teacher/examinations/division/questions">
                <Library className="mr-1.5 h-4 w-4" />
                Question Bank
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
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="mb-1.5 block">Learning area</Label>
                <Select value={areaId} onValueChange={setAreaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent>
                    {areas.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block">Grade level</Label>
                <Select value={grade} onValueChange={setGrade}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATALOGUE_GRADES.map((g) => (
                      <SelectItem key={g} value={String(g)}>
                        {catalogueGradeLabel(g)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block">School year</Label>
                <Select value={schoolYear} onValueChange={setSchoolYear}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {schoolYears.map((sy) => (
                      <SelectItem key={sy} value={sy}>
                        {sy}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!areaId || grade === "" ? (
              <p className="text-sm text-muted-foreground">
                Choose a learning area and grade level.
              </p>
            ) : loading ? (
              <TableSkeleton />
            ) : error ? (
              <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            ) : rows.length === 0 ? (
              <div className="app__empty_state">
                <p className="app__empty_state_title">
                  No Summative Test results yet
                </p>
                <p className="text-sm text-muted-foreground">
                  No Summative Test results have been recorded for{" "}
                  {areas.find((a) => String(a.id) === areaId)?.name ??
                    "this learning area"}
                  , {catalogueGradeLabel(Number(grade))}, S.Y. {schoolYear}, so
                  there is no Least Learned list to write for.{" "}
                  {LLC_COVERAGE_NOTE}
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  The {LLC_COUNT} lowest competencies by Mean Percentage Score
                  (ties at the cut included)
                  {coverage &&
                    ` — based on ${coverage.results} Summative Test result(s) from ${coverage.schools} school(s), ${coverage.learners} learner(s)`}
                  . {LLC_COVERAGE_NOTE}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-1 pr-2">LC code</th>
                        <th className="py-1 pr-2">Competency</th>
                        <th className="py-1 pr-2 text-right">MPS</th>
                        <th className="py-1 pr-2 text-right">Learners</th>
                        <th className="py-1 pr-2 text-right">Sections</th>
                        <th className="py-1 pr-2 text-right">Schools</th>
                        <th className="py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.catalogue_competency_id} className="border-b align-top">
                          <td className="py-1.5 pr-2 font-mono text-xs">{r.lc_code}</td>
                          <td className="py-1.5 pr-2">{r.competency_text}</td>
                          <td className="py-1.5 pr-2 text-right">{r.mps.toFixed(2)}%</td>
                          <td className="py-1.5 pr-2 text-right">{r.learners}</td>
                          <td className="py-1.5 pr-2 text-right">{r.sections}</td>
                          <td className="py-1.5 pr-2 text-right">{r.schools}</td>
                          <td className="py-1.5 text-right">
                            <Button
                              size="sm"
                              variant="green"
                              onClick={() => setWriteFor(r)}
                            >
                              Write question
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
        {writeFor && (
          <BankQuestionModal
            isOpen
            onClose={() => setWriteFor(null)}
            onSaved={() => {}}
            competency={{
              id: writeFor.catalogue_competency_id,
              lc_code: writeFor.lc_code,
              competency_text: writeFor.competency_text,
            }}
            schoolYear={schoolYear}
          />
        )}
      </div>
    </div>
  );
}
