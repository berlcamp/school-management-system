"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { TosBuilderModal } from "@/components/examinations/TosBuilderModal";
import { TosFilter, type TosFilterValue } from "@/components/examinations/TosFilter";
import { TosList } from "@/components/examinations/TosList";
import { Button } from "@/components/ui/button";
import { PER_PAGE } from "@/lib/constants";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { escapeIlikePattern } from "@/lib/utils";
import { FileSpreadsheet, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export default function Page() {
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [modalAddOpen, setModalAddOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<TosFilterValue>({ keyword: "" });

  const dispatch = useAppDispatch();
  const list = useAppSelector((state) => state.list.value);
  const user = useAppSelector((state) => state.user.user);
  const filterKeywordRef = useRef(filter.keyword);

  const handleFilterChange = useCallback((newFilter: TosFilterValue) => {
    setFilter(newFilter);
    if (filterKeywordRef.current !== newFilter.keyword) {
      filterKeywordRef.current = newFilter.keyword;
      setPage(1);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    dispatch(addList([]));

    const fetchData = async () => {
      setLoading(true);
      let query = supabase
        .from("sms_tos")
        .select("*", { count: "exact" })
        .is("school_id", null); // division-authored only

      if (filter.keyword) {
        const escaped = escapeIlikePattern(filter.keyword);
        query = query.or(
          `title.ilike.%${escaped}%,subject_name.ilike.%${escaped}%`,
        );
      }
      if (filter.grade_level !== undefined) {
        query = query.eq("grade_level", filter.grade_level);
      }
      if (filter.school_year) {
        query = query.eq("school_year", filter.school_year);
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
  }, [page, filter, dispatch]);

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
          <FileSpreadsheet className="h-5 w-5" />
          Table of Specification
        </h1>
        <div className="app__title_actions">
          <TosFilter filter={filter} setFilter={handleFilterChange} />
          <Button
            variant="green"
            onClick={() => setModalAddOpen(true)}
            size="sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Create TOS
          </Button>
        </div>
      </div>
      <div className="app__content">
        {loading ? (
          <TableSkeleton />
        ) : list.length === 0 ? (
          <div className="app__empty_state">
            <div className="app__empty_state_icon">
              <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground" />
            </div>
            <p className="app__empty_state_title">No TOS found</p>
            <p className="app__empty_state_description">
              {filter.keyword ||
              filter.grade_level !== undefined ||
              filter.school_year
                ? "Try adjusting your search criteria"
                : "Get started by creating a Table of Specification"}
            </p>
          </div>
        ) : (
          <TosList mode="division" userId={user?.system_user_id ?? null} schoolId={null} />
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

        <TosBuilderModal
          isOpen={modalAddOpen}
          onClose={() => setModalAddOpen(false)}
          mode="division"
          schoolId={null}
          userId={user?.system_user_id ?? null}
        />
      </div>
    </div>
  );
}
