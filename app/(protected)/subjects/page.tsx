"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { Button } from "@/components/ui/button";

import { PER_PAGE } from "@/lib/constants";
import { escapeIlikePattern } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { useDesignations } from "@/hooks/useDesignations";
import { isSubjectRosterRole } from "@/lib/constants/designations";
import { BookOpen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AddModal } from "./AddModal";
import { Filter } from "./Filter";
import { List } from "./List";

export default function Page() {
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [modalAddOpen, setModalAddOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState({
    keyword: "",
    grade_level: undefined as number | undefined,
  });

  const dispatch = useAppDispatch();
  const list = useAppSelector((state) => state.list.value);
  const user = useAppSelector((state) => state.user.user);
  const { loading: designationsLoading, has, subjectIds } = useDesignations();
  // A Department Head without a school-management role sees only the subjects
  // they head (migration 216; RLS enforces the same, this is the courtesy).
  const isDeptHeadOnly =
    has("department_head") && !isSubjectRosterRole(user?.type);
  const headedIds = Array.from(subjectIds).map(Number);
  const headedKey = headedIds.join(",");

  const filterKeywordRef = useRef(filter.keyword);

  // Wrapper function to reset page when filter changes
  const handleFilterChange = useCallback(
    (newFilter: { keyword: string; grade_level?: number }) => {
      setFilter({
        keyword: newFilter.keyword,
        grade_level: newFilter.grade_level ?? undefined,
      });
      // Reset to page 1 when filter keyword changes
      if (filterKeywordRef.current !== newFilter.keyword) {
        filterKeywordRef.current = newFilter.keyword;
        setPage(1);
      }
    },
    [],
  );

  // Fetch data on page load
  useEffect(() => {
    let isMounted = true;
    dispatch(addList([])); // Reset the list first on page load

    // Wait for designations so a Department Head never briefly sees the full list.
    if (designationsLoading) return;

    const fetchData = async () => {
      setLoading(true);
      if (isDeptHeadOnly && headedIds.length === 0) {
        if (!isMounted) return;
        dispatch(addList([]));
        setTotalCount(0);
        setLoading(false);
        return;
      }
      let query = supabase.from("sms_subjects").select("*", { count: "exact" });

      if (user?.school_id != null) {
        query = query.eq("school_id", user.school_id);
      }

      if (isDeptHeadOnly) {
        query = query.in("id", headedIds);
      }

      // Search in code and name fields
      if (filter.keyword) {
        const escaped = escapeIlikePattern(filter.keyword);
        query = query.or(
          `code.ilike.%${escaped}%,name.ilike.%${escaped}%`,
        );
      }

      // Filter by grade level (use != null to include grade_level 0 = Kindergarten)
      if (filter.grade_level != null) {
        query = query.eq("grade_level", filter.grade_level);
      }

      const { data, count, error } = await query
        .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)
        .order("grade_level", { ascending: true })
        .order("code", { ascending: true });

      // Only update state if component is still mounted
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

    // Cleanup function
    return () => {
      isMounted = false;
    };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- headedKey stands for headedIds
  }, [page, filter, dispatch, user?.school_id, designationsLoading, isDeptHeadOnly, headedKey]);

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Subjects
        </h1>
        <div className="app__title_actions">
          <Filter filter={filter} setFilter={handleFilterChange} />
          <Button
            variant="green"
            onClick={() => setModalAddOpen(true)}
            size="sm"
          >
            <svg
              className="w-4 h-4 mr-1.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Subject
          </Button>
        </div>
      </div>
      <div className="app__content">
        {loading ? (
          <TableSkeleton />
        ) : list.length === 0 ? (
          <div className="app__empty_state">
            <div className="app__empty_state_icon">
              <BookOpen className="w-12 h-12 mx-auto text-muted-foreground" />
            </div>
            <p className="app__empty_state_title">No subjects found</p>
            <p className="app__empty_state_description">
              {filter.keyword || filter.grade_level != null
                ? "Try adjusting your search criteria"
                : "Get started by adding a new subject"}
            </p>
          </div>
        ) : (
          <List />
        )}

        {/* Pagination */}
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
              <div className="app__pagination_page_numbers">
                {Array.from(
                  { length: Math.min(5, Math.ceil(totalCount / PER_PAGE)) },
                  (_, i) => {
                    const totalPages = Math.ceil(totalCount / PER_PAGE);
                    let pageNum: number;

                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }

                    return (
                      <Button
                        key={pageNum}
                        size="sm"
                        variant={page === pageNum ? "default" : "outline"}
                        onClick={() => setPage(pageNum)}
                        disabled={loading}
                        className="h-9 w-9 p-0"
                      >
                        {pageNum}
                      </Button>
                    );
                  },
                )}
              </div>
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
          onClose={() => setModalAddOpen(false)}
        />
      </div>
    </div>
  );
}
