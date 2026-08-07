import { describe, expect, it } from "vitest";
import { SubjectSchedule } from "@/types";
import {
  blocksOverlap,
  checkScheduleConflicts,
  formatDays,
  parseDbConflictError,
} from "../scheduleConflicts";

const SY = "2026-2027";

/** Mon/Wed 08:00-09:00, room 10, teacher 1, section 100 unless overridden. */
function existing(overrides: Partial<SubjectSchedule> = {}): SubjectSchedule {
  return {
    id: "1",
    subject_id: "500",
    section_id: "100",
    teacher_id: "1",
    room_id: "10",
    days_of_week: [1, 3],
    start_time: "08:00:00",
    end_time: "09:00:00",
    school_year: SY,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

/** Overlaps the default `existing()` row on day and time. */
function candidate(overrides: Record<string, unknown> = {}) {
  return {
    room_id: "10",
    teacher_id: "1" as string | null,
    section_id: "100",
    days_of_week: [1],
    start_time: "08:30",
    end_time: "09:30",
    school_year: SY,
    ...overrides,
  };
}

const typesOf = (conflicts: { type: string }[]) =>
  conflicts.map((c) => c.type).sort();

describe("checkScheduleConflicts", () => {
  it("reports room, teacher and section clashes when both sides have a teacher", () => {
    const conflicts = checkScheduleConflicts(candidate(), [existing()]);
    expect(typesOf(conflicts)).toEqual(["room", "section", "teacher"]);
  });

  it("ignores schedules that do not overlap in day or time", () => {
    expect(
      checkScheduleConflicts(candidate({ days_of_week: [5] }), [existing()]),
    ).toEqual([]);
    expect(
      checkScheduleConflicts(
        candidate({ start_time: "09:00", end_time: "10:00" }),
        [existing()],
      ),
    ).toEqual([]);
  });

  it("ignores schedules in a different school year", () => {
    expect(
      checkScheduleConflicts(candidate({ school_year: "2027-2028" }), [
        existing(),
      ]),
    ).toEqual([]);
  });

  describe("Temporary schedules (no teacher)", () => {
    it("still reports a room clash when the new schedule has no teacher", () => {
      const conflicts = checkScheduleConflicts(
        candidate({ teacher_id: null }),
        [existing()],
      );
      expect(typesOf(conflicts)).toEqual(["room"]);
    });

    it("still reports a room clash when the EXISTING schedule has no teacher", () => {
      const conflicts = checkScheduleConflicts(candidate(), [
        existing({ teacher_id: null }),
      ]);
      expect(typesOf(conflicts)).toEqual(["room"]);
    });

    it("reports a room clash when neither side has a teacher", () => {
      const conflicts = checkScheduleConflicts(
        candidate({ teacher_id: null }),
        [existing({ teacher_id: null })],
      );
      expect(typesOf(conflicts)).toEqual(["room"]);
    });

    it("does not report a section clash when the new schedule has no teacher", () => {
      const conflicts = checkScheduleConflicts(
        candidate({ teacher_id: null, room_id: "99" }),
        [existing()],
      );
      expect(conflicts).toEqual([]);
    });

    it("does not report a section clash against an existing Temporary schedule", () => {
      const conflicts = checkScheduleConflicts(candidate({ room_id: "99" }), [
        existing({ teacher_id: null }),
      ]);
      expect(conflicts).toEqual([]);
    });

    it("clears the way for a different room", () => {
      const conflicts = checkScheduleConflicts(
        candidate({ teacher_id: null, room_id: "99" }),
        [existing({ teacher_id: null })],
      );
      expect(conflicts).toEqual([]);
    });
  });

  it("excludes the schedule being edited", () => {
    const conflicts = checkScheduleConflicts(candidate(), [existing()], "1");
    expect(conflicts).toEqual([]);
  });

  describe("multi-block schedules", () => {
    // A schedule is built from several time blocks and saved one row per
    // block, so each block is checked against existing rows on its own.
    it("reports a clash for the block that overlaps and not for the one that does not", () => {
      const monWed = checkScheduleConflicts(
        candidate({ days_of_week: [1, 3], start_time: "08:00", end_time: "09:00" }),
        [existing()],
      );
      const friAfternoon = checkScheduleConflicts(
        candidate({ days_of_week: [5], start_time: "14:00", end_time: "15:00" }),
        [existing()],
      );

      expect(typesOf(monWed)).toEqual(["room", "section", "teacher"]);
      expect(friAfternoon).toEqual([]);
    });

    it("catches a room clash that only the second block causes", () => {
      // Mon/Wed morning is free; the Friday block lands on someone else's slot
      const fridayRow = existing({ id: "2", days_of_week: [5], start_time: "14:00:00", end_time: "15:00:00" });

      expect(
        checkScheduleConflicts(
          candidate({ days_of_week: [1, 3], start_time: "10:00", end_time: "11:00" }),
          [fridayRow],
        ),
      ).toEqual([]);
      expect(
        typesOf(
          checkScheduleConflicts(
            candidate({ days_of_week: [5], start_time: "14:30", end_time: "15:30" }),
            [fridayRow],
          ),
        ),
      ).toEqual(["room", "section", "teacher"]);
    });
  });
});

describe("blocksOverlap", () => {
  const block = (
    days: number[],
    start_time: string,
    end_time: string,
  ) => ({ days_of_week: days, start_time, end_time });

  it("is false for the same hours on different days", () => {
    // Mon/Wed 8-9 alongside Fri 8-9 is the ordinary case, not a clash
    expect(
      blocksOverlap(block([1, 3], "08:00", "09:00"), block([5], "08:00", "09:00")),
    ).toBe(false);
  });

  it("is false for the same day at different hours", () => {
    // A subject may legitimately meet twice on one day
    expect(
      blocksOverlap(block([1], "08:00", "09:00"), block([1], "14:00", "15:00")),
    ).toBe(false);
  });

  it("is false when blocks merely touch", () => {
    expect(
      blocksOverlap(block([1], "08:00", "09:00"), block([1], "09:00", "10:00")),
    ).toBe(false);
  });

  it("is true when a shared day has overlapping hours", () => {
    expect(
      blocksOverlap(block([1, 3], "08:00", "09:00"), block([3, 5], "08:30", "09:30")),
    ).toBe(true);
  });
});

describe("parseDbConflictError", () => {
  it("splits the trigger's message into one entry per clash", () => {
    expect(
      parseDbConflictError(
        "Schedule conflict detected: Room is already scheduled at this time; Teacher is already scheduled at this time",
      ),
    ).toEqual([
      "Room is already scheduled at this time",
      "Teacher is already scheduled at this time",
    ]);
  });

  it("returns null for an unrelated error that merely mentions the override column", () => {
    // The bug this replaced: a missing-column error reported as a conflict
    expect(
      parseDbConflictError(
        "Could not find the 'conflict_override' column of 'sms_subject_schedules' in the schema cache",
      ),
    ).toBeNull();
  });
});

describe("formatDays", () => {
  it("does not reorder the caller's array", () => {
    // It is called on live form state; sorting in place would mutate it
    const days = [5, 1, 3];
    formatDays(days);
    expect(days).toEqual([5, 1, 3]);
  });
});
