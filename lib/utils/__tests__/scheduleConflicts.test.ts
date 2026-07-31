import { describe, expect, it } from "vitest";
import { SubjectSchedule } from "@/types";
import { checkScheduleConflicts } from "../scheduleConflicts";

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
});
