/**
 * The printed A4 sheet is meant to be the Excel download on paper, so the
 * assertions here are about the two agreeing: the same header block, the same
 * columns in the same order, the same roster order and the same levelling.
 */

import { describe, expect, it } from "vitest";
import {
  buildRmaScoresheetHtml,
  type RmaScoresheetParams,
} from "../generateRmaScoresheet";
import { masteryForScore, percentage } from "@/lib/assessments/rmaFormat";
import type { RmaBand, RmaItem, RmaMaterial, Student } from "@/types";

const TASKS: [string, number][] = [
  ["Task A", 3],
  ["Task B", 1],
  ["Task C", 2],
  ["Task D", 4],
];

function item(index: number): RmaItem {
  const [domain, max] = TASKS[index];
  return {
    id: `item-${index}`,
    material_id: "m1",
    item_no: index + 1,
    domain,
    question_text: index === 0 ? "Count the objects in each set." : null,
    correct_answer: null,
    max_score: max,
    position: index,
    created_at: "",
    updated_at: "",
  } as RmaItem;
}

function band(min: number, max: number, label: string, position: number): RmaBand {
  return {
    id: `band-${position}`,
    material_id: "m1",
    min_score: min,
    max_score: max,
    label,
    position,
    created_at: "",
    updated_at: "",
  } as RmaBand;
}

function student(
  id: string,
  last: string,
  gender: "male" | "female",
  overrides: Partial<Student> = {},
): Student {
  return {
    id,
    lrn: `13161824000${id}`,
    first_name: "Juan",
    middle_name: "Molina",
    last_name: last,
    suffix: null,
    date_of_birth: "2018-05-06",
    gender,
    mother_tongue: "Sinugbuanong Binisaya",
    enrollment_status: "enrolled",
    created_at: "",
    updated_at: "",
    ...overrides,
  } as Student;
}

const material = {
  id: "m1",
  school_id: null,
  title: "RMA Grade 2",
  grade_level: 2,
  instructions: null,
  is_active: true,
  created_by: null,
  created_at: "",
  updated_at: "",
} as RmaMaterial;

const items = TASKS.map((_, i) => item(i));
const bands = [
  band(0, 74.99, "Intervention", 0),
  band(75, 84.99, "Consolidation", 1),
  band(85, 100, "Enhancement", 2),
];

type Params = Parameters<typeof buildRmaScoresheetHtml>[0];

const params = (overrides: Partial<Params> = {}): Params => ({
  schoolId: 7,
  material,
  items,
  bands,
  // Male group first, as the table hands it over.
  students: [student("1", "AMOR", "male"), student("2", "BOLANDO", "female")],
  scores: {
    "1": { "item-0": 3, "item-1": 1, "item-2": 2, "item-3": 2 },
    "2": {},
  },
  meta: {
    "1": { date_assessed: "2026-06-09", remarks: "Needs drills" },
    "2": { date_assessed: null, remarks: null },
  },
  sectionName: "Watermelon",
  gradeLevel: 2,
  teacherName: "Alma S. Gonzales",
  phase: "BoSY",
  schoolYear: "2026-2027",
  maxTotal: TASKS.reduce((sum, [, max]) => sum + max, 0),
  schoolName: "Cagbas Elementary School",
  schoolCode: "131618",
  region: "CARAGA",
  ...overrides,
});

/** The table's header cells, in the order they are printed. */
function headerCells(html: string): string[] {
  const thead = /<thead>([\s\S]*?)<\/thead>/.exec(html)?.[1] ?? "";
  return [...thead.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/<[^>]*>/g, "").trim(),
  );
}

/** One learner row's cells, stripped of markup. */
function rowCells(html: string, index: number): string[] {
  const tbody = /<tbody>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? "";
  const rows = [...tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)];
  return [...rows[index][1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
    m[1].replace(/<[^>]*>/g, "").trim(),
  );
}

