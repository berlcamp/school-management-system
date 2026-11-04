"use client";

import { TablePagination } from "@/components/TablePagination";
import { TableSkeleton } from "@/components/TableSkeleton";
import { Button } from "@/components/ui/button";
import { PER_PAGE } from "@/lib/constants";
import { escapeIlikePattern } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { BookMarked, BookOpen, Plus } from "lucide-react";
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
  const [allocationTotals, setAllocationTotals] = useState<Record<string, number>>({});
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
        const escaped = escapeIlikePattern(filter.keyword);
        query = query.or(
          `title.ilike.%${escaped}%,subject_area.ilike.%${escaped}%`,
        );
      }

      // `!= null`, not truthiness: Kindergarten is grade level 0.
      if (filter.grade_level != null) {
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

        // Fetch allocation totals for books in current school year
        if (data && data.length > 0 && user?.school_id != null) {
          const bookIds = data.map((b: { id: string }) => b.id);
          const { data: allocData } = await supabase
            .from("sms_book_allocations")
            .select("book_id, quantity")
            .eq("school_id", user.school_id)
            .eq("school_year", getCurrentSchoolYear())
            .in("book_id", bookIds);

          if (allocData && isMounted) {
            const totals: Record<string, number> = {};
            for (const row of allocData) {
              totals[row.book_id] = (totals[row.book_id] ?? 0) + row.quantity;
            }
            setAllocationTotals(totals);
          }
        } else {
          setAllocationTotals({});
        }
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
            <Link href="/books/allocations">
              <BookMarked className="w-4 h-4 mr-1.5" />
              Allocations
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
              {filter.keyword || filter.grade_level != null
                ? "Try adjusting your search criteria"
                : "Get started by adding book titles for your school"}
            </p>
          </div>
        ) : (
          <List allocationTotals={allocationTotals} />
        )}

        {totalCount > 0 && totalCount > PER_PAGE && (
          <TablePagination
            page={page}
            totalCount={totalCount}
            perPage={PER_PAGE}
            onPageChange={setPage}
            disabled={loading}
          />
        )}
        <AddModal
          isOpen={modalAddOpen}
          onClose={() => setModalAddOpen(false)}
        />
      </div>
    </div>
  );
}
