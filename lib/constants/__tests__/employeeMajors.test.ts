import { describe, expect, it } from "vitest";
import {
  GRADUATE_MAJORS,
  UNDERGRAD_MAJORS,
  OTHER_TEXT_MAX,
  decodeMajor,
  encodeMajor,
  majorGroupCode,
  majorLabel,
} from "../employeeMajors";
import { LEARNING_AREAS } from "../learningAreas";

describe("major lists", () => {
  it.each([
    ["undergrad", UNDERGRAD_MAJORS],
    ["graduate", GRADUATE_MAJORS],
  ])("%s codes are unique and carry General and Other", (_, list) => {
    const codes = list.map((m) => m.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain("general");
    expect(codes).toContain("other");
    expect(codes.every((c) => !c.includes(":"))).toBe(true);
  });

  it("graduate list offers None", () => {
    expect(GRADUATE_MAJORS.map((m) => m.code)).toContain("none");
  });

  it("learning areas add general, sped and als without dropping old codes", () => {
    const codes = LEARNING_AREAS.map((a) => a.code);
    for (const c of ["filipino", "english", "math", "science", "ap", "esp",
      "mapeh", "tle", "mt", "kinder", "other", "general", "sped", "als"]) {
      expect(codes).toContain(c);
    }
    expect(codes[codes.length - 1]).toBe("other");
  });
});

describe("encode / decode", () => {
  it("passes a listed code through", () => {
    expect(encodeMajor("bsed_math")).toBe("bsed_math");
    expect(decodeMajor("bsed_math")).toEqual({ code: "bsed_math", otherText: "" });
  });

  it("stores Other with its trimmed text", () => {
    expect(encodeMajor("other", "  AB Psychology ")).toBe("other:AB Psychology");
    expect(decodeMajor("other:AB Psychology")).toEqual({
      code: "other",
      otherText: "AB Psychology",
    });
  });

  it("refuses Other with blank text", () => {
    expect(encodeMajor("other", "   ")).toBeNull();
    expect(encodeMajor("other")).toBeNull();
  });

  it("caps Other text", () => {
    const long = "x".repeat(OTHER_TEXT_MAX + 30);
    expect(encodeMajor("other", long)).toBe(`other:${"x".repeat(OTHER_TEXT_MAX)}`);
  });

  it("blank is null", () => {
    expect(encodeMajor("")).toBeNull();
    expect(encodeMajor(null)).toBeNull();
    expect(decodeMajor(null)).toEqual({ code: null, otherText: "" });
  });
});

describe("labels and grouping", () => {
  it("labels listed, other and blank", () => {
    expect(majorLabel(UNDERGRAD_MAJORS, "bsed_english")).toBe("BSEd – English");
    expect(majorLabel(UNDERGRAD_MAJORS, "other:AB Psychology")).toBe(
      "Other: AB Psychology",
    );
    expect(majorLabel(UNDERGRAD_MAJORS, null)).toBe("—");
  });

  it("an unknown stored code prints as itself", () => {
    expect(majorLabel(UNDERGRAD_MAJORS, "retired_code")).toBe("retired_code");
  });

  it("groups every Other answer together", () => {
    expect(majorGroupCode("other:AB Psychology")).toBe("other");
    expect(majorGroupCode("bsed_math")).toBe("bsed_math");
    expect(majorGroupCode("")).toBeNull();
  });
});
