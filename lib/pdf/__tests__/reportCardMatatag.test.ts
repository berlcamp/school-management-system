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
