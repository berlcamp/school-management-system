import { describe, expect, it } from "vitest";
import { ECCD_AGE_BANDS, eccdReferenceTable } from "@/lib/constants/eccd";
import {
  ECCD_OFFICIAL_DOMAIN_CODES,
  eccdAgeBandFor,
  eccdAgeInMonths,
  eccdDomainScoring,
  eccdOfficialItemCount,
  eccdScaledScore,
  eccdScaledSum,
  type EccdDomainResult,
} from "@/lib/utils/eccdScale";

const OFFICIAL_ITEMS: Record<string, number> = { GM: 13, FM: 11, SH: 27, RL: 5, EL: 8, COG: 21, SE: 24 };

describe("eccdAgeInMonths", () => {
  it("counts whole months and does not credit an unreached birthday", () => {
    expect(eccdAgeInMonths("2019-12-20", "2025-06-01")).toBe(65); // 5y5m
    expect(eccdAgeInMonths("2019-12-20", "2025-12-19")).toBe(71); // day before, still 5y11m
    expect(eccdAgeInMonths("2019-12-20", "2025-12-20")).toBe(72); // 6y0m
  });

  it("returns null rather than a number it cannot stand behind", () => {
    expect(eccdAgeInMonths(null, "2025-06-01")).toBeNull();
    expect(eccdAgeInMonths("", "2025-06-01")).toBeNull();
    expect(eccdAgeInMonths("2027-01-01", "2025-06-01")).toBeNull(); // not yet born
  });
});

describe("eccdAgeBandFor", () => {
  it("picks the band the learner's age falls in", () => {
    expect(eccdAgeBandFor("2020-05-01", "2025-06-01")?.id).toBe("5.1-5.11"); // 5y1m
    expect(eccdAgeBandFor("2021-01-01", "2025-06-01")?.id).toBe("4.1-5.0"); // 4y5m
  });

  it("clamps a learner past the top band rather than blanking the card", () => {
    // Six by the second administration is ordinary in Kindergarten, and the
    // issued sample card scores exactly such a learner on the upper band.
    expect(eccdAgeBandFor("2019-12-20", "2026-03-31")?.id).toBe("5.1-5.11"); // 6y3m
    expect(eccdAgeBandFor("2022-01-01", "2025-06-01")?.id).toBe("4.1-5.0"); // 3y5m
  });

  it("has no band without a birth date", () => {
    expect(eccdAgeBandFor(null, "2025-06-01")).toBeNull();
  });
});

describe("eccdDomainScoring", () => {
  it("scores a domain whose code and active item count match the official checklist", () => {
    Object.entries(OFFICIAL_ITEMS).forEach(([code, n]) => {
      expect(eccdOfficialItemCount(code)).toBe(n);
      expect(eccdDomainScoring(code, n).scored, code).toBe(true);
    });
  });

  it("tolerates case and stray spaces in a typed code", () => {
    expect(eccdDomainScoring(" gm ", 13).scored).toBe(true);
  });

  it("refuses a domain with an item added or deactivated", () => {
    const added = eccdDomainScoring("GM", 14);
    expect(added.scored).toBe(false);
    if (!added.scored) expect(added.reason).toContain("expects 13");
    expect(eccdDomainScoring("RL", 4).scored).toBe(false);
  });

  it("refuses a code DepEd publishes no table for", () => {
    const res = eccdDomainScoring("MUSIC", 5);
    expect(res.scored).toBe(false);
    expect(eccdOfficialItemCount("MUSIC")).toBeNull();
  });
});

describe("eccdScaledScore", () => {
  it("converts the same raw score differently per band", () => {
    expect(eccdScaledScore("GM", 13, 13, "4.1-5.0")).toBe("13");
    expect(eccdScaledScore("GM", 13, 13, "5.1-5.11")).toBe("11");
  });

  it("is blank with no band, rather than guessing the learner's age", () => {
    expect(eccdScaledScore("GM", 13, 13, null)).toBe("");
  });

  it("is blank once the checklist has drifted, even for a raw score on the table", () => {
    expect(eccdScaledScore("GM", 14, 5, "5.1-5.11")).toBe("");
    expect(eccdScaledScore("GM", 12, 5, "5.1-5.11")).toBe("");
  });

  it("is blank for a raw score off the table", () => {
    expect(eccdScaledScore("GM", 13, 14, "5.1-5.11")).toBe("");
  });
});

