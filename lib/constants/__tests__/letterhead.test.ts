import { describe, expect, it } from "vitest";

import { DEPED_REGION, letterheadRegion } from "@/lib/constants/letterhead";

describe("the letterhead's region line", () => {
  it("prints the division's region when the school stored none", () => {
    expect(letterheadRegion(null)).toBe(DEPED_REGION);
    expect(letterheadRegion(undefined)).toBe(DEPED_REGION);
    // 72 of the 74 school rows are NULL or an empty string.
    expect(letterheadRegion("")).toBe(DEPED_REGION);
    expect(letterheadRegion("   ")).toBe(DEPED_REGION);
  });

  it("prints the school's own region when it has one", () => {
    expect(letterheadRegion("Region XIII - CARAGA")).toBe("Region XIII - CARAGA");
    expect(letterheadRegion("  Region IV-A - CALABARZON  ")).toBe(
      "Region IV-A - CALABARZON",
    );
  });
});
