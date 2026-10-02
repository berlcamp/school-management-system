import { describe, expect, it } from "vitest";
import { catalogueSaveError, unmappedCount } from "@/lib/utils/tosCatalogue";

describe("unmappedCount", () => {
  it("counts typed rows with no catalogue entry and ignores blank rows", () => {
    expect(unmappedCount([
      { catalogue_competency_id: "1", competency_text: "a" },
      { catalogue_competency_id: null, competency_text: "typed before 195" },
      { catalogue_competency_id: null, competency_text: "  " },
    ])).toBe(1);
  });
});

describe("catalogueSaveError", () => {
  const row = (id: string | null) => ({ catalogue_competency_id: id, competency_text: "x" });
  it("requires a learning area", () => {
    expect(catalogueSaveError({ learningAreaId: "", rows: [row("1")] })).toMatch(/learning area/);
  });
  it("requires every competency mapped", () => {
    expect(catalogueSaveError({ learningAreaId: "3", rows: [row("1"), row(null)] })).toMatch(/1 competency/);
  });
  it("refuses the same competency twice", () => {
    expect(catalogueSaveError({ learningAreaId: "3", rows: [row("1"), row("1")] })).toMatch(/twice/);
  });
  it("passes a fully mapped TOS", () => {
    expect(catalogueSaveError({ learningAreaId: "3", rows: [row("1"), row("2")] })).toBeNull();
  });
});
