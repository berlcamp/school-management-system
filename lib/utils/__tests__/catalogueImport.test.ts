import { describe, expect, it } from "vitest";
import {
  catalogueTemplateRows,
  importBlockedReason,
  newLearningAreaNames,
  parseCatalogueRows,
  parseGrade,
} from "@/lib/utils/catalogueImport";

const HEADER = ["Learning Area", "Grade", "LC Code", "Competency"];

describe("parseGrade", () => {
  it.each([
    ["K", 0], ["Kinder", 0], ["Kindergarten", 0], ["0", 0], ["5", 5], ["Grade 5", 5],
    ["grade12", 12], [7, 7], ["SNED", -1], ["sned", -1], ["-1", -1], [-1, -1],
  ])("reads %s as %s", (input, out) => {
    expect(parseGrade(input)).toBe(out);
  });
  it.each(["", "13", "Grade X", "-2"])("rejects %s", (input) => {
    expect(parseGrade(input)).toBeNull();
  });
});

describe("parseCatalogueRows", () => {
  it("requires the header row", () => {
    const r = parseCatalogueRows([["Area", "Grade"]]);
    expect(r.entries).toEqual([]);
    expect(r.errors[0].row).toBe(1);
  });

  it("normalizes valid rows and reports bad ones with row numbers", () => {
    const r = parseCatalogueRows([
      HEADER,
      ["Mathematics", "Grade 5", " m5ns-ia-1 ", "  Visualizes   numbers "],
      ["", "5", "M5-2", "x"],
      ["Mathematics", "Grade X", "M5-3", "x"],
      ["Mathematics", "5", "", "x"],
      ["Mathematics", "5", "M5-4", ""],
      [null, null, null, null],
      ["mathematics", "5", "M5NS-IA-1", "dup"],
      ["Science", "K", "SK-1", "Senses"],
    ]);
    expect(r.entries).toEqual([
      { learningArea: "Mathematics", gradeLevel: 5, lcCode: "M5NS-IA-1", competencyText: "Visualizes numbers" },
      { learningArea: "Science", gradeLevel: 0, lcCode: "SK-1", competencyText: "Senses" },
    ]);
    expect(r.errors.map((e) => e.row)).toEqual([3, 4, 5, 6, 8]);
    expect(r.errors[4].message).toMatch(/Duplicate of row 2/);
  });

  it("finds the columns in any order", () => {
    const r = parseCatalogueRows([
      ["Competency", "LC Code", "Grade", "Learning Area"],
      ["Adds", "M1-1", "1", "Math"],
    ]);
    expect(r.entries[0]).toEqual({ learningArea: "Math", gradeLevel: 1, lcCode: "M1-1", competencyText: "Adds" });
  });
});

describe("newLearningAreaNames", () => {
  it("dedupes new area names case-insensitively, keeping the first spelling", () => {
    const entries = parseCatalogueRows([
      HEADER,
      ["Mathematics", "5", "A-1", "x"],
      ["mathematics", "5", "A-2", "y"],
      ["Science", "5", "S-1", "z"],
    ]).entries;
    expect(newLearningAreaNames(entries, new Set(["science"]))).toEqual(["Mathematics"]);
  });
});

describe("catalogueTemplateRows", () => {
  it("is a sheet the importer accepts with no skipped rows", () => {
    const parsed = parseCatalogueRows(catalogueTemplateRows());
    expect(parsed.errors).toEqual([]);
    expect(parsed.entries.length).toBeGreaterThan(0);
  });

  it("starts with the four headers in the documented order", () => {
    expect(catalogueTemplateRows()[0]).toEqual([
      "Learning Area",
      "Grade",
      "LC Code",
      "Competency",
    ]);
  });
});

describe("importBlockedReason", () => {
  const ok = { entries: [{ learningArea: "Math", gradeLevel: 1, lcCode: "M1NS-Ia-1", competencyText: "x" }], errors: [] };

  it("asks for a file first", () => {
    expect(importBlockedReason(null, false)).toBe("Choose a file to import.");
  });

  it("says when nothing in the sheet can be imported", () => {
    expect(importBlockedReason({ entries: [], errors: [{ row: 2, message: "Grade is blank." }] }, false)).toBe(
      "No row in this sheet can be imported — see the skipped rows.",
    );
  });

  it("is quiet while importing and when ready", () => {
    expect(importBlockedReason(ok, true)).toBeNull();
    expect(importBlockedReason(ok, false)).toBeNull();
  });
});
