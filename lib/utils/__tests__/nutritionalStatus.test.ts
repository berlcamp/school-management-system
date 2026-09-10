/**
 * The nutritional status calculator, checked against WHO's own published
 * numbers rather than against itself.
 *
 * WHO publishes both the L/M/S parameters this module ships and the SD cutoff
 * columns derived from them. `WHO_PUBLISHED_CUTOFFS` below is transcribed from
 * those cutoff columns; feeding one back through `zScore` must return the z it
 * was printed under. That is the assertion that would catch a mistyped
 * parameter, a table stitched at the wrong month, or a row off by one.
 */

import { describe, expect, it } from "vitest";
import {
  BMI_FOR_AGE_FEMALE,
  BMI_FOR_AGE_MALE,
  HEIGHT_FOR_AGE_FEMALE,
  HEIGHT_FOR_AGE_MALE,
  LMS_FIRST_MONTH,
  LMS_LAST_MONTH,
} from "@/lib/constants/whoGrowthReference";
import {
  ageInMonths,
  assessGrowth,
  bodyMassIndex,
  classifyBmiForAge,
  classifyHeightForAge,
  formatAge,
  formatZ,
  zScore,
} from "@/lib/utils/nutritionalStatus";

const WHO_PUBLISHED_CUTOFFS = {
  bmiMale: [
    { month: 24, cutoffs: { "0": 16.019, "1": 17.349, "2": 18.868, "3": 20.615, "-3": 12.879, "-2": 13.806, "-1": 14.846 } },
    { month: 42, cutoffs: { "0": 15.442, "1": 16.755, "2": 18.215, "3": 19.844, "-3": 12.224, "-2": 13.191, "-1": 14.26 } },
    { month: 60, cutoffs: { "0": 15.192, "1": 16.617, "2": 18.285, "3": 20.256, "-3": 11.95, "-2": 12.89, "-1": 13.961 } },
    { month: 61, cutoffs: { "0": 15.264, "1": 16.645, "2": 18.259, "3": 20.166, "-3": 12.118, "-2": 13.031, "-1": 14.071 } },
    { month: 78, cutoffs: { "0": 15.382, "1": 16.888, "2": 18.745, "3": 21.097, "-3": 12.189, "-2": 13.086, "-1": 14.136 } },
    { month: 96, cutoffs: { "0": 15.737, "1": 17.437, "2": 19.675, "3": 22.785, "-3": 12.394, "-2": 13.302, "-1": 14.394 } },
    { month: 114, cutoffs: { "0": 16.233, "1": 18.179, "2": 20.916, "3": 25.149, "-3": 12.661, "-2": 13.603, "-1": 14.763 } },
    { month: 132, cutoffs: { "0": 16.939, "1": 19.163, "2": 22.452, "3": 28.027, "-3": 13.051, "-2": 14.056, "-1": 15.312 } },
    { month: 150, cutoffs: { "0": 17.87, "1": 20.375, "2": 24.165, "3": 30.854, "-3": 13.588, "-2": 14.684, "-1": 16.063 } },
    { month: 168, cutoffs: { "0": 19.005, "1": 21.77, "2": 25.918, "3": 33.084, "-3": 14.261, "-2": 15.475, "-1": 17.004 } },
    { month: 186, cutoffs: { "0": 20.143, "1": 23.116, "2": 27.441, "3": 34.452, "-3": 14.916, "-2": 16.265, "-1": 17.954 } },
    { month: 204, cutoffs: { "0": 21.142, "1": 24.269, "2": 28.63, "3": 35.187, "-3": 15.441, "-2": 16.933, "-1": 18.782 } },
    { month: 222, cutoffs: { "0": 21.958, "1": 25.193, "2": 29.496, "3": 35.492, "-3": 15.784, "-2": 17.429, "-1": 19.442 } },
    { month: 228, cutoffs: { "0": 22.188, "1": 25.449, "2": 29.716, "3": 35.516, "-3": 15.855, "-2": 17.554, "-1": 19.622 } },
  ],
  bmiFemale: [
    { month: 24, cutoffs: { "0": 15.688, "1": 17.108, "2": 18.74, "3": 20.631, "-3": 12.379, "-2": 13.349, "-1": 14.445 } },
    { month: 42, cutoffs: { "0": 15.312, "1": 16.761, "2": 18.437, "3": 20.392, "-3": 11.969, "-2": 12.944, "-1": 14.05 } },
    { month: 60, cutoffs: { "0": 15.275, "1": 16.893, "2": 18.798, "3": 21.063, "-3": 11.642, "-2": 12.687, "-1": 13.887 } },
    { month: 61, cutoffs: { "0": 15.244, "1": 16.87, "2": 18.858, "3": 21.34, "-3": 11.77, "-2": 12.748, "-1": 13.891 } },
    { month: 78, cutoffs: { "0": 15.32, "1": 17.131, "2": 19.482, "3": 22.668, "-3": 11.725, "-2": 12.704, "-1": 13.879 } },
    { month: 96, cutoffs: { "0": 15.681, "1": 17.73, "2": 20.561, "3": 24.781, "-3": 11.879, "-2": 12.884, "-1": 14.12 } },
    { month: 114, cutoffs: { "0": 16.343, "1": 18.666, "2": 22.031, "3": 27.459, "-3": 12.231, "-2": 13.296, "-1": 14.625 } },
    { month: 132, cutoffs: { "0": 17.246, "1": 19.859, "2": 23.725, "3": 30.189, "-3": 12.727, "-2": 13.885, "-1": 15.343 } },
    { month: 150, cutoffs: { "0": 18.399, "1": 21.305, "2": 25.596, "3": 32.708, "-3": 13.379, "-2": 14.663, "-1": 16.282 } },
    { month: 168, cutoffs: { "0": 19.565, "1": 22.731, "2": 27.321, "3": 34.66, "-3": 14.026, "-2": 15.448, "-1": 17.238 } },
    { month: 186, cutoffs: { "0": 20.477, "1": 23.832, "2": 28.58, "3": 35.844, "-3": 14.488, "-2": 16.037, "-1": 17.976 } },
    { month: 204, cutoffs: { "0": 21.037, "1": 24.503, "2": 29.283, "3": 36.281, "-3": 14.701, "-2": 16.354, "-1": 18.411 } },
    { month: 222, cutoffs: { "0": 21.348, "1": 24.873, "2": 29.602, "3": 36.235, "-3": 14.733, "-2": 16.477, "-1": 18.63 } },
    { month: 228, cutoffs: { "0": 21.427, "1": 24.965, "2": 29.67, "3": 36.179, "-3": 14.724, "-2": 16.497, "-1": 18.681 } },
  ],
  heightMale: [
    { month: 24, cutoffs: { "0": 87.13, "1": 90.187, "2": 93.243, "3": 96.3, "-3": 77.961, "-2": 81.017, "-1": 84.074 } },
    { month: 42, cutoffs: { "0": 99.844, "1": 103.808, "2": 107.772, "3": 111.736, "-3": 87.953, "-2": 91.916, "-1": 95.88 } },
    { month: 60, cutoffs: { "0": 109.959, "1": 114.593, "2": 119.227, "3": 123.86, "-3": 96.058, "-2": 100.692, "-1": 105.326 } },
    { month: 61, cutoffs: { "0": 110.265, "1": 114.856, "2": 119.448, "3": 124.039, "-3": 96.49, "-2": 101.082, "-1": 105.673 } },
    { month: 78, cutoffs: { "0": 118.87, "1": 123.975, "2": 129.081, "3": 134.186, "-3": 103.554, "-2": 108.659, "-1": 113.765 } },
    { month: 96, cutoffs: { "0": 127.265, "1": 132.913, "2": 138.561, "3": 144.209, "-3": 110.321, "-2": 115.969, "-1": 121.617 } },
    { month: 114, cutoffs: { "0": 135.183, "1": 141.377, "2": 147.571, "3": 153.765, "-3": 116.601, "-2": 122.795, "-1": 128.989 } },
    { month: 132, cutoffs: { "0": 143.113, "1": 149.843, "2": 156.574, "3": 163.304, "-3": 122.921, "-2": 129.651, "-1": 136.382 } },
    { month: 150, cutoffs: { "0": 152.442, "1": 159.703, "2": 166.964, "3": 174.225, "-3": 130.66, "-2": 137.921, "-1": 145.182 } },
    { month: 168, cutoffs: { "0": 163.182, "1": 170.874, "2": 178.566, "3": 186.259, "-3": 140.104, "-2": 147.797, "-1": 155.489 } },
    { month: 186, cutoffs: { "0": 171.147, "1": 178.949, "2": 186.752, "3": 194.555, "-3": 147.739, "-2": 155.542, "-1": 163.344 } },
    { month: 204, cutoffs: { "0": 175.161, "1": 182.805, "2": 190.449, "3": 198.093, "-3": 152.229, "-2": 159.873, "-1": 167.517 } },
    { month: 222, cutoffs: { "0": 176.385, "1": 183.767, "2": 191.149, "3": 198.53, "-3": 154.24, "-2": 161.622, "-1": 169.003 } },
    { month: 228, cutoffs: { "0": 176.543, "1": 183.841, "2": 191.14, "3": 198.438, "-3": 154.648, "-2": 161.947, "-1": 169.245 } },
  ],
  heightFemale: [
    { month: 24, cutoffs: { "0": 85.73, "1": 88.957, "2": 92.184, "3": 95.411, "-3": 76.049, "-2": 79.276, "-1": 82.503 } },
    { month: 42, cutoffs: { "0": 99.037, "1": 103.102, "2": 107.168, "3": 111.233, "-3": 86.841, "-2": 90.906, "-1": 94.971 } },
    { month: 60, cutoffs: { "0": 109.419, "1": 114.174, "2": 118.93, "3": 123.685, "-3": 95.153, "-2": 99.908, "-1": 104.664 } },
    { month: 61, cutoffs: { "0": 109.602, "1": 114.375, "2": 119.148, "3": 123.921, "-3": 95.282, "-2": 100.055, "-1": 104.828 } },
    { month: 78, cutoffs: { "0": 117.977, "1": 123.273, "2": 128.569, "3": 133.865, "-3": 102.089, "-2": 107.385, "-1": 112.681 } },
    { month: 96, cutoffs: { "0": 126.556, "1": 132.353, "2": 138.151, "3": 143.948, "-3": 109.163, "-2": 114.961, "-1": 120.758 } },
    { month: 114, cutoffs: { "0": 135.541, "1": 141.799, "2": 148.057, "3": 154.315, "-3": 116.767, "-2": 123.025, "-1": 129.283 } },
    { month: 132, cutoffs: { "0": 144.993, "1": 151.639, "2": 158.286, "3": 164.932, "-3": 125.053, "-2": 131.7, "-1": 138.346 } },
    { month: 150, cutoffs: { "0": 154.004, "1": 160.908, "2": 167.812, "3": 174.716, "-3": 133.292, "-2": 140.196, "-1": 147.1 } },
    { month: 168, cutoffs: { "0": 159.789, "1": 166.732, "2": 173.675, "3": 180.617, "-3": 138.961, "-2": 145.903, "-1": 152.846 } },
    { month: 186, cutoffs: { "0": 162.188, "1": 169.023, "2": 175.857, "3": 182.692, "-3": 141.684, "-2": 148.519, "-1": 155.353 } },
    { month: 204, cutoffs: { "0": 162.854, "1": 169.546, "2": 176.238, "3": 182.93, "-3": 142.779, "-2": 149.471, "-1": 156.163 } },
    { month: 222, cutoffs: { "0": 163.128, "1": 169.702, "2": 176.276, "3": 182.85, "-3": 143.406, "-2": 149.98, "-1": 156.554 } },
    { month: 228, cutoffs: { "0": 163.155, "1": 169.696, "2": 176.237, "3": 182.777, "-3": 143.532, "-2": 150.073, "-1": 156.614 } },
  ],
};

