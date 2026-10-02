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
  it("does not re-check a TOS saved archived", () => {
    expect(
      catalogueSaveError({ learningAreaId: "", rows: [row(null), row("1"), row("1")], archived: true }),
    ).toBeNull();
  });
  it("refuses a saved row whose pick was cleared, even when archived", () => {
    const cleared = { id: "9", catalogue_competency_id: null, competency_text: "" };
    expect(catalogueSaveError({ learningAreaId: "3", rows: [row("1"), cleared] })).toMatch(/cleared row/);
    expect(catalogueSaveError({ learningAreaId: "", rows: [cleared], archived: true })).toMatch(/cleared row/);
  });
  it("ignores a blank row that was never saved", () => {
    expect(
      catalogueSaveError({
        learningAreaId: "3",
        rows: [row("1"), { catalogue_competency_id: null, competency_text: "" }],
      }),
    ).toBeNull();
  });
});
