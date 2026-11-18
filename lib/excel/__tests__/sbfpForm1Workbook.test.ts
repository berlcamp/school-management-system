/**
 * SBFP Form 1 Excel downloads, built from synthetic learners (never real ones).
 * Pins that the sheet carries the printout's column heads and figures, with the
 * measurements written as numbers.
 */

import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  buildSbfpForm1Rows,
  buildSbfpForm1Workbook,
  sbfpForm1Filename,
} from "@/lib/excel/generateSbfpForm1Workbook";
import type { SbfpHeaderInfo } from "@/lib/pdf/generateSbfpForms";
import type { FeedingAttendance, SbfpBeneficiaryView } from "@/lib/utils/sbfp";

const info: SbfpHeaderInfo = {
  schoolName: "Sample Central Elementary School",
  depedSchoolId: "999999",
  region: "Caraga",
  division: "Sample Division",
  district: "Sample District",
  municipalityBarangay: "Sample City / Poblacion",
  schoolYear: "2026-2027",
  principalName: "Head Person",
  principalTitle: "School Principal I",
  focalPersonName: "Focal Person",
  feedingStartDate: "2026-06-15",
  feedingEndDate: null,
  midlineWeighingDate: "2026-10-15",
  isLastMileSchool: false,
};

const older: SbfpBeneficiaryView = {
  id: "b1",
  student_id: "s1",
  section_id: "sec1",
  name: "LEARNER, ONE A.",
  lrn: null,
  sex: "male",
  date_of_birth: "2019-01-10",
  grade_level: 1,
  section_name: "Alpha",
  classification: "primary",
  is_pregnant: false,
  has_infant: false,
  is_dewormed: true,
  milk_consent: true,
  is_previous_beneficiary: false,
  is_pardo: false,
  is_indigent: false,
  is_4ps: true,
  is_ip: false,
  milk_tolerance: "none",
  baseline: {
    measured_at: "2026-07-01",
    height_cm: 110,
    weight_kg: 15,
    nutritional_status: "wasted",
    height_for_age: "stunted",
  },
  midline: null,
  endline: {
    measured_at: "2027-02-15",
    height_cm: 113,
    weight_kg: 18,
    nutritional_status: "normal",
    height_for_age: "stunted",
  },
};

const younger: SbfpBeneficiaryView = {
  ...older,
  id: "b2",
  student_id: "s2",
  name: "LEARNER, TWO B.",
  sex: "female",
  date_of_birth: "2021-05-01",
  grade_level: 0,
  section_name: "Kinder A",
  classification: "secondary",
  milk_consent: null,
};

const findRow = (aoa: unknown[][], name: string) => aoa.find((r) => r[1] === name)!;

describe("Form 1A Excel", () => {
  const { aoa } = buildSbfpForm1Rows("1A", info, [older, younger]);

  it("carries the baseline title and the printout's column heads", () => {
    expect(aoa[0][0]).toBe("SBFP Form 1A (2026)");
    expect(String(aoa[4][0])).toContain("( SY 2026-2027 ) - BASELINE");
    const heads = aoa.find((r) => r[0] === "No.")!;
    expect(heads).toContain("BMI for 6 y.o. and above");
    expect(heads).toContain("Beneficiary of SBFP in Previous Years (yes or no)");
  });

  it("writes measurements as numbers and BMI only from age six", () => {
    const one = findRow(aoa, "LEARNER, ONE A.");
    expect(one.slice(2, 12)).toEqual([
      "M", "1/ALPHA", "01/10/2019", "07/01/2026", "7 y 5 m", 15, 110, 12.4, "Wasted", "Stunted",
    ]);
    expect(one.slice(12)).toEqual(["Primary", "No", "No", "Yes", "Yes", "Yes", "No"]);
    const two = findRow(aoa, "LEARNER, TWO B.");
    expect(two[9]).toBeNull();
    expect(two[16]).toBe("");
  });

  it("ends with the focal person and the school head", () => {
    expect(aoa.some((r) => r[1] === "Focal Person" && r[7] === "Head Person")).toBe(true);
  });
});

