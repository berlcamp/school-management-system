"use client";

import { TableSkeleton } from "@/components/TableSkeleton";
import { Button } from "@/components/ui/button";

import { PER_PAGE } from "@/lib/constants";
import { escapeIlikePattern, normalizeLrn } from "@/lib/utils";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { addList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { GraduationCap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Student } from "@/types";
import { Filter } from "./Filter";
import { List } from "./List";

/**
 * A student-registry read is capped at this many ids per request. PostgREST
 * takes `in(...)` in the URL, and a school with a few thousand learners blows
 * past the gateway's URL limit — the request fails outright and the page shows
 * "No students found".
 */
const ID_CHUNK_SIZE = 300;

/** The slice of the Supabase query builder the shared text filters need. */
type TextFilterable<T> = {
  or: (filters: string) => T;
  ilike: (column: string, pattern: string) => T;
};

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

      // Special case: "not_enrolled" finds students with no enrollment for the current school year
      const isNotEnrolledFilter = filter.enrollment_status === "not_enrolled";

      const applyTextFilters = <T extends TextFilterable<T>>(query: T): T => {
        let q = query;

        if (filter.keyword) {
          const escaped = escapeIlikePattern(filter.keyword);
          q = q.or(
            `first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%,middle_name.ilike.%${escaped}%`,
          );
        }

        if (filter.lrn) {
          // A pasted LRN often carries the display dashes (see formatLrn) or a
          // stray label; match on digits only. If nothing but digits was stripped
          // away — i.e. the user typed letters — fall through to the raw term so
          // the search returns nothing rather than every student.
          const digits = normalizeLrn(filter.lrn);
          const term = digits || filter.lrn;
          q = q.ilike("lrn", `%${escapeIlikePattern(term)}%`);
        }

        return q;
      };

      const finish = (rows: unknown[], count: number) => {
        if (!isMounted) return;
        dispatch(addList(rows));
        setTotalCount(count);
        setLoading(false);
      };

      if (isNotEnrolledFilter) {
        // "Not enrolled" is an anti-join — a student with no enrollment row for
        // the current school year — which PostgREST cannot express as a filter
        // on an embedded resource, so the ids are resolved here. They are then
        // read back in chunks: a single `in(...)` carrying a few thousand ids
        // overflows the request URL and the page comes back empty.
        const currentYear = getCurrentSchoolYear();
        let notEnrolledIds: string[] = [];

        if (user?.school_id != null) {
          // Students enrolled at this school for the current school year
          const { data: currentYearData } = await supabase
            .from("sms_enrollments")
            .select("student_id")
            .eq("school_id", user.school_id)
            .eq("school_year", currentYear);
          const currentYearIds = new Set(
            (currentYearData || []).map((e) => String(e.student_id)),
          );

          // Universe = students ever enrolled at this school UNION students whose
          // sms_students.school_id points here (covers records created without an
          // enrollment row yet). Then exclude anyone enrolled this school year.
          const { data: everEnrolledData } = await supabase
            .from("sms_enrollments")
            .select("student_id")
            .eq("school_id", user.school_id);
          const { data: rosterData } = await supabase
            .from("sms_students")
            .select("id")
            .eq("school_id", user.school_id);
          const universe = new Set<string>([
            ...(everEnrolledData || []).map((e) => String(e.student_id)),
            ...(rosterData || []).map((s) => String(s.id)),
          ]);
          notEnrolledIds = [...universe].filter((id) => !currentYearIds.has(id));
        } else {
          // Division admin: find students with no enrollment for the current school year
          const { data: currentYearAllData } = await supabase
            .from("sms_enrollments")
            .select("student_id")
            .eq("school_year", currentYear);
          const currentYearAllIds = new Set(
            (currentYearAllData || []).map((e) => String(e.student_id)),
          );
          const { data: everEnrolledAllData } = await supabase
            .from("sms_enrollments")
            .select("student_id");
          notEnrolledIds = [
            ...new Set(
              (everEnrolledAllData || []).map((e) => String(e.student_id)),
            ),
          ].filter((id) => !currentYearAllIds.has(id));
        }

        if (notEnrolledIds.length === 0) {
          finish([], 0);
          return;
        }

        const rows: Student[] = [];
        for (let i = 0; i < notEnrolledIds.length; i += ID_CHUNK_SIZE) {
          const { data, error } = await applyTextFilters(
            supabase
              .from("sms_students")
              .select("*")
              .in("id", notEnrolledIds.slice(i, i + ID_CHUNK_SIZE)),
          );

          if (!isMounted) return;

          if (error) {
            console.error(error);
            finish([], 0);
            return;
          }

          rows.push(...((data || []) as Student[]));
        }

        rows.sort(
          (a, b) =>
            a.last_name.localeCompare(b.last_name) ||
            a.first_name.localeCompare(b.first_name),
        );

        finish(
          rows.slice((page - 1) * PER_PAGE, page * PER_PAGE),
          rows.length,
        );
        return;
      }

      // Every other filter restricts on the enrollment row itself, which an
      // inner join says directly. Resolving the ids first and handing them back
      // as `in(...)` broke on any school with a few thousand enrollments — the
      // request URL overflowed and the whole registry read as empty. For
      // school-scoped users the join is also what keeps transferred-out and
      // graduated learners visible in the registry.
      const needsEnrollment =
        user?.school_id != null ||
        !!filter.section_id ||
        !!filter.enrollment_status;

      let response;

      if (needsEnrollment) {
        let query = applyTextFilters(
          supabase
            .from("sms_students")
            .select(
              "*, enrollment:sms_enrollments!sms_enrollments_student_id_fkey!inner(school_id, section_id, enrollment_status)",
              { count: "exact" },
            ),
        );

        if (user?.school_id != null) {
          query = query.eq("enrollment.school_id", user.school_id);
        }

        if (filter.section_id) {
          query = query.eq("enrollment.section_id", filter.section_id);
        }

        if (filter.enrollment_status) {
          query = query.eq(
            "enrollment.enrollment_status",
            filter.enrollment_status,
          );
        }

        response = await query
          .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true });
      } else {
        response = await applyTextFilters(
          supabase.from("sms_students").select("*", { count: "exact" }),
        )
          .range((page - 1) * PER_PAGE, page * PER_PAGE - 1)
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true });
      }

      const { data, count, error } = response;

      if (!isMounted) return;

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      // The embedded enrollment is only there to drive the join; drop it so the
      // list holds plain student rows.
      const rows = ((data || []) as Record<string, unknown>[]).map((row) => {
        const student = { ...row };
        delete student.enrollment;
        return student;
      });

      finish(rows, count || 0);
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
