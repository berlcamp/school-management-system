"use client";

/**
 * Which school the `/school-reports/*` module is reporting on.
 *
 * THE MODULE IS ALWAYS ONE SCHOOL — that is what separates it from
 * `/division/reports/*`, which is the division-wide roll-up. The only question
 * is where that one school comes from:
 *
 *   - a school-level user is PINNED to their active school (`sms_users.school_id`,
 *     migration 134) — never a picker, so a school head cannot read another
 *     school's figures, and a `super admin` gets whatever their active-school
 *     override currently points at;
 *   - a division user (`division_admin` / `division_type`) has no school of their
 *     own, so they PICK one, and until they do there is nothing to generate.
 *
 * The pick is deliberately not a URL parameter: every report page already takes
 * its own filters from state, and a link pasted into a chat should not silently
 * carry a school with it. It is remembered in `localStorage` so paging between
 * reports does not re-ask, and it is cleared if the school is later deactivated.
 */

import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Roles that pick a school rather than being pinned to one. `super admin` is
 * deliberately absent: they already carry an active-school override, so a second
 * picker would give them two answers to the same question.
 */
export const DIVISION_SCHOOL_REPORT_ROLES = ["division_admin", "division_type"];

export function isDivisionReportUser(userType: string | undefined | null) {
  return DIVISION_SCHOOL_REPORT_ROLES.includes(userType ?? "");
}

export interface ReportSchoolOption {
  id: string;
  name: string;
}

export interface ReportSchoolState {
  /** The school every report here is generated for. null = none chosen yet. */
  schoolId: string | null;
  /** Name of that school, when it came from the picker. */
  schoolName: string | null;
  /** True when this user chooses the school instead of being pinned to one. */
  isDivisionUser: boolean;
  /** Active schools, for the picker. Empty for a pinned user. */
  schools: ReportSchoolOption[];
  selectSchool: (schoolId: string | null) => void;
  /** True once the session has landed and `schoolId` is answerable. */
  ready: boolean;
}

const STORAGE_KEY = "sms.school-reports.school-id";

const ReportSchoolContext = createContext<ReportSchoolState | null>(null);

export function ReportSchoolProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useAppSelector((state) => state.user.user);
  const userType = user?.type ?? "";
  const isDivisionUser = isDivisionReportUser(userType);

  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [schools, setSchools] = useState<ReportSchoolOption[]>([]);
  // localStorage is read in an effect, never during render — the first paint on
  // the server has no access to it and a mismatch would hydrate wrongly.
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (!isDivisionUser) {
      setRestored(true);
      return;
    }
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setSelectedSchoolId(stored);
    } catch {
      // A browser with site data blocked simply re-asks each visit.
    }
    setRestored(true);
  }, [isDivisionUser]);

  useEffect(() => {
    if (!isDivisionUser) return;
    let isMounted = true;

    const load = async () => {
      const { data, error } = await supabase
        .from("sms_schools")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (!isMounted) return;
      if (error) {
        console.error("Error loading schools for reports:", error);
        return;
      }
      setSchools(
        (data ?? []).map((s) => ({ id: String(s.id), name: s.name as string })),
      );
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [isDivisionUser]);

  const selectSchool = useCallback((schoolId: string | null) => {
    setSelectedSchoolId(schoolId);
    try {
      if (schoolId) window.localStorage.setItem(STORAGE_KEY, schoolId);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Not being able to remember the pick is not a reason to refuse it.
    }
  }, []);

  // A remembered school that has since been deactivated is dropped rather than
  // reported on: the picker would not offer it, so the reports must not use it.
  useEffect(() => {
    if (!isDivisionUser || !selectedSchoolId || schools.length === 0) return;
    if (!schools.some((s) => s.id === selectedSchoolId)) selectSchool(null);
  }, [isDivisionUser, selectedSchoolId, schools, selectSchool]);

  const ownSchoolId = user?.school_id != null ? String(user.school_id) : null;
  const schoolId = isDivisionUser ? selectedSchoolId : ownSchoolId;

  const value = useMemo<ReportSchoolState>(
    () => ({
      schoolId,
      schoolName: isDivisionUser
        ? (schools.find((s) => s.id === schoolId)?.name ?? null)
        : null,
      isDivisionUser,
      schools,
      selectSchool,
      ready: userType !== "" && (!isDivisionUser || restored),
    }),
    [schoolId, isDivisionUser, schools, selectSchool, userType, restored],
  );

  return (
    <ReportSchoolContext.Provider value={value}>
      {children}
    </ReportSchoolContext.Provider>
  );
}

/**
 * The school the current report is for. Outside the provider — the division
 * roll-up route, which has no school to pick — it falls back to the signed-in
 * user's own school, which is exactly what every page did before this existed.
 */
export function useReportSchool(): ReportSchoolState {
  const context = useContext(ReportSchoolContext);
  const user = useAppSelector((state) => state.user.user);
  const userType = user?.type ?? "";
  const ownSchoolId = user?.school_id != null ? String(user.school_id) : null;

  const fallback = useMemo<ReportSchoolState>(
    () => ({
      schoolId: ownSchoolId,
      schoolName: null,
      isDivisionUser: false,
      schools: [],
      selectSchool: () => {},
      ready: userType !== "",
    }),
    [ownSchoolId, userType],
  );

  return context ?? fallback;
}
