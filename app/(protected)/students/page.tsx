"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { Button } from "@/components/ui/button";

import { PER_PAGE } from "@/lib/constants";
import { escapeIlikePattern } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { GraduationCap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Filter } from "./Filter";
import { List } from "./List";

export default function Page() {
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState({
    keyword: "",
    lrn: "",
    section_id: undefined as string | undefined,
    enrollment_status: undefined as string | undefined,
  });

  const dispatch = useAppDispatch();
  const list = useAppSelector((state) => state.list.value);
  const user = useAppSelector((state) => state.user.user);

  const filterKeywordRef = useRef(filter.keyword);

  const handleFilterChange = useCallback(
    (newFilter: {
      keyword: string;
      lrn: string;
      section_id?: string;
      enrollment_status?: string;
    }) => {
      setFilter({
        keyword: newFilter.keyword,
        lrn: newFilter.lrn,
        section_id: newFilter.section_id ?? undefined,
        enrollment_status: newFilter.enrollment_status ?? undefined,
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

      // Special case: "not_enrolled" finds students with NO enrollment records
      const isNotEnrolledFilter = filter.enrollment_status === "not_enrolled";

      // For school-scoped users, resolve student IDs via enrollment history so
      // that transferred-out and graduated students remain visible in the registry.
      let studentIds: string[] | null = null;
      if (user?.school_id != null) {
        if (isNotEnrolledFilter) {
          // Get all student IDs that DO have enrollments at this school
          const { data: enrolledData } = await supabase
            .from("sms_enrollments")
            .select("student_id")
            .eq("school_id", user.school_id);
          const enrolledIds = new Set(
            (enrolledData || []).map((e) => String(e.student_id)),
          );

          // Get all students belonging to this school
          const { data: allStudents } = await supabase
            .from("sms_students")
            .select("id")
            .eq("school_id", user.school_id);

          // Filter to only those without any enrollment
          studentIds = (allStudents || [])
            .map((s) => String(s.id))
            .filter((id) => !enrolledIds.has(id));
        } else {
          let enrollQuery = supabase
            .from("sms_enrollments")
            .select("student_id")
            .eq("school_id", user.school_id);

          if (filter.section_id) {
            enrollQuery = enrollQuery.eq("section_id", filter.section_id);
          }

          if (filter.enrollment_status) {
            enrollQuery = enrollQuery.eq("enrollment_status", filter.enrollment_status);
          }

          const { data: enrollData } = await enrollQuery;
          studentIds = [
            ...new Set((enrollData || []).map((e) => String(e.student_id))),
          ];
        }
      }

      if (studentIds !== null && studentIds.length === 0) {
        if (isMounted) {
          dispatch(addList([]));
          setTotalCount(0);
          setLoading(false);
        }
        return;
      }

      let query = supabase.from("sms_students").select("*", { count: "exact" });

      if (studentIds !== null) {
        query = query.in("id", studentIds);
      } else if (isNotEnrolledFilter) {
        // Division admin: find students with no enrollments
        const { data: allEnrolled } = await supabase
          .from("sms_enrollments")
          .select("student_id");
        const enrolledIds = new Set(
          (allEnrolled || []).map((e) => String(e.student_id)),
        );
        const { data: allStudents } = await supabase
          .from("sms_students")
          .select("id");
        const notEnrolledIds = (allStudents || [])
          .map((s) => String(s.id))
          .filter((id) => !enrolledIds.has(id));
        if (notEnrolledIds.length === 0) {
          if (isMounted) {
            dispatch(addList([]));
            setTotalCount(0);
            setLoading(false);
          }
          return;
        }
        query = query.in("id", notEnrolledIds);
      } else {
        // Division admin: no school scope; apply section/status filter via enrollments
        if (filter.section_id || filter.enrollment_status) {
          let divEnrollQuery = supabase
            .from("sms_enrollments")
            .select("student_id");
          if (filter.section_id) {
            divEnrollQuery = divEnrollQuery.eq("section_id", filter.section_id);
          }
          if (filter.enrollment_status) {
            divEnrollQuery = divEnrollQuery.eq("enrollment_status", filter.enrollment_status);
          }
          const { data: divEnrollData } = await divEnrollQuery;
          const divStudentIds = [
            ...new Set((divEnrollData || []).map((e) => String(e.student_id))),
          ];
          if (divStudentIds.length === 0) {
            if (isMounted) {
              dispatch(addList([]));
              setTotalCount(0);
              setLoading(false);
            }
            return;
          }
          query = query.in("id", divStudentIds);
        }
      }

      if (filter.keyword) {
        const escaped = escapeIlikePattern(filter.keyword);
        query = query.or(
          `first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%,middle_name.ilike.%${escaped}%`,
        );
      }

      if (filter.lrn) {
        query = query.ilike("lrn", `%${escapeIlikePattern(filter.lrn)}%`);
      }

      const { data, count, error } = await query
        .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true });

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
          <GraduationCap className="h-5 w-5" />
          Students
        </h1>
        <div className="app__title_actions">
          <Filter filter={filter} setFilter={handleFilterChange} />
        </div>
      </div>
      <div className="app__content">
        {loading ? (
          <TableSkeleton />
        ) : list.length === 0 ? (
          <div className="app__empty_state">
            <div className="app__empty_state_icon">
              <GraduationCap className="w-12 h-12 mx-auto text-muted-foreground" />
            </div>
            <p className="app__empty_state_title">No students found</p>
            <p className="app__empty_state_description">
              {filter.keyword ||
              filter.lrn ||
              filter.section_id ||
              filter.enrollment_status
                ? "Try adjusting your search criteria"
                : "Students are added through the Enrollment module"}
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
      </div>
    </div>
  );
}