const TABLES = {
  bmiMale: BMI_FOR_AGE_MALE,
  bmiFemale: BMI_FOR_AGE_FEMALE,
  heightMale: HEIGHT_FOR_AGE_MALE,
  heightFemale: HEIGHT_FOR_AGE_FEMALE,
} as const;

describe("WHO reference tables", () => {
  it("carries one row per month from 2 to 19 years", () => {
    expect(LMS_FIRST_MONTH).toBe(24);
    expect(LMS_LAST_MONTH).toBe(228);
    for (const table of Object.values(TABLES)) {
      expect(table).toHaveLength(LMS_LAST_MONTH - LMS_FIRST_MONTH + 1);
      for (const [l, m, s] of table) {
        expect(Number.isFinite(l)).toBe(true);
        expect(m).toBeGreaterThan(0);
        expect(s).toBeGreaterThan(0);
      }
    }
  });

  it("reproduces WHO's published cutoffs to their printed rounding", () => {
    for (const [name, rows] of Object.entries(WHO_PUBLISHED_CUTOFFS)) {
      const table = TABLES[name as keyof typeof TABLES];
      for (const { month, cutoffs } of rows) {
        const lms = table[month - LMS_FIRST_MONTH];
        for (const [z, cutoff] of Object.entries(cutoffs)) {
          expect(
            zScore(lms, cutoff),
            `${name} at ${month} months, z ${z}`,
          ).toBeCloseTo(Number(z), 2);
        }
      }
    }
  });

  it("joins the two WHO datasets smoothly at 61 months", () => {
    // The 0-5 standards and the 5-19 reference are different datasets; they are
    // stitched where they meet, so the median must not jump at the seam.
    for (const table of [HEIGHT_FOR_AGE_MALE, HEIGHT_FOR_AGE_FEMALE]) {
      const at60 = table[60 - LMS_FIRST_MONTH][1];
      const at61 = table[61 - LMS_FIRST_MONTH][1];
      expect(at61).toBeGreaterThan(at60);
      expect(at61 - at60).toBeLessThan(1); // cm of growth in one month
    }
  });
});

