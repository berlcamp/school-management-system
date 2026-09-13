import { describe, expect, it } from "vitest";
import { ECCD_AGE_BANDS, eccdReferenceTable } from "@/lib/constants/eccd";
import { eccdAgeBandFor, eccdAgeInMonths, eccdScaledScore } from "@/lib/utils/eccdScale";
import type { EccdScaleScore } from "@/types";

function row(
  domain_id: string,
  raw_score: number,
  scale_score: number,
  age_band: string | null = null,
): EccdScaleScore {
  return { id: `${domain_id}-${age_band}-${raw_score}`, domain_id, raw_score, scale_score, age_band, created_at: "", updated_at: "" };
}

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

describe("eccdScaledScore", () => {
  const scores = [
    row("1", 13, 99), // the unbanded mapping a division typed before migration 186
    row("1", 13, 13, "4.1-5.0"),
    row("1", 13, 11, "5.1-5.11"),
    row("2", 4, 8, "5.1-5.11"),
  ];

  it("converts the same raw score differently per band — the bug this fixes", () => {
    expect(eccdScaledScore(scores, "1", 13, "4.1-5.0")).toBe("13");
    expect(eccdScaledScore(scores, "1", 13, "5.1-5.11")).toBe("11");
  });

  it("falls back to an unbanded row, so a pre-186 mapping keeps working", () => {
    expect(eccdScaledScore(scores, "1", 13, null)).toBe("99");
    // domain 2 has a banded row but no unbanded one
    expect(eccdScaledScore(scores, "2", 4, null)).toBe("");
  });

  it("prefers the band over the unbanded row when both exist", () => {
    expect(eccdScaledScore(scores, "1", 13, "5.1-5.11")).toBe("11");
  });

  it("uses the unbanded row when the learner's band has no entry", () => {
    expect(eccdScaledScore(scores, "2", 4, "4.1-5.0")).toBe("");
    expect(eccdScaledScore([...scores, row("2", 4, 7)], "2", 4, "4.1-5.0")).toBe("7");
  });

  it("returns blank for an unmapped raw score rather than guessing", () => {
    expect(eccdScaledScore(scores, "1", 7, "5.1-5.11")).toBe("");
    expect(eccdScaledScore([], "1", 0, null)).toBe("");
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

  it("differs between bands, which is why the column exists", () => {
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
