"use client";

import { TablePagination } from "@/components/TablePagination";
import { SuperAdminOnlyGuard } from "@/components/SuperAdminOnlyGuard";
import { TableSkeleton } from "@/components/TableSkeleton";
import { Button } from "@/components/ui/button";
import { PER_PAGE } from "@/lib/constants";
import { escapeIlikePattern } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { Building2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AddModal } from "./AddModal";
import { Filter } from "./Filter";
import { List } from "./List";

export default function Page() {
  return (
    <SuperAdminOnlyGuard>
      <SchoolsPage />
    </SuperAdminOnlyGuard>
  );
}

function SchoolsPage() {
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [modalAddOpen, setModalAddOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState({
    keyword: "",
    school_type: undefined as string | undefined,
    status: undefined as string | undefined,
  });

  const dispatch = useAppDispatch();
  const list = useAppSelector((state) => state.list.value);
  const user = useAppSelector((state) => state.user.user);
  const canManageSchools = user?.type === "super admin";
  const filterKeywordRef = useRef(filter.keyword);

  const handleFilterChange = useCallback(
    (newFilter: { keyword: string; school_type?: string; status?: string }) => {
      setFilter({
        keyword: newFilter.keyword,
        school_type: newFilter.school_type ?? undefined,
        status: newFilter.status ?? undefined,
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
      let query = supabase.from("sms_schools").select("*", { count: "exact" });

      if (filter.keyword) {
        const escaped = escapeIlikePattern(filter.keyword);
        query = query.or(
          `name.ilike.%${escaped}%,school_id.ilike.%${escaped}%,address.ilike.%${escaped}%`,
        );
      }

      if (filter.school_type) {
        query = query.eq("school_type", filter.school_type);
      }

      if (filter.status) {
        query = query.eq("is_active", filter.status === "active");
      }

      const { data, count, error } = await query
        .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)
        .order("name", { ascending: true });

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
        <h1 className="app__title_text flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Schools
        </h1>
        <div className="app__title_actions">
          <Filter filter={filter} setFilter={handleFilterChange} />
          {canManageSchools && (
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
              Add School
            </Button>
          )}
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
            <p className="app__empty_state_title">No schools found</p>
            <p className="app__empty_state_description">
              {filter.keyword || filter.school_type || filter.status
                ? "Try adjusting your search criteria"
                : "Get started by adding a new school"}
            </p>
          </div>
        ) : (
          <List />
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
        {canManageSchools && (
          <AddModal
            isOpen={modalAddOpen}
            onClose={() => setModalAddOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
