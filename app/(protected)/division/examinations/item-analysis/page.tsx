"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { ItemAnalysisList } from "@/components/examinations/ItemAnalysisList";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GRADE_LEVELS, PER_PAGE, getGradeLevelLabel } from "@/lib/constants";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { getSchoolYearOptions } from "@/lib/utils/schoolYear";
import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const JOIN =
  "*, exam:exam_id!inner(version_label, title, tos:tos_id!inner(subject_name, grade_level, school_year, exam_type, grading_period, title)), section:section_id(name, grade_level), school:school_id(name)";

export default function Page() {
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [schoolYear, setSchoolYear] = useState("all");
  const [grade, setGrade] = useState("all");

  const dispatch = useAppDispatch();
  const list = useAppSelector((state) => state.list.value);

  useEffect(() => {
    let isMounted = true;
    dispatch(addList([]));

    const fetchData = async () => {
      setLoading(true);
      let query = supabase
        .from("sms_exam_results")
        .select(JOIN, { count: "exact" });

      if (schoolYear !== "all") query = query.eq("school_year", schoolYear);
      if (grade !== "all")
        query = query.eq("exam.tos.grade_level", Number(grade));

      const { data, count, error } = await query
        .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)
        .order("created_at", { ascending: false });

      if (!isMounted) return;
      if (error) console.error(error);
      else {
        dispatch(addList(data || []));
        setTotalCount(count || 0);
      }
      setLoading(false);
    };

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [page, schoolYear, grade, dispatch]);

  return (
    <div>
      <div className="app__title">
        <Link
          href="/division/examinations"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Examinations
        </Link>
        <h1 className="app__title_text flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Item Analysis
        </h1>
        <div className="app__title_actions flex gap-2">
          <Select
            value={schoolYear}
            onValueChange={(v) => {
              setSchoolYear(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-40">
              <SelectValue placeholder="School year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All school years</SelectItem>
              {getSchoolYearOptions().map((sy) => (
                <SelectItem key={sy} value={sy}>
                  {sy}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={grade}
            onValueChange={(v) => {
              setGrade(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-36">
              <SelectValue placeholder="Grade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All grades</SelectItem>
              {GRADE_LEVELS.map((g) => (
                <SelectItem key={g} value={String(g)}>
                  {getGradeLevelLabel(g)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="app__content">
        {loading ? (
          <TableSkeleton />
        ) : list.length === 0 ? (
          <div className="app__empty_state">
            <div className="app__empty_state_icon">
              <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground" />
            </div>
            <p className="app__empty_state_title">No results found</p>
            <p className="app__empty_state_description">
              Exam results recorded by teachers will appear here.
            </p>
          </div>
        ) : (
          <ItemAnalysisList showSchool />
        )}

        {totalCount > 0 && totalCount > PER_PAGE && (
          <div className="app__pagination">
            <div className="app__pagination_info">
              Page <span className="font-medium">{page}</span> of{" "}
              <span className="font-medium">
                {Math.ceil(totalCount / PER_PAGE)}
              </span>
            </div>
            <div className="app__pagination_controls">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage(page - 1)}
                disabled={page === 1 || loading}
                className="h-9 min-w-[80px]"
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage(page + 1)}
                disabled={page * PER_PAGE >= totalCount || loading}
                className="h-9 min-w-[80px]"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
