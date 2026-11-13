import { describe, expect, it } from "vitest";
import {
  formatItemRanges,
  isSequentialPlacement,
  itemNumberingError,
  parseItemNumbers,
  sequentialItemNumbers,
} from "@/lib/utils/tos";

describe("sequentialItemNumbers", () => {
  it("numbers items in competency order", () => {
    expect(sequentialItemNumbers([3, 0, 2])).toEqual([[1, 2, 3], [], [4, 5]]);
  });
});

describe("isSequentialPlacement", () => {
  it("accepts competency-order numbering", () => {
    expect(isSequentialPlacement([[1, 2], [3], [4, 5]])).toBe(true);
  });
  it("rejects interleaved numbering", () => {
    expect(isSequentialPlacement([[1, 4, 9], [2, 3, 5, 6, 7, 8]])).toBe(false);
  });
});

describe("parseItemNumbers", () => {
  it("reads lists and ranges, ascending", () => {
    expect(parseItemNumbers("9, 1, 4")).toEqual({ ok: true, numbers: [1, 4, 9] });
    expect(parseItemNumbers("1-3, 7")).toEqual({ ok: true, numbers: [1, 2, 3, 7] });
    expect(parseItemNumbers("1 – 3; 7 10")).toEqual({
      ok: true,
      numbers: [1, 2, 3, 7, 10],
    });
    expect(parseItemNumbers("")).toEqual({ ok: true, numbers: [] });
  });
  it("refuses junk, zero, reversed ranges and repeats", () => {
    expect(parseItemNumbers("1, a").ok).toBe(false);
    expect(parseItemNumbers("0").ok).toBe(false);
    expect(parseItemNumbers("5-3").ok).toBe(false);
    expect(parseItemNumbers("1-3, 2").ok).toBe(false);
    expect(parseItemNumbers("1-99999").ok).toBe(false);
  });
});

describe("formatItemRanges", () => {
  it("collapses runs", () => {
    expect(formatItemRanges([10, 1, 2, 3, 7, 9])).toBe("1–3, 7, 9–10");
    expect(formatItemRanges([])).toBe("");
  });
});

describe("itemNumberingError", () => {
  it("accepts a complete non-consecutive placement", () => {
    expect(
      itemNumberingError([
        { count: 3, numbers: [1, 4, 9] },
        { count: 6, numbers: [2, 3, 5, 6, 7, 8] },
      ]),
    ).toBeNull();
  });
  it("needs one number per item", () => {
    expect(itemNumberingError([{ count: 3, numbers: [1, 2] }])).toMatch(
      /Competency 1 has 3 items but 2 item numbers/,
    );
  });
  it("refuses numbers beyond the total", () => {
    expect(itemNumberingError([{ count: 2, numbers: [1, 5] }])).toMatch(/beyond the 2 items/);
  });
  it("refuses an item under two competencies", () => {
    expect(
      itemNumberingError([
        { count: 2, numbers: [1, 2] },
        { count: 2, numbers: [2, 4] },
      ]),
    ).toMatch(/Item 2 is placed under both competency 1 and competency 2/);
  });
});

describe("itemNumberingError positions", () => {
  it("names the competency by its on-screen number", () => {
    expect(
      itemNumberingError([
        { count: 1, numbers: [1], position: 1 },
        { count: 1, numbers: [], position: 3 },
      ]),
    ).toMatch(/^Competency 3 has 1 item but 0 item numbers/);
  });
  it("accepts the help-desk example: competency 1 on items 1, 4 and 9", () => {
    expect(
      itemNumberingError([
        { count: 3, numbers: [1, 4, 9] },
        { count: 4, numbers: [2, 3, 5, 6] },
        { count: 3, numbers: [7, 8, 10] },
      ]),
    ).toBeNull();
  });
});