describe("eccdScaledSum", () => {
  const all = (raw: number): EccdDomainResult[] =>
    ECCD_OFFICIAL_DOMAIN_CODES.map((code) => ({ code, activeItemCount: OFFICIAL_ITEMS[code], rawScore: Math.min(raw, OFFICIAL_ITEMS[code]) }));

  it("sums the seven scaled scores", () => {
    // every domain at its maximum, 5.1-5.11: 11 + 12 + 13 + 11 + 11 + 13 + 13
    expect(eccdScaledSum(all(99), "5.1-5.11")).toBe("84");
  });

  it("is blank when an official domain is missing, rather than a partial sum", () => {
    expect(eccdScaledSum(all(99).filter((d) => d.code !== "SE"), "5.1-5.11")).toBe("");
  });

  it("is blank when any one domain cannot be scored", () => {
    const drifted = all(99).map((d) => (d.code === "FM" ? { ...d, activeItemCount: 12 } : d));
    expect(eccdScaledSum(drifted, "5.1-5.11")).toBe("");
  });

  it("leaves a domain outside the seven out of the sum", () => {
    expect(eccdScaledSum([...all(99), { code: "MUSIC", activeItemCount: 5, rawScore: 5 }], "5.1-5.11")).toBe("84");
  });

  it("is blank with no band", () => {
    expect(eccdScaledSum(all(99), null)).toBe("");
  });
});

describe("the published conversion tables", () => {
  it("reproduces every scaled score on the completed sample card", () => {
    // Band 5.1-5.11, from the filled-in checklist the layout was built from.
    const expected: [string, number, number][] = [
      ["GM", 13, 11], ["FM", 8, 7], ["FM", 11, 12], ["SH", 25, 10],
      ["RL", 4, 8], ["RL", 5, 11], ["COG", 8, 1], ["COG", 16, 8],
      ["SE", 22, 10], ["SE", 24, 13],
    ];
    expected.forEach(([code, raw, scaled]) => {
      expect(eccdReferenceTable("5.1-5.11", code)?.[raw], `${code} raw ${raw}`).toBe(scaled);
    });
  });

  it("follows ECD_Scaled_and_Standard_Scores.xlsx for Socio-Emotional at 4.1-5.0", () => {
    // The one column the two source workbooks disagreed on; the later file wins.
    const se = eccdReferenceTable("4.1-5.0", "SE")!;
    expect([17, 18, 19, 24].map((raw) => se[raw])).toEqual([5, 6, 7, 12]);
  });

  it("differs between bands", () => {
    expect(eccdReferenceTable("4.1-5.0", "GM")?.[13]).toBe(13);
    expect(eccdReferenceTable("5.1-5.11", "GM")?.[13]).toBe(11);
  });

  it("publishes a gap-free run for every band and domain", () => {
    ECCD_AGE_BANDS.forEach((band) => {
      ["GM", "FM", "SH", "RL", "EL", "COG", "SE"].forEach((code) => {
        const table = eccdReferenceTable(band.id, code);
        expect(table, `${band.id} ${code}`).toBeDefined();
        expect(table!.length).toBeGreaterThan(0);
        expect(table!.every((v) => typeof v === "number"), `${band.id} ${code} has a gap`).toBe(true);
      });
    });
  });

  it("tops out at the official item count for each domain", () => {
    const maxRaw: Record<string, number> = { GM: 13, FM: 11, SH: 27, RL: 5, EL: 8, COG: 21, SE: 24 };
    ECCD_AGE_BANDS.forEach((band) => {
      Object.entries(maxRaw).forEach(([code, max]) => {
        expect(eccdReferenceTable(band.id, code)!.length - 1, `${band.id} ${code}`).toBe(max);
      });
    });
  });
});
