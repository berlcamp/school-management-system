import { describe, expect, it } from "vitest";
import { shouldTakeOverRecord } from "../classRecordOwnership";

const base = {
  openerId: 2,
  ownerId: 1 as number | null,
  ownerCoversPeriod: false,
  hasScores: false,
  openerCovers: true,
};

describe("shouldTakeOverRecord", () => {
  it("takes over an empty record whose owner no longer covers the term", () => {
    expect(shouldTakeOverRecord(base)).toBe(true);
  });
  it("takes over an ownerless record", () => {
    expect(shouldTakeOverRecord({ ...base, ownerId: null })).toBe(true);
  });
  it("never moves a record holding scores", () => {
    expect(shouldTakeOverRecord({ ...base, hasScores: true })).toBe(false);
  });
  it("leaves it with an owner who still covers the term (team teaching)", () => {
    expect(shouldTakeOverRecord({ ...base, ownerCoversPeriod: true })).toBe(false);
  });
  it("does nothing when the opener already owns it", () => {
    expect(shouldTakeOverRecord({ ...base, ownerId: 2 })).toBe(false);
  });
  it("does nothing when the opener does not cover the term", () => {
    expect(shouldTakeOverRecord({ ...base, openerCovers: false })).toBe(false);
  });
});