describe("banding", () => {
  it("puts a learner exactly on a cutoff in the upper band", () => {
    // The printed chart reads "below -2SD is Wasted", so -2SD itself is Normal.
    expect(classifyBmiForAge(-2)).toBe("normal");
    expect(classifyBmiForAge(-2.0001)).toBe("wasted");
    expect(classifyBmiForAge(-3)).toBe("wasted");
    expect(classifyBmiForAge(-3.0001)).toBe("severely_wasted");
    expect(classifyBmiForAge(1)).toBe("normal");
    expect(classifyBmiForAge(1.0001)).toBe("overweight");
    expect(classifyBmiForAge(2)).toBe("overweight");
    expect(classifyBmiForAge(2.0001)).toBe("obese");

    expect(classifyHeightForAge(-2)).toBe("normal");
    expect(classifyHeightForAge(-2.0001)).toBe("stunted");
    expect(classifyHeightForAge(-3)).toBe("stunted");
    expect(classifyHeightForAge(-3.0001)).toBe("severely_stunted");
    expect(classifyHeightForAge(2)).toBe("normal");
    expect(classifyHeightForAge(2.0001)).toBe("tall");
  });

  it("bands each WHO cutoff on the side the chart puts it", () => {
    const lms = BMI_FOR_AGE_MALE[120 - LMS_FIRST_MONTH]; // a 10-year-old boy
    const at = (z: number) => lms[1] * Math.pow(1 + lms[0] * lms[2] * z, 1 / lms[0]);
    expect(classifyBmiForAge(zScore(lms, at(-2.5)))).toBe("wasted");
    expect(classifyBmiForAge(zScore(lms, at(-3.5)))).toBe("severely_wasted");
    expect(classifyBmiForAge(zScore(lms, at(0)))).toBe("normal");
    expect(classifyBmiForAge(zScore(lms, at(1.5)))).toBe("overweight");
    expect(classifyBmiForAge(zScore(lms, at(2.5)))).toBe("obese");
  });
});

