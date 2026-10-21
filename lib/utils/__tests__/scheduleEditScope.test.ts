import { describe, expect, it } from "vitest";
import {
  pickGradeLevelCoordinatorScheduleUpdate,
  pickGradeLevelCoordinatorSectionUpdate,
  scheduleEditMode,
} from "../scheduleEditScope";

describe("scheduleEditMode", () => {
  it("leaves everyone who is not designee-only on full edit", () => {
    expect(
      scheduleEditMode({
        designeeOnly: false,
        headsSubject: false,
        coversGrade: false,
      }),
    ).toBe("full");
  });

  it("gives a Department Head full edit of a subject they head", () => {
    expect(
      scheduleEditMode({
        designeeOnly: true,
        headsSubject: true,
        coversGrade: false,
      }),
    ).toBe("full");
  });

  it("lets the Department Head rules win over the GLC rules", () => {
    expect(
      scheduleEditMode({
        designeeOnly: true,
        headsSubject: true,
        coversGrade: true,
      }),
    ).toBe("full");
  });

  it("gives a GLC teacher-only edit on a covered grade level", () => {
    expect(
      scheduleEditMode({
        designeeOnly: true,
        headsSubject: false,
        coversGrade: true,
      }),
    ).toBe("teacher_only");
  });

  it("makes anything else read-only", () => {
    expect(
      scheduleEditMode({
        designeeOnly: true,
        headsSubject: false,
        coversGrade: false,
      }),
    ).toBe("none");
  });
});

describe("pickGradeLevelCoordinatorScheduleUpdate", () => {
  it("keeps only teacher_id and conflict_override", () => {
    expect(
      pickGradeLevelCoordinatorScheduleUpdate({
        subject_id: 1,
        section_id: 2,
        teacher_id: 3,
        room_id: 4,
        days_of_week: [1, 3],
        start_time: "08:00:00",
        end_time: "09:00:00",
        school_year: "2026-2027",
        conflict_override: true,
        school_id: 9,
      }),
    ).toEqual({ teacher_id: 3, conflict_override: true });
  });

  it("keeps a null teacher (Temporary)", () => {
    expect(
      pickGradeLevelCoordinatorScheduleUpdate({
        teacher_id: null,
        conflict_override: false,
        room_id: 4,
      }),
    ).toEqual({ teacher_id: null, conflict_override: false });
  });
});

describe("pickGradeLevelCoordinatorSectionUpdate", () => {
  it("keeps only section_adviser_id", () => {
    expect(
      pickGradeLevelCoordinatorSectionUpdate({
        name: "Rizal",
        grade_level: 5,
        section_adviser_id: "12",
        room_id: null,
        school_id: 9,
      }),
    ).toEqual({ section_adviser_id: "12" });
  });
});
