import { describe, expect, it } from "vitest";
import {
  ALL_DISTRICTS,
  OVERVIEW_COUNT_KEYS,
  beneficiariesByDistrict,
  sumOverview,
  topSchoolsByBeneficiaries,
  type SbfpOverviewSchool,
} from "@/lib/utils/sbfpOverview";
import { buildSbfpInfographic, sbfpInfographicFilename } from "../generateSbfpInfographic";

const school = (id: number, district: string | null, beneficiaries: number): SbfpOverviewSchool => ({
  ...(Object.fromEntries(OVERVIEW_COUNT_KEYS.map((k) => [k, 0])) as Record<
    (typeof OVERVIEW_COUNT_KEYS)[number],
    number
  >),
  beneficiaries,
  male: beneficiaries,
  school_id: String(id),
  school_name: `School ${id}`,
  district,
  program_id: beneficiaries > 0 ? String(id) : null,
  is_last_mile_school: null,
  feeding_start_date: null,
  feeding_end_date: null,
  has_grade_band: true,
});

const input = (schools: SbfpOverviewSchool[]) => ({
  schoolYear: "2026-2027",
  district: ALL_DISTRICTS,
  bandLabel: null,
  totals: sumOverview(schools),
  schools,
  nutrition: [],
  learnerNutrition: [],
  generatedAt: new Date("2026-11-05"),
});

describe("beneficiariesByDistrict", () => {
  it("adds up to the headline total, with unmatched schools under Other", () => {
    const rows = [school(1, "Central District", 10), school(2, "north", 5), school(3, "Somewhere", 2)];
    const groups = beneficiariesByDistrict(rows);
    expect(groups.map((g) => g.label)).toEqual(["Central", "North", "South", "East", "West", "Other"]);
    expect(groups.reduce((sum, g) => sum + g.beneficiaries, 0)).toBe(sumOverview(rows).beneficiaries);
  });

  it("leaves Other out when no school falls under it", () => {
    expect(beneficiariesByDistrict([school(1, "East", 3)]).map((g) => g.label)).not.toContain("Other");
  });
});

describe("topSchoolsByBeneficiaries", () => {
  it("ranks only the schools feeding, largest first, without reordering its input", () => {
    const rows = [school(1, "East", 3), school(2, "East", 0), school(3, "East", 9)];
    expect(topSchoolsByBeneficiaries(rows).map((g) => g.label)).toEqual(["School 3", "School 1"]);
    expect(rows[0].school_id).toBe("1");
  });
});

describe("buildSbfpInfographic", () => {
  it("fits one page with figures and with no figures at all", () => {
    expect(buildSbfpInfographic(input([])).getNumberOfPages()).toBe(1);
    expect(buildSbfpInfographic(input([school(1, "Central", 1234567)])).getNumberOfPages()).toBe(1);
  });

  it("names the file after its filters", () => {
    expect(sbfpInfographicFilename(input([]))).toBe("SBFP-Infographic-2026-2027.pdf");
    expect(
      sbfpInfographicFilename({ schoolYear: "2026-2027", district: "North", bandLabel: "Elementary (K-G6)" }),
    ).toBe("SBFP-Infographic-2026-2027-North-Elementary-K-G6.pdf");
  });
});
