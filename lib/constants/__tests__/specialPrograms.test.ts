import { describe, expect, it } from "vitest";
import {
  isSelectiveSubject,
  selectableProgramsFor,
  specialProgramBadge,
  specializationLabel,
  specializationsOf,
  type SpecialProgram,
  type SpecialProgramSpecialization,
} from "../specialPrograms";

const program = (
  over: Partial<SpecialProgram> & Pick<SpecialProgram, "id" | "code" | "name">,
): SpecialProgram => ({
  school_id: null,
  specialization_label: "Specialization",
  is_active: true,
  ...over,
});

const strand = (
  over: Partial<SpecialProgramSpecialization> &
    Pick<SpecialProgramSpecialization, "id" | "special_program_id" | "code" | "name">,
): SpecialProgramSpecialization => ({ is_active: true, ...over });

const SPA = program({
  id: "1",
  code: "SPA",
  name: "Special Program in the Arts",
  specialization_label: "Area of Specialization",
});
const SPJ = program({ id: "2", code: "SPJ", name: "Journalism", school_id: "7" });
const OTHER = program({ id: "3", code: "SPS", name: "Sports", school_id: "9" });
const RETIRED = program({ id: "4", code: "OLD", name: "Retired", is_active: false });

const MUSIC = strand({ id: "10", special_program_id: "1", code: "MUS", name: "Music" });
const DANCE = strand({ id: "11", special_program_id: "1", code: "DAN", name: "Dance" });
const RETIRED_STRAND = strand({
  id: "12",
  special_program_id: "1",
  code: "OLD",
  name: "Retired strand",
  is_active: false,
});
const BROADCAST = strand({
  id: "13",
  special_program_id: "2",
  code: "BRD",
  name: "Broadcasting",
});

const ALL_PROGRAMS = [SPA, SPJ, OTHER, RETIRED];
const ALL_STRANDS = [MUSIC, DANCE, RETIRED_STRAND, BROADCAST];

describe("isSelectiveSubject", () => {
  // The whole point of migration 179: the roster question and the general
  // average question are separate, and only ONE implication runs between them.
  it("is independent of every program, in both directions", () => {
    // A special-program subject need not be selective.
    expect(
      isSelectiveSubject({ selective_enrolment: false, is_madrasah: false }),
    ).toBe(false);
    // An ordinary subject may be selective...
    expect(
      isSelectiveSubject({ selective_enrolment: true, is_madrasah: false }),
    ).toBe(true);
    // ...and that must not make it a Madrasah subject, which would drop it out
    // of the general average. Nothing here reads back the other way.
    expect(
      isSelectiveSubject({ selective_enrolment: true, is_madrasah: false }),
    ).toBe(true);
  });

  it("treats Madrasah/ALS as selective even on a row read before 179", () => {
    // The database forces the flag on, but a client may hold a row fetched
    // without the column, or from a database where 179 is not yet applied.
    expect(isSelectiveSubject({ is_madrasah: true })).toBe(true);
    expect(isSelectiveSubject({})).toBe(false);
  });
});

describe("selectableProgramsFor", () => {
  it("offers division-wide programs plus the school's own, active only", () => {
    const result = selectableProgramsFor(ALL_PROGRAMS, "7");
    expect(result.map((p) => p.code)).toEqual(["SPJ", "SPA"]); // by name
  });

  it("never offers another school's program", () => {
    expect(
      selectableProgramsFor(ALL_PROGRAMS, "7").some((p) => p.code === "SPS"),
    ).toBe(false);
  });

  it("gives a division user the division-wide list", () => {
    expect(selectableProgramsFor(ALL_PROGRAMS, null).map((p) => p.code)).toEqual(
      ["SPA"],
    );
  });
});

describe("specializationsOf", () => {
  it("returns one program's active strands, by name", () => {
    expect(specializationsOf(ALL_STRANDS, "1").map((s) => s.name)).toEqual([
      "Dance",
      "Music",
    ]);
  });

  it("is empty for a program with no second level", () => {
    // STE and SPJ genuinely have none — not an error state.
    expect(specializationsOf(ALL_STRANDS, "99")).toEqual([]);
    expect(specializationsOf(ALL_STRANDS, null)).toEqual([]);
  });
});

describe("specializationLabel", () => {
  it("uses the program's own term, falling back to the generic one", () => {
    expect(specializationLabel(SPA)).toBe("Area of Specialization");
    expect(specializationLabel(SPJ)).toBe("Specialization");
    expect(specializationLabel(null)).toBe("Specialization");
    expect(specializationLabel({ specialization_label: "   " })).toBe(
      "Specialization",
    );
  });
});

describe("specialProgramBadge", () => {
  it("shows the strand when there is one", () => {
    expect(
      specialProgramBadge(
        { special_program_id: "1", specialization_id: "10" },
        ALL_PROGRAMS,
        ALL_STRANDS,
      ),
    ).toEqual({
      short: "MUS",
      full: "Special Program in the Arts — Music",
    });
  });

  it("falls back to the program for a subject common to the whole program", () => {
    expect(
      specialProgramBadge(
        { special_program_id: "1", specialization_id: null },
        ALL_PROGRAMS,
        ALL_STRANDS,
      ),
    ).toEqual({ short: "SPA", full: "Special Program in the Arts" });
  });

  it("is null for an untagged subject", () => {
    expect(specialProgramBadge({}, ALL_PROGRAMS, ALL_STRANDS)).toBeNull();
  });

  it("resolves a retired program, so an old tag still prints its name", () => {
    expect(
      specialProgramBadge(
        { special_program_id: "4" },
        ALL_PROGRAMS,
        ALL_STRANDS,
      ),
    ).toEqual({ short: "OLD", full: "Retired" });
  });
});
