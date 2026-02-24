"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { Button } from "@/components/ui/button";
import { PER_PAGE } from "@/lib/constants";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { BookOpen, Plus } from "lucide-react";
import Link from "next/link";
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

  const filterKeywordRef = useRef(filter.keyword);

  const handleFilterChange = useCallback(
    (newFilter: { keyword: string; grade_level?: number }) => {
      setFilter({
        keyword: newFilter.keyword,
        grade_level: newFilter.grade_level ?? undefined,
      });
      if (filterKeywordRef.current !== newFilter.keyword) {
        filterKeywordRef.current = newFilter.keyword;
        setPage(1);
      }
    },
    [],
  );

  useEffect(() => {
    let isMounted = true;
    dispatch(addList([]));

    const fetchData = async () => {
      setLoading(true);
      let query = supabase.from("sms_books").select("*", { count: "exact" });

      if (user?.school_id != null) {
        query = query.eq("school_id", user.school_id);
      }

      if (filter.keyword) {
        query = query.or(
          `title.ilike.%${filter.keyword}%,subject_area.ilike.%${filter.keyword}%`,
        );
      }

      if (filter.grade_level) {
        query = query.eq("grade_level", filter.grade_level);
      }

      const { data, count, error } = await query
        .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)
        .order("grade_level", { ascending: true })
        .order("title", { ascending: true });

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
  }, [page, filter, dispatch, user?.school_id]);

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Books
        </h1>
        <div className="app__title_actions">
          <Filter filter={filter} setFilter={handleFilterChange} />
          <Button
            variant="green"
            onClick={() => setModalAddOpen(true)}
            size="sm"
            className="mr-2"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Book
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/books/issuances">
              <BookOpen className="w-4 h-4 mr-1.5" />
              Issue/Return
            </Link>
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
            <p className="app__empty_state_title">No books found</p>
            <p className="app__empty_state_description">
              {filter.keyword || filter.grade_level
                ? "Try adjusting your search criteria"
                : "Get started by adding book titles for your school"}
            </p>
          </div>
        ) : (
          <List />
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
