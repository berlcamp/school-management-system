import { describe, expect, it } from "vitest";
import { pacePageHref, usesPaceForm } from "../pace";

describe("usesPaceForm", () => {
  it("is true for Grade 1, however the level arrives", () => {
    expect(usesPaceForm(1)).toBe(true);
    // grade_level has been seen stored as text (migration 157)
    expect(usesPaceForm("1")).toBe(true);
  });

  it.each([0, 2, 6, 12, null, undefined, "", "K"])("is false for %s", (level) => {
    expect(usesPaceForm(level)).toBe(false);
  });
});

describe("pacePageHref", () => {
  it("opens the PACE page on the section and school year", () => {
    expect(pacePageHref("42", "2026-2027")).toBe(
      "/teacher/pace?section=42&school_year=2026-2027",
    );
  });

  it("encodes its parameters", () => {
    expect(pacePageHref("4 2", "2026/2027")).toBe(
      "/teacher/pace?section=4%202&school_year=2026%2F2027",
    );
  });
});
