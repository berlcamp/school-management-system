"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { Button } from "@/components/ui/button";

import { PER_PAGE } from "@/lib/constants";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { Building2 } from "lucide-react";
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
    room_type: undefined as string | undefined,
    building: undefined as string | undefined,
  });

  const dispatch = useAppDispatch();
  const list = useAppSelector((state) => state.list.value);
  const user = useAppSelector((state) => state.user.user);

  const filterKeywordRef = useRef(filter.keyword);

  // Wrapper function to reset page when filter changes
  const handleFilterChange = useCallback(
    (newFilter: { keyword: string; room_type?: string; building?: string }) => {
      setFilter({
        keyword: newFilter.keyword,
        room_type: newFilter.room_type ?? undefined,
        building: newFilter.building ?? undefined,
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
      let query = supabase.from("sms_rooms").select("*", { count: "exact" });

      if (user?.school_id != null) {
        query = query.eq("school_id", user.school_id);
      }

      // Search in name and building fields
      if (filter.keyword) {
        query = query.or(
          `name.ilike.%${filter.keyword}%,building.ilike.%${filter.keyword}%`,
        );
      }

      // Filter by room type
      if (filter.room_type) {
        query = query.eq("room_type", filter.room_type);
      }

      // Filter by building
      if (filter.building) {
        query = query.eq("building", filter.building);
      }

      const { data, count, error } = await query
        .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)
        .order("name", { ascending: true });

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
  }, [page, filter, dispatch, user?.school_id]);

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Rooms
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
            Add Room
          </Button>
        </div>
      </div>
      <div className="app__content">
        {loading ? (
          <TableSkeleton />
        ) : list.length === 0 ? (
          <div className="app__empty_state">
            <div className="app__empty_state_icon">
              <Building2 className="w-12 h-12 mx-auto text-muted-foreground" />
            </div>
            <p className="app__empty_state_title">No rooms found</p>
            <p className="app__empty_state_description">
              {filter.keyword || filter.room_type || filter.building
                ? "Try adjusting your search criteria"
                : "Get started by adding a new room"}
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
