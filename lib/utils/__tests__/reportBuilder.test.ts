import { readdirSync, readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  describeFilters,
  enumOptions,
  exportHeaders,
  formatReportValue,
  isCompleteFilter,
  OPERATOR_META,
  OPERATORS_BY_TYPE,
  orderedFields,
  ReportDataset,
  ReportDataType,
  ReportField,
  toExportRows,
} from "../reportBuilder";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

const migrationSql = (): string =>
  readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(path.join(migrationsDir, f), "utf8"))
    .join("\n");

const field = (over: Partial<ReportField> = {}): ReportField => ({
  field_key: "full_name",
  label: "Name",
  data_type: "text",
  enum_source: null,
  filterable: true,
  default_selected: true,
  sort_order: 10,
  ...over,
});

// ---------------------------------------------------------------------------
// Drift against the database
//
// The server is authoritative for both of these. A client that disagrees does
// not produce a wrong answer — the RPC refuses it — but it does offer the user
// a control that cannot work, which is why these are asserted against the
// migration files rather than trusted.
// ---------------------------------------------------------------------------

describe("OPERATORS_BY_TYPE mirrors division_report_operators", () => {
  const sql = migrationSql();

  // WHEN 'text' THEN ARRAY['eq','neq',...]
  const serverOperators = new Map<string, string[]>();
  for (const [, type, list] of sql.matchAll(
    /WHEN\s+'(text|enum|number|date|boolean)'\s+THEN\s+ARRAY\[([^\]]+)\]/g,
  )) {
    serverOperators.set(
      type,
      [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]),
    );
  }

  it("finds the SQL definition at all", () => {
    expect(serverOperators.size).toBe(5);
  });

  (["text", "enum", "number", "date", "boolean"] as ReportDataType[]).forEach(
    (type) => {
      it(`agrees for a ${type} field`, () => {
        expect([...OPERATORS_BY_TYPE[type]].sort()).toEqual(
          [...(serverOperators.get(type) ?? [])].sort(),
        );
      });
    },
  );

  it("has display metadata for every operator it offers", () => {
    Object.values(OPERATORS_BY_TYPE)
      .flat()
      .forEach((op) => {
        expect(OPERATOR_META[op]?.label, op).toBeTruthy();
      });
  });
});

