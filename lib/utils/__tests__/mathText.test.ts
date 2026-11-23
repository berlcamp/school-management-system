import { describe, expect, it } from "vitest";
import { applyMathEdit, hasMathMarkup, parseMathText } from "@/lib/utils/mathText";

describe("parseMathText", () => {
  it("leaves plain text alone", () => {
    expect(parseMathText("What is 2 + 2?")).toEqual(["What is 2 + 2?"]);
  });

  it("parses braced superscript and subscript", () => {
    expect(parseMathText("x^{2} + H_{2}O")).toEqual([
      "x",
      { kind: "sup", children: ["2"] },
      " + H",
      { kind: "sub", children: ["2"] },
      "O",
    ]);
  });

  it("parses caret shorthand with digits and a minus", () => {
    expect(parseMathText("10^-3 and x^2")).toEqual([
      "10",
      { kind: "sup", children: ["-3"] },
      " and x",
      { kind: "sup", children: ["2"] },
    ]);
  });

  it("nests", () => {
    expect(parseMathText("e^{x_{1}}")).toEqual([
      "e",
      { kind: "sup", children: ["x", { kind: "sub", children: ["1"] }] },
    ]);
  });

  it("keeps blanks made of underscores as text", () => {
    expect(parseMathText("The answer is ____2 or _____.")).toEqual([
      "The answer is ____2 or _____.",
    ]);
  });

  it("prints unclosed or empty markup literally", () => {
    expect(parseMathText("x^{2 + 1")).toEqual(["x^{2 + 1"]);
    expect(parseMathText("x^{}")).toEqual(["x^{}"]);
    expect(parseMathText("a ^ b")).toEqual(["a ^ b"]);
  });

  it("hasMathMarkup", () => {
    expect(hasMathMarkup("x^{2}")).toBe(true);
    expect(hasMathMarkup("blank ____")).toBe(false);
    expect(hasMathMarkup(null)).toBe(false);
  });
});

describe("applyMathEdit", () => {
  it("wraps the selection", () => {
    expect(applyMathEdit("x2", 1, 2, { type: "sup" })).toEqual({
      value: "x^{2}",
      selStart: 3,
      selEnd: 4,
    });
  });

  it("inserts empty braces with the caret inside", () => {
    expect(applyMathEdit("H", 1, 1, { type: "sub" })).toEqual({
      value: "H_{}",
      selStart: 3,
      selEnd: 3,
    });
  });

  it("inserts a symbol at the caret", () => {
    expect(applyMathEdit("5  3", 2, 2, { type: "insert", text: "×" })).toEqual({
      value: "5 × 3",
      selStart: 3,
      selEnd: 3,
    });
  });
});
