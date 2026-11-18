import { describe, expect, it } from "vitest";

import {
  canChangeSection,
  gradedSubjectsByPeriod,
  oldOnlySubjectsWarning,
  sectionChangeReason,
  subjectsOnlyIn,
} from "@/lib/utils/sectionChange";

describe("sectionChangeReason", () => {
  it("names the section the learner left, ahead of the typed reason", () => {
    expect(sectionChangeReason("7-Rizal", "  parent request  ")).toBe(
      "Section change from 7-Rizal: parent request",
    );
  });

  it("is null while no reason is typed — the reason is required", () => {
    expect(sectionChangeReason("7-Rizal", "   ")).toBeNull();
  });
});

describe("gradedSubjectsByPeriod", () => {
  it("counts subjects carrying an encoded grade, per period, ignoring 0s", () => {
    expect(
      gradedSubjectsByPeriod([
        { subject_id: 1, grading_period: 1, grade: 80 },
        { subject_id: 2, grading_period: 1, grade: 85 },
        { subject_id: 1, grading_period: 2, grade: 0 },
        { subject_id: 3, grading_period: 2, grade: 79 },
      ]),
    ).toEqual([
      { period: 1, subjects: 2 },
      { period: 2, subjects: 1 },
    ]);
  });

  it("is empty when nothing is encoded", () => {
    expect(gradedSubjectsByPeriod([])).toEqual([]);
  });
});

describe("subjectsOnlyIn", () => {
  it("lists subjects scheduled in the old section and not the new one", () => {
    expect(subjectsOnlyIn(["1", "2", "3"], ["1", "3", "4"])).toEqual(["2"]);
  });

  it("is empty when both sections share every subject", () => {
    expect(subjectsOnlyIn(["1", "2"], ["2", "1"])).toEqual([]);
  });
});

describe("canChangeSection", () => {
  it("is offered for an approved, active enrollment", () => {
    expect(canChangeSection({ status: "approved", enrollment_status: "active" })).toBe(true);
  });

  it("is not offered for a finished or pending one", () => {
    expect(canChangeSection({ status: "approved", enrollment_status: "promoted" })).toBe(false);
    expect(canChangeSection({ status: "pending", enrollment_status: "active" })).toBe(false);
  });
});

describe("oldOnlySubjectsWarning", () => {
  it("says the final grade and general average will be incomplete", () => {
    expect(oldOnlySubjectsWarning(["Math 7 – Rizal", "Science 7 – Rizal"])).toBe(
      "Not scheduled in the new section: Math 7 – Rizal, Science 7 – Rizal. " +
        "Their earlier grades print on a line of their own, so their final grade " +
        "and the learner's general average will be incomplete. Use the same " +
        "subjects in both sections to avoid this.",
    );
  });

  it("is null when the sections share every subject", () => {
    expect(oldOnlySubjectsWarning([])).toBeNull();
  });
});
