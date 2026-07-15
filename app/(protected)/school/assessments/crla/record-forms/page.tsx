"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { AddModal } from "@/components/assessments/crla-record-forms/AddModal";
import {
  Filter,
  type RecordFormFilter,
} from "@/components/assessments/crla-record-forms/Filter";
import { List } from "@/components/assessments/crla-record-forms/List";
import { Button } from "@/components/ui/button";
import { PER_PAGE } from "@/lib/constants";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { escapeIlikePattern } from "@/lib/utils";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export default function Page() {
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [modalAddOpen, setModalAddOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<RecordFormFilter>({ keyword: "" });

  const dispatch = useAppDispatch();
  const list = useAppSelector((state) => state.list.value);
  const user = useAppSelector((state) => state.user.user);
  const schoolId = user?.school_id ? Number(user.school_id) : null;
  const filterKeywordRef = useRef(filter.keyword);

  const handleFilterChange = useCallback((newFilter: RecordFormFilter) => {
    setFilter(newFilter);
    if (filterKeywordRef.current !== newFilter.keyword) {
      filterKeywordRef.current = newFilter.keyword;
      setPage(1);
    }
  }, []);

  useEffect(() => {
    if (!schoolId) return;
    let isMounted = true;
    dispatch(addList([]));

    const fetchData = async () => {
      setLoading(true);
      let query = supabase
        .from("sms_crla_record_forms")
        .select("*", { count: "exact" })
        .eq("school_id", schoolId); // this school's own materials only

      if (filter.keyword) {
        const escaped = escapeIlikePattern(filter.keyword);
        query = query.or(`title.ilike.%${escaped}%,story_title.ilike.%${escaped}%`);
      }
      if (filter.grade_level !== undefined) {
        query = query.eq("grade_level", filter.grade_level);
      }
      if (filter.language) {
        query = query.eq("language", filter.language);
      }

      const { data, count, error } = await query
        .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)
        .order("grade_level", { ascending: true })
        .order("language", { ascending: true });

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
  }, [page, filter, dispatch, schoolId]);

  return (
    <div>
      <div className="app__title">
        <Link
          href="/school/assessments/crla"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← CRLA Materials
        </Link>
        <h1 className="app__title_text flex items-center gap-2">
          <FileText className="h-5 w-5" />
          CRLA Record Forms (Part 2)
        </h1>
        <div className="app__title_actions">
          <Filter filter={filter} setFilter={handleFilterChange} />
          <Button variant="green" onClick={() => setModalAddOpen(true)} size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Record Form
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
            <p className="app__empty_state_title">No record forms found</p>
            <p className="app__empty_state_description">
              {filter.keyword || filter.grade_level !== undefined || filter.language
                ? "Try adjusting your search criteria"
                : "Add a Part 2 reading-fluency & comprehension story"}
            </p>
          </div>
        ) : (
          <List schoolId={schoolId} />
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

        <AddModal
          isOpen={modalAddOpen}
          schoolId={schoolId}
          onClose={() => setModalAddOpen(false)}
        />
      </div>
    </div>
  );
}
