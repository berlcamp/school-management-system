"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { Button } from "@/components/ui/button";
import { PER_PAGE } from "@/lib/constants";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { SubjectSchedule } from "@/types";
import { Calendar, List as ListIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarView } from "./CalendarView";
import { Filter } from "./Filter";
import { List } from "./List";

type ViewMode = "table" | "calendar";

export default function Page() {
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [filter, setFilter] = useState({
    keyword: "",
    section_id: undefined as string | undefined,
    teacher_id: undefined as string | undefined,
    room_id: undefined as string | undefined,
    school_year: undefined as string | undefined,
  });

  const dispatch = useAppDispatch();
  const schedules = useAppSelector((state) => state.list.value) || [];

  const filterKeywordRef = useRef(filter.keyword);

  // Wrapper function to reset page when filter changes
  const handleFilterChange = useCallback(
    (newFilter: {
      keyword: string;
      section_id?: string;
      teacher_id?: string;
      room_id?: string;
      school_year?: string;
    }) => {
      setFilter({
        keyword: newFilter.keyword,
        section_id: newFilter.section_id ?? undefined,
        teacher_id: newFilter.teacher_id ?? undefined,
        room_id: newFilter.room_id ?? undefined,
        school_year: newFilter.school_year ?? undefined,
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

    const fetchData = async () => {
      setLoading(true);
      let query = supabase
        .from("sms_subject_schedules")
        .select("*", { count: "exact" });

      // Search - this would need to join with related tables for proper search
      // For now, we'll filter by the selected filters

      // Filter by section
      if (filter.section_id) {
        query = query.eq("section_id", filter.section_id);
      }

      // Filter by teacher
      if (filter.teacher_id) {
        query = query.eq("teacher_id", filter.teacher_id);
      }

      // Filter by room
      if (filter.room_id) {
        query = query.eq("room_id", filter.room_id);
      }

      // Filter by school year
      if (filter.school_year) {
        query = query.eq("school_year", filter.school_year);
      }

      const { data, count, error } = await query
        .range(
          viewMode === "table" ? (page - 1) * PER_PAGE : 0,
          viewMode === "table" ? page * PER_PAGE - 1 : 9999,
        )
        .order("start_time", { ascending: true })
        .order("days_of_week", { ascending: true });

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
  }, [page, filter, dispatch, viewMode]);

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Schedules
        </h1>
        <div className="app__title_actions">
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === "table" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("table")}
              className="h-9"
            >
              <ListIcon className="h-4 w-4 mr-1.5" />
              Table
            </Button>
            <Button
              variant={viewMode === "calendar" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("calendar")}
              className="h-9"
            >
              <Calendar className="h-4 w-4 mr-1.5" />
              Calendar
            </Button>
          </div>
          <Filter filter={filter} setFilter={handleFilterChange} />
        </div>
      </div>
      <div className="app__content">
        {loading ? (
          <TableSkeleton />
        ) : totalCount === 0 ? (
          <div className="app__empty_state">
            <div className="app__empty_state_icon">
              <Calendar className="w-12 h-12 mx-auto text-muted-foreground" />
            </div>
            <p className="app__empty_state_title">No schedules found</p>
            <p className="app__empty_state_description">
              {filter.keyword ||
              filter.section_id ||
              filter.teacher_id ||
              filter.room_id ||
              filter.school_year
                ? "Try adjusting your search criteria"
                : "Get started by adding a new schedule"}
            </p>
          </div>
        ) : viewMode === "table" ? (
          <List />
        ) : (
          <CalendarView
            schedules={schedules as SubjectSchedule[]}
            schoolYear={filter.school_year}
          />
        )}

        {/* Pagination - only show for table view */}
        {viewMode === "table" && totalCount > 0 && totalCount > PER_PAGE && (
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
      </div>
    </div>
  );
}
