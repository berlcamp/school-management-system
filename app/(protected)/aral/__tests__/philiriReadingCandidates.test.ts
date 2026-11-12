import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import {
  philiriReadingCandidates,
  type PhiliriIndividualRead,
  type PhiliriScreeningRow,
} from "../aralUtils";

const screen = (
  language: string,
  screening_result: string,
  total_score = 10,
): PhiliriScreeningRow => ({
  student_id: "1",
  section_id: "s1",
  language,
  screening_result,
  total_score,
});

const read = (
  language: string,
  grade: number,
  overall_reading_level: PhiliriIndividualRead["overall_reading_level"],
): PhiliriIndividualRead => ({
  student_id: "1",
  language,
  grade,
  overall_reading_level,
});

describe("philiriReadingCandidates", () => {
  it("refines each language with its own reads, not the other language's", () => {
    // English: frustrates at Grade 4. Filipino: reads Grade 6 independently.
    const out = philiriReadingCandidates(
      [screen("English", "Frustration"), screen("Filipino", "Frustration")],
      [
        read("English", 3, "Instructional"),
        read("English", 4, "Frustration"),
        read("Filipino", 6, "Independent"),
      ],
      6,
    );
    // The Filipino row is dropped (at grade level); the English row stays.
    expect(out).toHaveLength(1);
    expect(out[0].tier).toBe("priority");
    expect(out[0].source_level).toBe("Frustration — Grade 4");
  });

  it("does not let one language's reads drop the other's GST flag", () => {
    const out = philiriReadingCandidates(
      [screen("English", "Frustration")],
      [read("Filipino", 6, "Independent")],
      6,
    );
    expect(out).toHaveLength(1);
    expect(out[0].source_level).toBe("Frustration");
  });

  it("falls back to the GST when individual reads exist but none is scored", () => {
    const out = philiriReadingCandidates(
      [screen("English", "Frustration")],
      [read("English", 4, null)],
      6,
    );
    expect(out).toHaveLength(1);
    expect(out[0].source_level).toBe("Frustration");
  });

  it("skips learners the GST did not flag", () => {
    expect(
      philiriReadingCandidates([screen("English", "Independent")], [], 6),
    ).toEqual([]);
  });
});
