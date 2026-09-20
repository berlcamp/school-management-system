import { describe, expect, it } from "vitest";

import {
  TITLE_BAND_MAX_MM,
  TITLE_BAND_MIN_MM,
  clipTitle,
  titleBandMm,
} from "@/lib/pdf/generateClassRecord";

/** The band is the height of the header strip the rotated titles read up. */
describe("the class record's activity-title band", () => {
  it("keeps the form's own band for the short labels teachers usually type", () => {
    expect(titleBandMm(["Quiz 1", "Quiz 2", "ST1", ""])).toBe(TITLE_BAND_MIN_MM);
  });

  it("grows the band so a long label is printed in full", () => {
    const long = "Performance Task on Oral Reading Fluency"; // 40 chars
    const band = titleBandMm([long, "Quiz 1"]);
    expect(band).toBeGreaterThan(TITLE_BAND_MIN_MM);
    // Printed whole: the fix is that this is no longer chopped at ~23 chars.
    expect(clipTitle(long, band)).toBe(long);
  });

  it("never grows past the cap — the band would eat the learner rows", () => {
    const band = titleBandMm(["x".repeat(200)]);
    expect(band).toBe(TITLE_BAND_MAX_MM);
  });

  it("marks a label too long even for the cap instead of cutting it silently", () => {
    const band = TITLE_BAND_MAX_MM;
    const huge = "Summative Assessment on the Elements of a Short Story and Poetry";
    const out = clipTitle(huge, band);
    expect(out).not.toBe(huge);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThan(huge.length);
  });

  it("leaves a label that fits exactly alone", () => {
    const band = titleBandMm(["Quiz on Subject-Verb Agreement"]);
    expect(clipTitle("Quiz on Subject-Verb Agreement", band)).toBe(
      "Quiz on Subject-Verb Agreement",
    );
  });
});
