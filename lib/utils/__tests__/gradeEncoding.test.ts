import { describe, expect, it } from "vitest";
import {
  toGridRows,
  toTeacherRows,
  type EncodingStatusRow,
} from "@/app/(protected)/grade-monitoring/components/gradeEncoding";

function row(
  period: number,
  teachers: string[] | null,
  encoded: number
): EncodingStatusRow {
  return {
    subject_id: 1,
    subject_name: "Science",
    is_madrasah: false,
    section_id: 1,
    section_name: "Rizal",
    grade_level: 5,
    assigned_teachers: teachers as string[],
    grading_period: period,
    expected_learners: 10,
    encoded_learners: encoded,
    encoders: [],
    last_encoded_at: null,
  };
}

describe("grade encoding per-period teachers (223)", () => {
  it("keeps whole-year rows unchanged: same teachers, every cell credited", () => {
    const rows = [1, 2, 3].map((p) => row(p, ["A", "B"], 10));
    const grid = toGridRows(rows);
    expect(grid).toHaveLength(1);
    expect(grid[0].assignedTeachers).toEqual(["A", "B"]);
    const teachers = toTeacherRows(grid);
    expect(teachers.map((t) => [t.teacherName, t.assignments, t.complete])).toEqual([
      ["A", 1, 3],
      ["B", 1, 3],
    ]);
  });

  it("credits each period to the teacher scheduled for it", () => {
    const grid = toGridRows([
      row(1, ["A"], 10),
      row(2, ["A"], 10),
      row(3, ["B"], 0),
    ]);
    expect(grid[0].assignedTeachers).toEqual(["A", "B"]);
    const [a, b] = toTeacherRows(grid);
    expect(a).toMatchObject({ teacherName: "A", assignments: 1, complete: 2, notStarted: 0 });
    expect(b).toMatchObject({ teacherName: "B", assignments: 1, complete: 0, notStarted: 1 });
  });

  it("treats null assigned_teachers as no teachers", () => {
    const grid = toGridRows([row(1, null, 0)]);
    expect(grid[0].periods[1].teachers).toEqual([]);
    expect(grid[0].assignedTeachers).toEqual([]);
    expect(toTeacherRows(grid)).toEqual([]);
  });
});
