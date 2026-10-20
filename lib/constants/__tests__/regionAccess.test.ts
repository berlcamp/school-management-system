import { describe, expect, it } from "vitest";
import { DIVISION_REPORTS } from "@/app/(protected)/division/reports/reportCatalog";
import {
  REGION_DASHBOARD_ITEMS,
  REGION_EXTRA_REPORT_ITEMS,
  regionReportKey,
  regionReportKeyForPath,
} from "../regionAccess";

describe("region access keys (migration 214)", () => {
  it("derives a report's key from its route", () => {
    expect(regionReportKey("/division/reports/absenteeism")).toBe(
      "report:absenteeism",
    );
    expect(regionReportKey("/division/reports/builder/")).toBe("report:builder");
  });

  it("resolves a page, and pages beneath it, to the report it belongs to", () => {
    expect(regionReportKeyForPath("/division/reports/grade-level-teachers")).toBe(
      "report:grade-level-teachers",
    );
    expect(regionReportKeyForPath("/division/reports/schools/12")).toBe(
      "report:schools",
    );
    expect(regionReportKeyForPath("/division/reports")).toBeNull();
    expect(regionReportKeyForPath("/students")).toBeNull();
  });

  it("names, in the catalogue, every key the SQL in 214 checks", () => {
    const keys = new Set([
      ...REGION_DASHBOARD_ITEMS.map((i) => i.key),
      ...REGION_EXTRA_REPORT_ITEMS.map((i) => i.key),
      ...DIVISION_REPORTS.map((r) => regionReportKey(r.href)),
    ]);
    for (const key of [
      "report:absenteeism",
      "report:grade-level-teachers",
      "report:builder",
      "dashboard:document-requests",
    ]) {
      expect(keys.has(key)).toBe(true);
    }
    expect(keys.size).toBe(
      REGION_DASHBOARD_ITEMS.length +
        REGION_EXTRA_REPORT_ITEMS.length +
        DIVISION_REPORTS.length,
    );
  });

  it("never offers the division office's own tools", () => {
    const hrefs = DIVISION_REPORTS.map((r) => r.href);
    expect(hrefs).not.toContain("/division/reports/lock-sy");
    expect(hrefs).not.toContain("/division/reports/class-size-standards");
  });
});
