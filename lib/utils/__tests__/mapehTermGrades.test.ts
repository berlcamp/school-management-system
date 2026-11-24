import { describe, expect, it } from "vitest";
import { mapehTermGrades } from "../mapehTermGrades";

const P = [1, 2, 3];
const grades = (
  ma: Record<number, number> | undefined,
  pe: Record<number, number> | undefined,
) =>
  mapehTermGrades(
    [
      { component: "music_arts", terms: ma },
      { component: "pe_health", terms: pe },
    ],
    P,
  );

describe("mapehTermGrades", () => {
  it("averages each term both components have, with no final yet", () => {
    expect(grades({ 1: 85, 2: 88 }, { 1: 90, 2: 86 })).toEqual({
      terms: { 1: 88, 2: 87, 3: null },
      final: null,
    });
  });

  it("leaves a term blank when one component is missing", () => {
    expect(grades({ 1: 85, 2: 88 }, { 1: 90 }).terms[2]).toBeNull();
    expect(grades({ 1: 85 }, undefined)).toEqual({
      terms: { 1: null, 2: null, 3: null },
      final: null,
    });
  });

  it("gives no final when the components are complete in different terms", () => {
    expect(
      grades({ 1: 85, 2: 88, 3: 90 }, { 1: 90, 2: 86 }).final,
    ).toBeNull();
  });

  it("finals the mean of the rounded terms once all are posted", () => {
    expect(
      grades({ 1: 85, 2: 88, 3: 90 }, { 1: 90, 2: 86, 3: 92 }),
    ).toEqual({ terms: { 1: 88, 2: 87, 3: 91 }, final: 89 });
  });
});
