import { describe, expect, it } from "vitest";

import { buildMatatagGradeRows } from "@/lib/pdf/generateReportCard";
import type { MapehSourceRow } from "@/lib/utils/mapeh";

const subject = (
  name: string,
  quarters: (number | null)[],
  extra: Partial<MapehSourceRow> = {},
): MapehSourceRow => ({
  name,
  code: name.slice(0, 6).toUpperCase(),
  is_madrasah: false,
  mapeh_component: null,
  q1: quarters[0] ?? null,
  q2: quarters[1] ?? null,
  q3: quarters[2] ?? null,
  q4: quarters[3] ?? null,
  ...extra,
});

/** Cells of the first data row, in order. */
const cellsOf = (html: string): string[] => {
  const row = html.slice(0, html.indexOf("</tr>"));
  return [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").trim(),
  );
};

describe("the MATATAG card's learning-areas table", () => {
  const shsRoster = [
    subject("General Science", [85, 87, 86], {
      code: "CORE-1",
      shs_category: "core",
      units: 6,
    }),
    subject("Academic Elective 1", [95, null, null], {
      code: "ELEC-1",
      shs_category: "elective",
      units: 3,
    }),
  ];

  it("prints the Units column and the Core/Elective headings in Grade 11", () => {
    const { html, average, totalUnits } = buildMatatagGradeRows(shsRoster, 3, 11);

    expect(html).toContain(">Core Subjects<");
    expect(html).toContain(">Elective Subjects<");
    // Name + three terms + units + final + remarks = 7 columns.
    expect(html).toContain('colspan="7"');

    // The heading row comes first, then the subject with its units in place.
    const afterHeading = html.slice(html.indexOf("Core Subjects"));
    expect(cellsOf(afterHeading.slice(afterHeading.indexOf("</tr>") + 5))).toEqual([
      "General Science",
      "85",
      "87",
      "86",
      "6",
      "86",
      "Passed",
    ]);

    // Reported, not weighted: 6 + 3 units. The average is 86 alone, not
    // mean(86, 95): the elective carries only a 1st Term grade, so it has no
    // final yet and nothing to contribute — the card no longer reads a single
    // term as an elective's standing for the year.
    expect(totalUnits).toBe("9");
    expect(average).toBe("86");

    const electiveRow = html.slice(
      html.lastIndexOf("<tr>", html.indexOf("Academic Elective 1")),
    );
    expect(cellsOf(electiveRow)).toEqual([
      "Academic Elective 1",
      "95",
      "",
      "",
      "3",
      "",
      "",
    ]);
  });

  it("holds the final, the remarks and the average back until the last term", () => {
    const partial = [subject("English", [80, 82], { code: "ENG" })];

    const midYear = buildMatatagGradeRows(partial, 3, 6);
    expect(cellsOf(midYear.html)).toEqual(["English", "80", "82", "", "", ""]);
    expect(midYear.average).toBe("");
    expect(midYear.remarks).toBe("");

    const encoded = [subject("English", [80, 82, 84], { code: "ENG" })];
    const yearEnd = buildMatatagGradeRows(encoded, 3, 6);
    expect(cellsOf(yearEnd.html)).toEqual(["English", "80", "82", "84", "82", "Passed"]);
    expect(yearEnd.average).toBe("82");
    expect(yearEnd.remarks).toBe("Passed");
  });

  it("waits for the 4th quarter on a quarter-based year, not for a 3rd term", () => {
    const rows = [subject("English", [80, 82, 84], { code: "ENG" })];

    // Three terms encoded, but this school year has four periods.
    expect(buildMatatagGradeRows(rows, 4, 6).average).toBe("");

    const complete = [subject("English", [80, 82, 84, 86], { code: "ENG" })];
    expect(buildMatatagGradeRows(complete, 4, 6).average).toBe("83");
  });

  it("leaves the K-10 card exactly as it was — no Units cell, no headings", () => {
    const { html, totalUnits } = buildMatatagGradeRows(
      [subject("English", [80, 82, 84])],
      3,
      6,
    );

    expect(html).not.toContain("Core Subjects");
    expect(cellsOf(html)).toEqual(["English", "80", "82", "84", "82", "Passed"]);
    expect(totalUnits).toBe("");
  });

  it("prints an empty Units cell for an SHS subject with none transcribed", () => {
    const { html, totalUnits } = buildMatatagGradeRows(
      [subject("Work Immersion", [90, 90, 90], { code: "ZZ" })],
      3,
      12,
    );

    expect(cellsOf(html)).toEqual(["Work Immersion", "90", "90", "90", "", "90", "Passed"]);
    expect(totalUnits).toBe("");
  });
});

/** Cells of the row carrying `name` — SHS tables open with a group heading. */
const rowCellsOf = (html: string, name: string): string[] => {
  const row = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map((m) => m[1])
    .find((r) => r.includes(name));
  if (!row) return [];
  return [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").trim(),
  );
};

describe("the semestral Senior High card (migration 189)", () => {
  // One semester of an old-curriculum section: its own subjects, its own two
  // quarters. The table is the same builder called with a period count of two,
  // which is the whole point — nothing about MAPEH folding, the Core/Elective
  // grouping or the completeness rule is restated for it.
  const firstSemester = [
    subject("Oral Communication", [88, 90], {
      code: "CORE-1",
      shs_category: "core",
      units: 4,
    }),
    subject("Empowerment Technologies", [84, 86], {
      code: "APP-1",
      shs_category: "elective",
      units: 3,
    }),
  ];

  it("averages the semester's two quarters into the Semester Final Grade", () => {
    const { html } = buildMatatagGradeRows(firstSemester, 2, 12);
    const cells = rowCellsOf(html, "Oral Communication");
    // Name + Q1 + Q2 + Units + Final + Remarks
    expect(cells).toEqual(["Oral Communication", "88", "90", "4", "89", "Passed"]);
  });

  it("prints six columns, not the annual card's seven", () => {
    const { html } = buildMatatagGradeRows(firstSemester, 2, 12);
    expect(html).toContain('colspan="6"');
    expect(html).not.toContain('colspan="7"');
  });

  it("withholds the Semester Final until both quarters are in", () => {
    // A semester half encoded is not a semester graded — the same rule the
    // annual card applies to its three terms.
    const { html, average } = buildMatatagGradeRows(
      [subject("General Mathematics", [91, null], { shs_category: "core", units: 4 })],
      2,
      12,
    );
    const cells = rowCellsOf(html, "General Mathematics");
    expect(cells[1]).toBe("91");
    expect(cells[2]).toBe("");
    expect(cells[4]).toBe(""); // Semester Final Grade
    expect(average).toBe("");
  });

  it("ignores any third or fourth period left on the row", () => {
    // The other semester's periods are carried on their own block; a stray one
    // here must not creep into this semester's final.
    const { html } = buildMatatagGradeRows(
      [subject("Practical Research", [80, 90, 60, 60], { shs_category: "elective", units: 3 })],
      2,
      12,
    );
    const cells = rowCellsOf(html, "Practical Research");
    expect(cells[4]).toBe("85");
  });

  it("gives each semester its own general average", () => {
    const second = [
      subject("Media and Information Literacy", [95, 95], {
        code: "CORE-2",
        shs_category: "core",
        units: 4,
      }),
    ];
    expect(buildMatatagGradeRows(firstSemester, 2, 12).average).toBe("87");
    expect(buildMatatagGradeRows(second, 2, 12).average).toBe("95");
  });
});
