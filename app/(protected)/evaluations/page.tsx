"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PER_PAGE } from "@/lib/constants";
import { escapeIlikePattern } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { ClipboardCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AddModal } from "./components/AddModal";
import { EvaluateTeachersTab } from "./components/EvaluateTeachersTab";
import { Filter } from "./components/Filter";
import { List } from "./components/List";

const PRINCIPAL_ROLES = ["school_head", "assistant_school_head", "super admin"];

export default function Page() {
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [modalAddOpen, setModalAddOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("manage");
  const [filter, setFilter] = useState({
    keyword: "",
    school_year: undefined as string | undefined,
    type: undefined as string | undefined,
  });

  const dispatch = useAppDispatch();
  const list = useAppSelector((state) => state.list.value);
  const user = useAppSelector((state) => state.user.user);

  const filterKeywordRef = useRef(filter.keyword);

  const isPrincipal = PRINCIPAL_ROLES.includes(user?.type ?? "");

  const handleFilterChange = useCallback(
    (newFilter: {
      keyword: string;
      school_year?: string;
      type?: string;
    }) => {
      setFilter({
        keyword: newFilter.keyword,
        school_year: newFilter.school_year,
        type: newFilter.type,
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
      let query = supabase
        .from("sms_evaluations")
        .select("*", { count: "exact" });

      if (user?.school_id != null) {
        query = query.eq("school_id", user.school_id);
      }

      if (filter.keyword) {
        const escaped = escapeIlikePattern(filter.keyword);
        query = query.ilike("title", `%${escaped}%`);
      }

      if (filter.school_year) {
        query = query.eq("school_year", filter.school_year);
      }

      if (filter.type) {
        query = query.eq("type", filter.type);
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
  }, [page, filter, dispatch, user?.school_id]);

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" />
          Evaluations
        </h1>
      </div>

      <div className="app__content">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <TabsList>
              <TabsTrigger value="manage">Manage</TabsTrigger>
              {isPrincipal && (
                <TabsTrigger value="evaluate">Evaluate Teachers</TabsTrigger>
              )}
            </TabsList>
            {activeTab === "manage" && (
              <div className="flex items-center gap-2">
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
                  Add Evaluation
                </Button>
              </div>
            )}
          </div>

          <TabsContent value="manage">
            {loading ? (
              <TableSkeleton />
            ) : list.length === 0 ? (
              <div className="app__empty_state">
                <div className="app__empty_state_icon">
                  <ClipboardCheck className="w-12 h-12 mx-auto text-muted-foreground" />
                </div>
                <p className="app__empty_state_title">No evaluations found</p>
                <p className="app__empty_state_description">
                  {filter.keyword || filter.school_year || filter.type
                    ? "Try adjusting your search criteria"
                    : "Get started by adding a new evaluation"}
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
          </TabsContent>

          {isPrincipal && (
            <TabsContent value="evaluate">
              <EvaluateTeachersTab />
            </TabsContent>
          )}
        </Tabs>

        <AddModal
          isOpen={modalAddOpen}
          onClose={() => setModalAddOpen(false)}
        />
      </div>
    </div>
  );
}
