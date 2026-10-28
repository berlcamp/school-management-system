import { describe, expect, it } from "vitest";
import {
  type ScheduleClient,
  encodedConflictMessage,
  fetchEncodedPeriods,
  periodsKeptByOtherRows,
  planHandover,
  runHandover,
  schedulePeriodLabels,
} from "../scheduleHandover";
import { scheduleTermOptions } from "../scheduleTerms";

/**
 * A hand-written fake of the slice of the PostgREST builder these helpers
 * call: from().select/update/insert, eq/in/not/limit, then await. Rows live in
 * memory; every write is logged so a test can assert the order of calls.
 */
type Row = Record<string, unknown>;
interface Call {
  table: string;
  op: "select" | "update" | "insert";
  values?: Row | Row[];
  filters: string[];
}

function fakeClient(
  tables: Record<string, Row[]>,
  options: { failInsert?: string; failUpdateOnCall?: number } = {},
) {
  const calls: Call[] = [];
  let updateCount = 0;
  const from = (table: string) => {
    let op: Call["op"] = "select";
    let values: Row | Row[] | undefined;
    const preds: Array<(row: Row) => boolean> = [];
    const filters: string[] = [];
    let max: number | null = null;
    const builder = {
      select: () => builder,
      update: (v: Row) => {
        op = "update";
        values = v;
        return builder;
      },
      insert: (v: Row[]) => {
        op = "insert";
        values = v;
        return builder;
      },
      eq: (col: string, val: unknown) => {
        filters.push(`${col}=${String(val)}`);
        preds.push((r) => String(r[col]) === String(val));
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        filters.push(`${col} in ${vals.join(",")}`);
        preds.push((r) => vals.map(String).includes(String(r[col])));
        return builder;
      },
      not: (col: string) => {
        filters.push(`${col} not null`);
        preds.push((r) => r[col] != null);
        return builder;
      },
      limit: (n: number) => {
        max = n;
        return builder;
      },
      then: (
        resolve: (r: { data: Row[] | null; error: { message: string } | null }) => void,
      ) => {
        calls.push({ table, op, values, filters });
        const rows = tables[table] ?? [];
        if (op === "insert") {
          if (options.failInsert) {
            resolve({ data: null, error: { message: options.failInsert } });
            return;
          }
          const inserted = (values as Row[]).map((v, i) => ({ id: 900 + i, ...v }));
          rows.push(...inserted);
          resolve({ data: inserted, error: null });
          return;
        }
        if (op === "update") {
          updateCount += 1;
          if (options.failUpdateOnCall === updateCount) {
            resolve({ data: null, error: { message: "update refused" } });
            return;
          }
          const hit = rows.filter((r) => preds.every((p) => p(r)));
          hit.forEach((r) => Object.assign(r, values));
          resolve({ data: hit, error: null });
          return;
        }
        const hit = rows.filter((r) => preds.every((p) => p(r)));
        resolve({ data: max == null ? hit : hit.slice(0, max), error: null });
      },
    };
    return builder;
  };
  return { client: { from } as unknown as ScheduleClient, calls };
}

describe("planHandover", () => {
  it("splits a whole-year row at the chosen term", () => {
    expect(planHandover(null, 3, [1, 2, 3])).toEqual({
      narrowed: [1, 2],
      handedOver: [3],
    });
    expect(planHandover(null, 3, [1, 2, 3, 4])).toEqual({
      narrowed: [1, 2],
      handedOver: [3, 4],
    });
  });
  it("splits a part-year row within what it covered", () => {
    expect(planHandover([1, 2], 2, [1, 2, 3])).toEqual({
      narrowed: [1],
      handedOver: [2],
    });
  });
  it("is null when either side would be empty", () => {
    expect(planHandover([3], 3, [1, 2, 3])).toBeNull();
    expect(planHandover(null, 1, [1, 2, 3])).toBeNull();
    expect(planHandover([1, 2], 3, [1, 2, 3])).toBeNull();
  });
});

describe("schedulePeriodLabels", () => {
  it("names a single term, a semester, or each period's own option", () => {
    expect(schedulePeriodLabels([3], scheduleTermOptions("2026-2027"))).toEqual([
      "3rd Term",
    ]);
    const shs = scheduleTermOptions("2026-2027", "old");
    expect(schedulePeriodLabels([3, 4], shs)).toEqual(["2nd Semester"]);
    expect(schedulePeriodLabels([3], shs)).toEqual(["2nd Semester"]);
  });
});

describe("encodedConflictMessage", () => {
  it("names the teacher and the periods", () => {
    expect(encodedConflictMessage("Ana Cruz", ["3rd Term"])).toBe(
      "Ana Cruz has already encoded 3rd Term. Move the scores or unpost first.",
    );
    expect(encodedConflictMessage("Ana Cruz", ["2nd Term", "3rd Term"])).toBe(
      "Ana Cruz has already encoded 2nd Term and 3rd Term. Move the scores or unpost first.",
    );
  });
});