describe("every enum_source the catalogue seeds resolves to a picklist", () => {
  const sources = new Set<string>();

  // Only the catalogue's own seed statements: a data-type word inside some
  // other migration's CHECK list is not an enum source.
  for (const [, statement] of migrationSql().matchAll(
    /INSERT\s+INTO\s+procurements\.sms_report_dataset_fields([\s\S]*?);/g,
  )) {
    // ('rooms', 'condition', 'Condition', 'enum', 'room_condition', TRUE, ...)
    for (const [, source] of statement.matchAll(
      /,\s*'(?:text|number|date|boolean|enum)',\s*'([a-z_]+)'\s*,/g,
    )) {
      sources.add(source);
    }
  }

  it("finds the seeded sources at all", () => {
    expect(sources.size).toBeGreaterThan(5);
  });

  sources.forEach((source) => {
    it(`knows "${source}"`, () => {
      // An unrecognised source silently degrades to a free-text box, so the
      // filter still works — it just makes the user type a code by hand.
      expect(enumOptions(source).length, source).toBeGreaterThan(0);
    });
  });

  it("returns nothing for a source it does not know", () => {
    expect(enumOptions("no_such_picklist")).toEqual([]);
    expect(enumOptions(null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

describe("isCompleteFilter", () => {
  it("needs no value for a blank/not-blank test", () => {
    expect(isCompleteFilter({ field: "lrn", op: "is_null" })).toBe(true);
    expect(isCompleteFilter({ field: "lrn", op: "not_null" })).toBe(true);
  });

  it("needs one value for a comparison", () => {
    expect(isCompleteFilter({ field: "lrn", op: "eq" })).toBe(false);
    expect(isCompleteFilter({ field: "lrn", op: "eq", value: "" })).toBe(false);
    expect(isCompleteFilter({ field: "lrn", op: "eq", value: "1234" })).toBe(true);
  });

  it("needs a non-empty list for `in`", () => {
    expect(isCompleteFilter({ field: "g", op: "in", value: [] })).toBe(false);
    expect(isCompleteFilter({ field: "g", op: "in", value: ["5"] })).toBe(true);
  });

  it("needs exactly two filled values for `between`", () => {
    expect(isCompleteFilter({ field: "age", op: "between", value: ["5"] })).toBe(false);
    expect(isCompleteFilter({ field: "age", op: "between", value: ["5", ""] })).toBe(false);
    expect(isCompleteFilter({ field: "age", op: "between", value: ["5", "9"] })).toBe(true);
  });
});

describe("describeFilters", () => {
  const dataset = {
    fields: [
      field({ field_key: "grade_level", label: "Grade Level", data_type: "number", enum_source: "grade_level" }),
      field({ field_key: "is_4ps", label: "4Ps", data_type: "boolean" }),
    ],
  } as ReportDataset;

  it("reads the values back through their labels", () => {
    expect(
      describeFilters(dataset, [
        { field: "grade_level", op: "in", value: ["5", "6"] },
      ]),
    ).toEqual(["Grade Level is any of Grade 5, Grade 6"]);
  });

  it("drops a filter the user has not finished", () => {
    expect(
      describeFilters(dataset, [{ field: "is_4ps", op: "eq" }]),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

describe("formatReportValue", () => {
  it("dashes a blank", () => {
    expect(formatReportValue(field(), null)).toBe("—");
    expect(formatReportValue(field(), undefined)).toBe("—");
    expect(formatReportValue(field(), "")).toBe("—");
  });

  it("reads a boolean as Yes / No, including a false that is not blank", () => {
    const f = field({ data_type: "boolean" });
    expect(formatReportValue(f, true)).toBe("Yes");
    expect(formatReportValue(f, false)).toBe("No");
  });

  it("labels an enum, and leaves an unknown code alone", () => {
    const f = field({ data_type: "enum", enum_source: "sex" });
    expect(formatReportValue(f, "female")).toBe("Female");
    expect(formatReportValue(f, "unstated")).toBe("unstated");
  });

  it("labels a grade level, Kindergarten included", () => {
    const f = field({ data_type: "number", enum_source: "grade_level" });
    expect(formatReportValue(f, 5)).toBe("Grade 5");
    expect(formatReportValue(f, 0)).toBe("Kindergarten");
  });
});

describe("orderedFields", () => {
  const dataset = {
    fields: [
      field({ field_key: "lrn", label: "LRN" }),
      field({ field_key: "full_name", label: "Name" }),
    ],
  } as ReportDataset;

  it("keeps the order the user picked, not the catalogue's", () => {
    expect(
      orderedFields(dataset, ["full_name", "lrn"]).map((f) => f.field_key),
    ).toEqual(["full_name", "lrn"]);
  });

  it("drops a column the dataset does not have", () => {
    expect(orderedFields(dataset, ["lrn", "salary"]).map((f) => f.field_key)).toEqual([
      "lrn",
    ]);
  });
});

describe("toExportRows", () => {
  const fields = [
    field({ field_key: "full_name", label: "Name" }),
    field({ field_key: "is_4ps", label: "4Ps", data_type: "boolean" }),
    field({ field_key: "section_name", label: "Section" }),
  ];

  it("keys by label, in the chosen order, with blanks empty rather than dashed", () => {
    const rows = toExportRows(fields, [
      { full_name: "DELA CRUZ, JUAN", is_4ps: true, section_name: null },
    ]);

    expect(Object.keys(rows[0])).toEqual(["Name", "4Ps", "Section"]);
    expect(rows[0]).toEqual({
      Name: "DELA CRUZ, JUAN",
      "4Ps": "Yes",
      Section: "",
    });
  });

  it("takes its headers from the same list", () => {
    expect(exportHeaders(fields)).toEqual(["Name", "4Ps", "Section"]);
  });
});
