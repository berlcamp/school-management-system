"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { mpsBySex } from "@/lib/utils/mps";
import {
  getCurrentSchoolYear,
  getSchoolYearOptions,
} from "@/lib/utils/schoolYear";
import { BarChart3, ClipboardList } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchResultMarks } from "../../mps/components/MpsLeastLearned";
import { MpsSingleRow, MpsQuarterTable } from "../../mps/components/MpsTable";

interface Agg {
  key: string;
  subjectName: string;
  sectionName: string;
  gradeLevel: number;
  quarter: number;
  values: number[];
  male: number[];
  female: number[];
}

function avg(values: Array<number | null | undefined>): number | null {
  const present = values.filter(
    (v): v is number => typeof v === "number" && !Number.isNaN(v)
  );
  if (present.length === 0) return null;
  return present.reduce((acc, v) => acc + v, 0) / present.length;
}

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const userId = user?.system_user_id ?? null;

  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());
  const [rows, setRows] = useState<MpsSingleRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRows = useCallback(async () => {
    if (!userId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sms_exam_results")
        .select(
          "id, mps, total_items, section_id, section:section_id(name, grade_level), exam:exam_id!inner(tos:tos_id!inner(subject_name, grade_level, grading_period))"
        )
        .eq("teacher_id", userId)
        .eq("school_year", schoolYear);
      if (error) throw error;

      // Learner marks with sex, for the male / female MPS.
      const resultMarks = await fetchResultMarks(
        (data ?? []).filter((r) => r.mps != null).map((r) => String(r.id))
      );

      const groups = new Map<string, Agg>();
      (data ?? []).forEach((r) => {
        if (r.mps == null) return;
        const examRaw = Array.isArray(r.exam) ? r.exam[0] : r.exam;
        const tosRaw = examRaw
          ? Array.isArray(examRaw.tos)
            ? examRaw.tos[0]
            : examRaw.tos
          : null;
        if (!tosRaw) return;
        const sectionRaw = Array.isArray(r.section) ? r.section[0] : r.section;
        const subjectName = tosRaw.subject_name as string;
        const quarter = tosRaw.grading_period as number;
        const gradeLevel = (sectionRaw?.grade_level ??
          tosRaw.grade_level) as number;
        const key = `${subjectName}__${r.section_id}__${quarter}`;
        let g = groups.get(key);
        if (!g) {
          g = {
            key,
            subjectName,
            sectionName: sectionRaw?.name ?? "Unknown section",
            gradeLevel,
            quarter,
            values: [],
            male: [],
            female: [],
          };
          groups.set(key, g);
        }
        g.values.push(Number(r.mps));
        const split = mpsBySex(
          (resultMarks.get(String(r.id)) ?? []).map((m) => ({
            sex: m.sex,
            score: m.correctItems.size,
          })),
          Number(r.total_items)
        );
        if (split.male != null) g.male.push(split.male);
        if (split.female != null) g.female.push(split.female);
      });

      setRows(
        Array.from(groups.values())
          .map((g) => ({
            key: g.key,
            subject: g.subjectName,
            section: g.sectionName,
            gradeLevel: g.gradeLevel,
            quarter: g.quarter,
            mps: g.values.reduce((a, v) => a + v, 0) / g.values.length,
            mpsMale: avg(g.male),
            mpsFemale: avg(g.female),
          }))
          .sort((a, b) => {
            const s = a.subject.localeCompare(b.subject);
            if (s !== 0) return s;
            const sec = a.section.localeCompare(b.section);
            if (sec !== 0) return sec;
            return a.quarter - b.quarter;
          })
      );
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId, schoolYear]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const overall = useMemo(
    () => ({
      mps: avg(rows.map((r) => r.mps)),
      male: avg(rows.map((r) => r.mpsMale)),
      female: avg(rows.map((r) => r.mpsFemale)),
    }),
    [rows]
  );

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          My MPS
        </h1>
        <div className="app__title_actions">
          <Link href="/teacher/examinations/item-analysis">
            <Button size="sm">
              <ClipboardList className="mr-1.5 h-4 w-4" />
              Record exam results
            </Button>
          </Link>
        </div>
      </div>
      <div className="app__content">
        <Card>
          <CardHeader>
            <CardTitle>Mean Percentage Score</CardTitle>
            <CardDescription>
              Your MPS is computed automatically from the exam results you record
              in{" "}
              <Link
                href="/teacher/examinations/item-analysis"
                className="font-medium text-primary hover:underline"
              >
                Item Analysis
              </Link>
              . There is no manual entry.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-48">
                <Select value={schoolYear} onValueChange={setSchoolYear}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getSchoolYearOptions().map((sy) => (
                      <SelectItem key={sy} value={sy}>
                        {sy}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {overall.mps != null && (
                <span className="text-sm text-muted-foreground">
                  Overall average MPS:{" "}
                  <span className="font-semibold text-foreground">
                    {overall.mps.toFixed(2)}%
                  </span>
                  {" · "}Male:{" "}
                  <span className="font-semibold text-foreground">
                    {overall.male != null ? `${overall.male.toFixed(2)}%` : "—"}
                  </span>
                  {" · "}Female:{" "}
                  <span className="font-semibold text-foreground">
                    {overall.female != null
                      ? `${overall.female.toFixed(2)}%`
                      : "—"}
                  </span>
                </span>
              )}
            </div>

            <MpsQuarterTable
              rows={rows}
              schoolYear={schoolYear}
              showSexSplit
              emptyText={
                loading
                  ? "Loading..."
                  : "No exam results yet. Record results in Item Analysis to see your MPS."
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