describe("periodsKeptByOtherRows", () => {
  it("returns the periods the teacher still holds through another row", () => {
    const rows = [
      { id: "1", subject_id: "5", section_id: "7", school_year: "2026-2027", teacher_id: "9", grading_periods: null },
      { id: "2", subject_id: "5", section_id: "7", school_year: "2026-2027", teacher_id: "9", grading_periods: [3] },
      { id: "3", subject_id: "5", section_id: "7", school_year: "2026-2027", teacher_id: "8", grading_periods: [2] },
      { id: "4", subject_id: "6", section_id: "7", school_year: "2026-2027", teacher_id: "9", grading_periods: [2] },
    ];
    expect(
      periodsKeptByOtherRows(rows, {
        excludeIds: ["1"],
        subjectId: "5",
        sectionId: "7",
        schoolYear: "2026-2027",
        teacherId: "9",
        allPeriods: [1, 2, 3],
      }),
    ).toEqual([3]);
  });
});

describe("fetchEncodedPeriods", () => {
  it("returns only periods whose class record holds a non-null score", async () => {
    const { client } = fakeClient({
      sms_class_records: [
        { id: 11, subject_id: 5, section_id: 7, school_year: "2026-2027", grading_period: 1, teacher_id: 9 },
        { id: 13, subject_id: 5, section_id: 7, school_year: "2026-2027", grading_period: 3, teacher_id: 9 },
        // Another teacher's record for the same slot is not this teacher's work
        { id: 14, subject_id: 5, section_id: 7, school_year: "2026-2027", grading_period: 2, teacher_id: 8 },
      ],
      sms_class_record_items: [
        { id: 101, class_record_id: 11 },
        { id: 131, class_record_id: 13 },
        { id: 141, class_record_id: 14 },
      ],
      sms_class_record_scores: [
        { item_id: 101, student_id: 1, raw_score: null },
        { item_id: 131, student_id: 1, raw_score: 8 },
        { item_id: 141, student_id: 1, raw_score: 5 },
      ],
    });
    await expect(
      fetchEncodedPeriods(client, {
        subjectId: 5,
        sectionId: 7,
        schoolYear: "2026-2027",
        teacherId: 9,
      }),
    ).resolves.toEqual([3]);
  });

  it("is empty when the teacher has no class record", async () => {
    const { client } = fakeClient({ sms_class_records: [] });
    await expect(
      fetchEncodedPeriods(client, {
        subjectId: 5,
        sectionId: 7,
        schoolYear: "2026-2027",
        teacherId: 9,
      }),
    ).resolves.toEqual([]);
  });
});

describe("runHandover", () => {
  const sources = () => [
    { id: 1, grading_periods: null, teacher_id: 9 },
    { id: 2, grading_periods: null, teacher_id: 9 },
  ];

  it("narrows the sources, then puts them back when the insert fails", async () => {
    const tables = { sms_subject_schedules: sources() };
    const { client, calls } = fakeClient(tables, {
      failInsert: "Schedule conflict: section already booked",
    });
    const result = await runHandover(client, {
      sources: [
        { id: 1, grading_periods: null },
        { id: 2, grading_periods: null },
      ],
      narrowed: [1, 2],
      insertRows: [{ teacher_id: 8, grading_periods: [3] }],
    });

    expect(result).toEqual({
      ok: false,
      error: "Schedule conflict: section already booked",
    });
    const writes = calls.filter((c) => c.op !== "select");
    expect(writes.map((c) => [c.op, c.values])).toEqual([
      ["update", { grading_periods: [1, 2] }],
      ["update", { grading_periods: [1, 2] }],
      ["insert", [{ teacher_id: 8, grading_periods: [3] }]],
      ["update", { grading_periods: null }],
      ["update", { grading_periods: null }],
    ]);
    expect(tables.sms_subject_schedules.map((r) => r.grading_periods)).toEqual([
      null,
      null,
    ]);
  });

  it("returns the inserted rows and restores nothing when the insert passes", async () => {
    const tables = { sms_subject_schedules: sources() };
    const { client, calls } = fakeClient(tables);
    const result = await runHandover(client, {
      sources: [
        { id: 1, grading_periods: null },
        { id: 2, grading_periods: null },
      ],
      narrowed: [1, 2],
      insertRows: [{ teacher_id: 8, grading_periods: [3] }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.inserted).toHaveLength(1);
    expect(calls.filter((c) => c.op === "update")).toHaveLength(2);
    expect(tables.sms_subject_schedules.map((r) => r.grading_periods)).toEqual([
      [1, 2],
      [1, 2],
      [3],
    ]);
  });

  it("restores the sources already narrowed when a later narrowing fails", async () => {
    const tables = { sms_subject_schedules: sources() };
    const { client, calls } = fakeClient(tables, { failUpdateOnCall: 2 });
    const result = await runHandover(client, {
      sources: [
        { id: 1, grading_periods: null },
        { id: 2, grading_periods: null },
      ],
      narrowed: [1, 2],
      insertRows: [{ teacher_id: 8, grading_periods: [3] }],
    });

    expect(result).toEqual({ ok: false, error: "update refused" });
    expect(calls.some((c) => c.op === "insert")).toBe(false);
    expect(tables.sms_subject_schedules.map((r) => r.grading_periods)).toEqual([
      null,
      null,
    ]);
  });

  it("treats a narrowing that touched no row as a failure", async () => {
    const tables = { sms_subject_schedules: [{ id: 1, grading_periods: null }] };
    const { client } = fakeClient(tables);
    const result = await runHandover(client, {
      sources: [
        { id: 1, grading_periods: null },
        { id: 2, grading_periods: null },
      ],
      narrowed: [1, 2],
      insertRows: [{ teacher_id: 8 }],
    });
    expect(result.ok).toBe(false);
    expect(tables.sms_subject_schedules[0]!.grading_periods).toBeNull();
  });
});
