"use client";

import { useDesignations } from "@/hooks/useDesignations";
import { isSubjectRosterRole } from "@/lib/constants/designations";
import { useAppSelector } from "@/lib/redux/hook";
import {
  scheduleEditMode,
  type ScheduleEditMode,
} from "@/lib/utils/scheduleEditScope";
import { useCallback } from "react";

/**
 * Schedules / Sections scope for a Department Head or Grade Level Coordinator
 * with no subject-roster role (migration 216, ruling R1). A roster role is
 * never `designeeOnly` and never `pending`, so for them every page behaves
 * exactly as before.
 *
 * `pending` is true only for a non-roster user while their designations load;
 * callers wait (lists) or stay read-only (forms) until it clears, so a slow
 * read never offers more than the database allows.
 */
export function useScheduleScope() {
  const type = useAppSelector((state) => state.user.user?.type);
  const { loading, has, subjectIds, gradeLevels } = useDesignations();
  const roster = isSubjectRosterRole(type);
  const pending = !roster && loading;
  const isDeptHead = !roster && has("department_head");
  const isGlc = !roster && has("grade_level_coordinator");
  const designeeOnly = isDeptHead || isGlc;

  const headsSubject = useCallback(
    (subjectId: string | number | null | undefined) =>
      subjectId != null && subjectIds.has(String(subjectId)),
    [subjectIds],
  );

  const coversGrade = useCallback(
    (gradeLevel: string | number | null | undefined) =>
      gradeLevel != null && gradeLevels.has(Number(gradeLevel)),
    [gradeLevels],
  );

  /** How an existing schedule may be edited. */
  const modeFor = useCallback(
    (
      subjectId: string | number | null | undefined,
      gradeLevel: string | number | null | undefined,
    ): ScheduleEditMode => {
      if (pending) return "none";
      return scheduleEditMode({
        designeeOnly,
        headsSubject: headsSubject(subjectId),
        coversGrade: coversGrade(gradeLevel),
      });
    },
    [pending, designeeOnly, headsSubject, coversGrade],
  );

  /** May a new schedule be added (for this subject, when given)? */
  const canAdd = useCallback(
    (subjectId?: string | number | null) => {
      if (pending) return false;
      if (!designeeOnly) return true;
      if (!isDeptHead) return false;
      return subjectId == null ? subjectIds.size > 0 : headsSubject(subjectId);
    },
    [pending, designeeOnly, isDeptHead, subjectIds, headsSubject],
  );

  return {
    pending,
    designeeOnly,
    isDeptHead,
    isGlc,
    subjectIds,
    gradeLevels,
    headsSubject,
    coversGrade,
    modeFor,
    canAdd,
  };
}