describe("RMA printed scoresheet", () => {
  it("carries the workbook's header block", () => {
    const html = buildRmaScoresheetHtml(params());
    for (const field of [
      "Assessment Type:",
      "Region:",
      "School ID:",
      "School Name:",
      "Grade:",
      "Teacher:",
      "Section:",
      "School Year:",
    ]) {
      expect(html).toContain(field);
    }
    expect(html).toContain("BoSY");
    expect(html).toContain("CARAGA");
    expect(html).toContain("131618");
    expect(html).toContain("Cagbas Elementary School");
    expect(html).toContain("Grade 2");
    expect(html).toContain("Alma S. Gonzales");
    expect(html).toContain("Watermelon");
    expect(html).toContain("2026-2027");
  });

  it("counts the male and female groups the way the workbook's O6/O7 do", () => {
    const html = buildRmaScoresheetHtml(
      params({
        students: [
          student("1", "AMOR", "male"),
          student("3", "CRUZ", "male"),
          student("2", "BOLANDO", "female"),
        ],
      }),
    );
    expect(html).toContain("No. of Male / Female:");
    expect(html).toContain("2 / 1");
  });

  it("prints the workbook's columns, in the workbook's order", () => {
    const cells = headerCells(buildRmaScoresheetHtml(params()));
    expect(cells).toEqual([
      "S/N",
      "LRN",
      "Name of Learner",
      "Sex",
      "Birthdate",
      "Date of Assessment",
      "Mother Tongue",
      "Task A",
      "Task B",
      "Task C",
      "Task D",
      "TOTAL SCORE (10)",
      "% of Correct Answer",
      "Levelling of Learners",
      "Remarks",
      // Second header row: each task's maximum, the workbook's row 9.
      "3",
      "1",
      "2",
      "4",
    ]);
  });

  it("fills a learner row the way the form is filled by hand", () => {
    const cells = rowCells(buildRmaScoresheetHtml(params()), 0);
    expect(cells).toEqual([
      "1",
      "131618240001",
      "AMOR, Juan Molina",
      "Male",
      "05/06/2018",
      "06/09/2026",
      "Sinugbuanong Binisaya",
      "3",
      "1",
      "2",
      "2",
      "8",
      "80.00%",
      "Consolidation",
      "Needs drills",
    ]);
  });

  it("leaves an unassessed learner's total, percentage and levelling blank", () => {
    const cells = rowCells(buildRmaScoresheetHtml(params()), 1);
    expect(cells.slice(-4)).toEqual(["", "", "", ""]);
    // The learner is still listed, with their own details.
    expect(cells[2]).toBe("BOLANDO, Juan Molina");
    expect(cells[3]).toBe("Female");
  });

  it("numbers straight through the roster, as the workbook's rows do", () => {
    const html = buildRmaScoresheetHtml(
      params({
        students: [
          student("1", "AMOR", "male"),
          student("3", "CRUZ", "male"),
          student("2", "BOLANDO", "female"),
        ],
        scores: {},
      }),
    );
    expect(rowCells(html, 0)[0]).toBe("1");
    expect(rowCells(html, 1)[0]).toBe("2");
    expect(rowCells(html, 2)[0]).toBe("3");
    // Male group first, and no banner row the workbook does not have.
    expect(rowCells(html, 2)[3]).toBe("Female");
    expect(html).not.toContain(">MALE<");
  });

  it("bands on the same two-decimal percentage as the workbook and the screen", () => {
    // 7/10 is 70.00% — Intervention on the band above; the shared helper is
    // what column V's formula mirrors, so the paper cannot disagree with it.
    for (const [raw, expectedPct, expectedLevel] of [
      [7, "70.00%", "Intervention"],
      [8, "80.00%", "Consolidation"],
      [9, "90.00%", "Enhancement"],
    ] as const) {
      const html = buildRmaScoresheetHtml(
        params({ scores: { "1": { "item-0": raw } } }),
      );
      const cells = rowCells(html, 0);
      expect(cells.slice(-3, -1)).toEqual([expectedPct, expectedLevel]);
      expect(percentage(raw, 10).toFixed(2) + "%").toBe(expectedPct);
      expect(masteryForScore(bands, raw, 10)).toBe(expectedLevel);
    }
  });

  it("keeps two decimals where a whole percent would round into another band", () => {
    // 7.5/10 is 75.00% — Consolidation. Rounded to a whole percent it is still
    // 75, but a sheet that rounded down to 74 would print Intervention.
    const html = buildRmaScoresheetHtml(
      params({ scores: { "1": { "item-0": 7.5 } } }),
    );
    expect(rowCells(html, 0).slice(-3, -1)).toEqual(["75.00%", "Consolidation"]);
  });

  it("prints the levelling bands the material actually carries", () => {
    const html = buildRmaScoresheetHtml(params());
    expect(html).toContain("0–74.99% · Intervention");
    expect(html).toContain("75–84.99% · Consolidation");
    expect(html).toContain("85–100% · Enhancement");
  });

  it("moves a task's full question to a legend, keeping the column narrow", () => {
    const html = buildRmaScoresheetHtml(params());
    expect(headerCells(html)).toContain("Task A");
    expect(html).toContain("Count the objects in each set.");
    // The question is not crammed into the column header.
    expect(html).not.toMatch(/<th class="task">[^<]*Count the objects/);
  });

  it("carries a suffix into the name, as the workbook does", () => {
    const html = buildRmaScoresheetHtml(
      params({ students: [student("1", "AMOR", "male", { suffix: "Jr." })] }),
    );
    expect(rowCells(html, 0)[2]).toBe("AMOR Jr., Juan Molina");
  });

  it("escapes a learner's own text rather than letting it close a tag", () => {
    const html = buildRmaScoresheetHtml(
      params({
        students: [student("1", "<script>", "male")],
        meta: { "1": { date_assessed: null, remarks: "a & b" } },
      }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a &amp; b");
  });

  it("prints A4 landscape, repeating the header on every page", () => {
    const html = buildRmaScoresheetHtml(params());
    expect(html).toContain("size: A4 landscape");
    expect(html).toContain("thead { display:table-header-group; }");
  });
});
