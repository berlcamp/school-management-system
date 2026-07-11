"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { ExamBuilderModal } from "@/components/examinations/ExamBuilderModal";
import { ExamList } from "@/components/examinations/ExamList";
import {
  TosFilter,
  type TosFilterValue,
} from "@/components/examinations/TosFilter";
import { Button } from "@/components/ui/button";
import { PER_PAGE } from "@/lib/constants";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { escapeIlikePattern } from "@/lib/utils";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const TOS_JOIN =
  "*, tos:tos_id!inner(subject_name, grade_level, exam_type, grading_period, school_year, title)";

export default function Page() {
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [modalAddOpen, setModalAddOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<TosFilterValue>({ keyword: "" });

  const dispatch = useAppDispatch();
  const list = useAppSelector((state) => state.list.value);
  const user = useAppSelector((state) => state.user.user);
  const userId = user?.system_user_id ?? null;
  const schoolId = user?.school_id != null ? Number(user.school_id) : null;
  const filterKeywordRef = useRef(filter.keyword);

  const handleFilterChange = useCallback((newFilter: TosFilterValue) => {
    setFilter(newFilter);
    if (filterKeywordRef.current !== newFilter.keyword) {
      filterKeywordRef.current = newFilter.keyword;
      setPage(1);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    let isMounted = true;
    dispatch(addList([]));

    const fetchData = async () => {
      setLoading(true);
      // Division-authored (shared) + this teacher's own exams.
      let query = supabase
        .from("sms_exams")
        .select(TOS_JOIN, { count: "exact" })
        .or(`school_id.is.null,created_by.eq.${userId}`);

      if (filter.keyword) {
        const escaped = escapeIlikePattern(filter.keyword);
        query = query.or(
          `title.ilike.%${escaped}%,version_label.ilike.%${escaped}%`,
        );
      }
      if (filter.grade_level !== undefined) {
        query = query.eq("tos.grade_level", filter.grade_level);
      }
      if (filter.school_year) {
        query = query.eq("tos.school_year", filter.school_year);
      }

      const { data, count, error } = await query
        .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)
        .order("created_at", { ascending: false });

      if (!isMounted) return;
      if (error) {
        console.error(error);
      } else {
        dispatch(addList(data || []));
        setTotalCount(count || 0);
      }
      setLoading(false);
    };

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [page, filter, dispatch, userId]);

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
          <FileText className="h-5 w-5" />
          Exam Creator
        </h1>
        <div className="app__title_actions">
          <TosFilter filter={filter} setFilter={handleFilterChange} />
          <Button
            variant="green"
            onClick={() => setModalAddOpen(true)}
            size="sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Create Exam
          </Button>
        </div>
      </div>
      <div className="app__content">
        {loading ? (
          <TableSkeleton />
        ) : list.length === 0 ? (
          <div className="app__empty_state">
            <div className="app__empty_state_icon">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground" />
            </div>
            <p className="app__empty_state_title">No exams found</p>
            <p className="app__empty_state_description">
              {filter.keyword ||
              filter.grade_level !== undefined ||
              filter.school_year
                ? "Try adjusting your search criteria"
                : "Create an exam from a TOS, or ones shared by the division will appear here"}
            </p>
          </div>
        ) : (
          <ExamList mode="teacher" userId={userId} schoolId={schoolId} />
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

        <ExamBuilderModal
          isOpen={modalAddOpen}
          onClose={() => setModalAddOpen(false)}
          mode="teacher"
          schoolId={schoolId}
          userId={userId}
        />
      </div>
    </div>
  );
}