describe("Form 1B / midline Excel", () => {
  const attendance = new Map<string, FeedingAttendance>([
    ["b1", { present: 40, feedingDays: 50, percent: 80 }],
    ["b2", { present: 45, feedingDays: 50, percent: 90 }],
  ]);

  it("puts the endline reading beside attendance and averages it", () => {
    const { aoa } = buildSbfpForm1Rows("1B", info, [older, younger], attendance);
    expect(aoa[0][0]).toBe("SBFP Form 1B (2026)");
    const one = findRow(aoa, "LEARNER, ONE A.");
    expect(one.slice(7, 9)).toEqual([18, 113]);
    expect(one.slice(12)).toEqual([40, 50, 80]);
    const avg = aoa.find((r) => r[0] === "Average Percent Attendance")!;
    expect(avg[14]).toBe(85);
  });

  it("captions the midline list as a master list", () => {
    const { aoa } = buildSbfpForm1Rows("1M", info, [older], attendance);
    expect(aoa[0][0]).toBe("SBFP Master List (2026)");
    expect(String(aoa[4][0])).toContain("- MIDLINE");
    // No midline weighing recorded: the reading cells are blank, attendance is not.
    const one = findRow(aoa, "LEARNER, ONE A.");
    expect(one[7]).toBeNull();
    expect(one.slice(12)).toEqual([40, 50, 80]);
  });
});

describe("division-wide list", () => {
  const schoolOf = (r: SbfpBeneficiaryView) => (r.id === "b1" ? "School A" : "School B");
  const attendance = new Map<string, FeedingAttendance>([
    ["b1", { present: 40, feedingDays: 50, percent: 80 }],
  ]);

  it("adds a School column after No. and keeps the other columns in order", () => {
    const { aoa, merges } = buildSbfpForm1Rows("1B", info, [older, younger], attendance, {
      schoolOf,
    });
    const heads = aoa.find((r) => r[0] === "No.")!;
    expect(heads.slice(0, 3)).toEqual(["No.", "School", "Name"]);
    expect(heads).toHaveLength(16);
    const one = aoa.find((r) => r[2] === "LEARNER, ONE A.")!;
    expect(one[1]).toBe("School A");
    expect(one.slice(8, 10)).toEqual([18, 113]);
    expect(one.slice(13)).toEqual([40, 50, 80]);
    const sub = aoa[aoa.indexOf(heads) + 1];
    expect(sub[11]).toBe("BMI-A");
    expect(sub[13]).toBe("Days Present (A)");
    // Attendance group head spans its three columns, shifted by one.
    expect(merges).toContainEqual({ s: { r: aoa.indexOf(heads), c: 13 }, e: { r: aoa.indexOf(heads), c: 15 } });
    const avg = aoa.find((r) => r[0] === "Average Percent Attendance")!;
    expect(avg[15]).toBe(80);
  });

  it("names the file for all schools", () => {
    expect(sbfpForm1Filename("1A", info, true)).toBe(
      "SBFP_Form_1A_Baseline_All_Schools_SY2026-2027.xlsx",
    );
  });
});

describe("workbook", () => {
  it("round-trips through xlsx with numeric cells", () => {
    const wb = buildSbfpForm1Workbook("1A", info, [older]);
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const back = XLSX.read(out, { type: "array" });
    const ws = back.Sheets[back.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
    const one = rows.find((r) => r[1] === "LEARNER, ONE A.")!;
    expect(one[7]).toBe(15);
    expect(ws["!merges"]?.length).toBeGreaterThan(0);
  });

  it("names the file after the form, school and year", () => {
    expect(sbfpForm1Filename("1B", info)).toBe("SBFP_Form_1B_Endline_999999_SY2026-2027.xlsx");
  });
});
