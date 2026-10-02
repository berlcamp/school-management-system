import { describe, expect, it } from "vitest";
import { suggestCatalogueMatch, textSimilarity } from "@/lib/utils/catalogueMatch";

const cands = [
  { id: "1", lc_code: "M5NS-IA-1", competency_text: "Visualizes and represents fractions" },
  { id: "2", lc_code: "M5NS-IB-2", competency_text: "Adds similar fractions and mixed numbers" },
];

describe("suggestCatalogueMatch", () => {
  it("prefers an exact LC code, however it was typed", () => {
    expect(suggestCatalogueMatch({ competency_text: "anything", lc_code: " m5ns-ib-2" }, cands)?.id).toBe("2");
  });
  it("falls back to the closest text above the threshold", () => {
    expect(suggestCatalogueMatch({ competency_text: "adds similar fractions", lc_code: null }, cands)?.id).toBe("2");
  });
  it("suggests nothing for unrelated text", () => {
    expect(suggestCatalogueMatch({ competency_text: "Photosynthesis in plants", lc_code: "" }, cands)).toBeNull();
  });
});

describe("textSimilarity", () => {
  it("is 1 for the same words and 0 for none shared", () => {
    expect(textSimilarity("Adds fractions", "adds FRACTIONS!")).toBe(1);
    expect(textSimilarity("Adds fractions", "Reads poems")).toBe(0);
  });
});