describe("ageInMonths", () => {
  it("counts completed months, not started ones", () => {
    expect(ageInMonths("2015-06-15", "2026-06-14")).toBe(131); // a day short of 11 y
    expect(ageInMonths("2015-06-15", "2026-06-15")).toBe(132); // 11 y exactly
    expect(ageInMonths("2015-06-15", "2026-07-14")).toBe(132);
    expect(ageInMonths("2015-06-15", "2026-07-15")).toBe(133);
  });

  it("reads the date parts rather than parsing a timestamp", () => {
    // A UTC timestamp must not shift the day locally and cost a month of age.
    expect(ageInMonths("2015-06-15", "2026-06-15T00:00:00Z")).toBe(132);
  });

  it("returns null for a missing or unreadable date", () => {
    expect(ageInMonths(null, "2026-06-15")).toBeNull();
    expect(ageInMonths("2015-06-15", "")).toBeNull();
    expect(ageInMonths("not a date", "2026-06-15")).toBeNull();
    expect(ageInMonths("2027-06-15", "2026-06-15")).toBeNull(); // born later
  });
});

describe("bodyMassIndex", () => {
  it("is kg over metres squared", () => {
    expect(bodyMassIndex(150, 45)).toBeCloseTo(20, 5);
    expect(bodyMassIndex(120, 21.6)).toBeCloseTo(15, 5);
  });

  it("is null unless both measurements are usable", () => {
    expect(bodyMassIndex(150, null)).toBeNull();
    expect(bodyMassIndex(null, 45)).toBeNull();
    expect(bodyMassIndex(0, 45)).toBeNull();
    expect(bodyMassIndex(150, -3)).toBeNull();
    expect(bodyMassIndex(150, Number.NaN)).toBeNull();
  });
});

describe("assessGrowth", () => {
  const learner = {
    dateOfBirth: "2015-06-15",
    gender: "male",
    measuredOn: "2026-06-15", // 11 y 0 m
  };

  it("bands a healthy learner as Normal on both indicators", () => {
    const result = assessGrowth({ ...learner, heightCm: 143.4, weightKg: 34 });
    expect(result.ageMonths).toBe(132);
    expect(result.bmi).toBeCloseTo(16.5, 1);
    expect(result.bmiForAge?.status).toBe("normal");
    expect(result.heightForAge?.status).toBe("normal");
    expect(result.unavailable).toBeNull();
  });

  it("bands a severely wasted learner", () => {
    const result = assessGrowth({ ...learner, heightCm: 143.4, weightKg: 23 });
    expect(result.bmiForAge?.status).toBe("severely_wasted");
    expect(result.bmiForAge?.z).toBeLessThan(-3);
  });

  it("bands an obese learner", () => {
    const result = assessGrowth({ ...learner, heightCm: 143.4, weightKg: 52 });
    expect(result.bmiForAge?.status).toBe("obese");
  });

  it("bands a stunted learner on height alone", () => {
    const result = assessGrowth({ ...learner, heightCm: 125, weightKg: null });
    expect(result.heightForAge?.status).toBe("stunted");
    expect(result.heightForAge?.z).toBeGreaterThan(-3);
    expect(result.heightForAge?.z).toBeLessThan(-2);
    expect(
      assessGrowth({ ...learner, heightCm: 118, weightKg: null }).heightForAge?.status,
    ).toBe("severely_stunted");
    // Height alone is enough for height-for-age; it does not wait for a weight.
    expect(result.bmiForAge).toBeNull();
    expect(result.unavailable).toBeNull();
  });

  it("reads the sex tolerantly", () => {
    for (const gender of ["male", "Male", " MALE ", "m"]) {
      const result = assessGrowth({ ...learner, gender, heightCm: 143.4, weightKg: 34 });
      expect(result.bmiForAge?.status).toBe("normal");
    }
  });

  it("bands the sexes off their own table", () => {
    const male = assessGrowth({ ...learner, heightCm: 150, weightKg: 40 });
    const female = assessGrowth({ ...learner, gender: "female", heightCm: 150, weightKg: 40 });
    expect(male.heightForAge?.z).not.toBeCloseTo(female.heightForAge?.z ?? 0, 3);
  });

  it("says why it cannot compute, rather than guessing", () => {
    expect(
      assessGrowth({ ...learner, gender: null, heightCm: 143.4, weightKg: 34 }).unavailable,
    ).toMatch(/sex/);
    expect(
      assessGrowth({ ...learner, dateOfBirth: null, heightCm: 143.4, weightKg: 34 }).unavailable,
    ).toMatch(/date of birth/);
    expect(
      assessGrowth({ ...learner, dateOfBirth: "2005-06-15", heightCm: 165, weightKg: 60 })
        .unavailable,
    ).toMatch(/outside the WHO reference/);
  });

  it("refuses a height typed in metres, and says so", () => {
    // 25% of the rows already on file carry metres in a column of centimetres.
    // Banding one gives a BMI in the hundreds of thousands and a confident
    // "Obese", which is worse than no answer at all.
    const result = assessGrowth({ ...learner, heightCm: 1.43, weightKg: 34 });
    expect(result.bmiForAge).toBeNull();
    expect(result.heightForAge).toBeNull();
    expect(result.unavailable).toMatch(/looks like metres/);
  });

  it("refuses measurements no learner could have", () => {
    expect(assessGrowth({ ...learner, heightCm: 29.6, weightKg: 34 }).unavailable).toMatch(
      /outside 40–250 cm/,
    );
    expect(assessGrowth({ ...learner, heightCm: 300, weightKg: 34 }).unavailable).toMatch(
      /outside 40–250 cm/,
    );
    expect(assessGrowth({ ...learner, heightCm: 143.4, weightKg: 0.5 }).unavailable).toMatch(
      /outside 2–300 kg/,
    );
  });

  it("accepts the whole plausible range", () => {
    // A Kindergarten learner and a Grade 12 learner must both band.
    expect(
      assessGrowth({
        dateOfBirth: "2020-06-15",
        gender: "female",
        measuredOn: "2026-06-15",
        heightCm: 110,
        weightKg: 18,
      }).bmiForAge,
    ).not.toBeNull();
    expect(
      assessGrowth({
        dateOfBirth: "2008-06-15",
        gender: "male",
        measuredOn: "2026-06-15",
        heightCm: 178,
        weightKg: 70,
      }).bmiForAge,
    ).not.toBeNull();
  });

  it("stays quiet on an untouched row", () => {
    const result = assessGrowth({ ...learner, heightCm: null, weightKg: null });
    expect(result.unavailable).toBeNull();
    expect(result.bmiForAge).toBeNull();
    expect(result.heightForAge).toBeNull();
  });

  it("falls back to today when the row carries no date of weighing", () => {
    const result = assessGrowth({
      dateOfBirth: "2015-06-15",
      gender: "male",
      heightCm: 143.4,
      weightKg: 34,
    });
    expect(result.ageMonths).toBeGreaterThan(120);
    expect(result.bmiForAge).not.toBeNull();
  });
});

describe("formatting", () => {
  it("writes an age and a signed z the way the form reads", () => {
    expect(formatAge(132)).toBe("11 y 0 m");
    expect(formatAge(71)).toBe("5 y 11 m");
    expect(formatZ(-1.4249)).toBe("−1.42");
    expect(formatZ(0.331)).toBe("+0.33");
  });
});
