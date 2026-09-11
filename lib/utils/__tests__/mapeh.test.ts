import { describe, expect, it } from "vitest";

import {
  buildCardSubjectRows,
  computeGeneralAverage,
  type MapehSourceRow,
} from "@/lib/utils/mapeh";

const subject = (
  name: string,
  quarters: (number | null)[],
  extra: Partial<MapehSourceRow> = {},
): MapehSourceRow => ({
  name,
  code: name.slice(0, 4).toUpperCase(),
  is_madrasah: false,
  mapeh_component: null,
  q1: quarters[0] ?? null,
  q2: quarters[1] ?? null,
  q3: quarters[2] ?? null,
  q4: quarters[3] ?? null,
  ...extra,
});

const generalAverageOf = (rows: MapehSourceRow[]) =>
  computeGeneralAverage(buildCardSubjectRows(rows)).average;

describe("buildCardSubjectRows", () => {
  it("leaves untagged subjects flat, ordered by code", () => {
    const rows = buildCardSubjectRows([
      subject("Science", [90, 90, 90, 90]),
      subject("English", [80, 80, 80, 80]),
    ]);

    expect(rows.map((r) => [r.name, r.kind])).toEqual([
      ["English", "plain"],
      ["Science", "plain"],
    ]);
  });

  it("folds tagged components into a computed MAPEH row in MA-PH order", () => {
    const rows = buildCardSubjectRows([
      // Deliberately out of print order, and named so alphabetical sorting
      // would get it wrong: PE & Health before Music & Arts.
      subject("P.E. and Health", [80, 80, 80, 80], {
        mapeh_component: "pe_health",
      }),
      subject("Music and Arts", [90, 90, 90, 90], {
        mapeh_component: "music_arts",
      }),
    ]);

    expect(rows.map((r) => [r.name, r.kind])).toEqual([
      ["MAPEH", "header"],
      ["Music and Arts", "sub"],
      ["P.E. and Health", "sub"],
    ]);

    // (90 + 80) / 2 = 85
    expect(rows[0].q1).toBe(85);
    expect(rows[0].final).toBe(85);
  });

  it("reads migration 153's four values as the two that replaced them", () => {
    // A database where 155's UPDATE has not run yet must still group, and
    // must still print Music/Arts ahead of PE/Health.
    const rows = buildCardSubjectRows([
      subject("Health", [80, 80, 80, 80], { mapeh_component: "health" }),
      subject("Music", [90, 90, 90, 90], { mapeh_component: "music" }),
    ]);

    expect(rows.map((r) => [r.name, r.kind])).toEqual([
      ["MAPEH", "header"],
      ["Music", "sub"],
      ["Health", "sub"],
    ]);
    expect(rows[0].q1).toBe(85);
  });

  it("builds a quarter from whichever components are encoded so far", () => {
    const rows = buildCardSubjectRows([
      subject("Music and Arts", [90, 90, null, null], {
        mapeh_component: "music_arts",
      }),
      subject("P.E. and Health", [80, null, null, null], {
        mapeh_component: "pe_health",
      }),
    ]);

    const header = rows.find((r) => r.kind === "header")!;
    expect(header.q1).toBe(85); // both components
    expect(header.q2).toBe(90); // only Music encoded
    expect(header.q3).toBeNull();
    expect(header.final).toBe(88); // round((85 + 90) / 2)
  });

  it("places the MAPEH block where its first component would have sorted", () => {
    const rows = buildCardSubjectRows([
      subject("English", [80, 80, 80, 80], { code: "ENG" }),
      subject("Science", [80, 80, 80, 80], { code: "SCI" }),
      subject("Music and Arts", [80, 80, 80, 80], {
        code: "MUS",
        mapeh_component: "music_arts",
      }),
    ]);

    expect(rows.map((r) => r.name)).toEqual([
      "English",
      "MAPEH",
      "Music and Arts",
      "Science",
    ]);
  });
});

describe("requirePeriods — the final waits for the last period", () => {
  const finalOf = (quarters: (number | null)[], requirePeriods?: number) =>
    buildCardSubjectRows([subject("Math", quarters)], { requirePeriods })[0].final;

  it("is null until every required period carries a grade", () => {
    expect(finalOf([80, 82, null], 3)).toBeNull();
    expect(finalOf([80, null, 84], 3)).toBeNull();
    expect(finalOf([80, 82, 84], 3)).toBe(82);
  });

  it("keeps the running mean when no rule is given", () => {
    expect(finalOf([80, 82, null])).toBe(81);
  });

  it("ignores a period past the count rather than letting it move the final", () => {
    // A stray 4th-quarter row left over from a re-levelled section. The card
    // trims these before it gets here; a final must not be built from one.
    expect(finalOf([80, 82, 84, 100], 3)).toBe(82);
  });

  it("blanks the remarks with the final", () => {
    const [row] = buildCardSubjectRows([subject("Math", [60, 60, null])], {
      requirePeriods: 3,
    });
    expect(row.final).toBeNull();
    expect(row.remarks).toBe("");
  });

  it("reads the periods of the computed parent, not of its components", () => {
    const rows = buildCardSubjectRows(
      [
        subject("Music and Arts", [90, 90, null], {
          code: "MUS",
          mapeh_component: "music_arts",
        }),
        subject("P.E. and Health", [80, 80, 80], {
          code: "PEH",
          mapeh_component: "pe_health",
        }),
      ],
      { requirePeriods: 3 },
    );

    // The rule is about periods, not components. MAPEH's own 3rd term is a
    // figure — 80, renormalised onto the component that is encoded, which is
    // the reading migration 174 settled on — so the learning area has all
    // three terms and takes a final of mean(85, 85, 80). The component line
    // that is short of a term takes none, and it is not in the average
    // anyway: the parent carries the area, once.
    expect(rows.map((r) => [r.name, r.q3, r.final])).toEqual([
      ["MAPEH", 80, 83],
      ["Music and Arts", null, null],
      ["P.E. and Health", 80, 80],
    ]);
    expect(computeGeneralAverage(rows).average).toBe(83);
  });
});

describe("computeGeneralAverage", () => {
  it("counts MAPEH once, not once per component", () => {
    const math = subject("Math", [100, 100, 100, 100], { code: "MATH" });
    const components: MapehSourceRow[] = [
      subject("Music and Arts", [80, 80, 80, 80], {
        code: "MUS",
        mapeh_component: "music_arts",
      }),
      subject("P.E. and Health", [80, 80, 80, 80], {
        code: "PEH",
        mapeh_component: "pe_health",
      }),
    ];

    // Grouped: mean(100, 80) = 90. Flat, as the card did before migration 153,
    // it was mean(100, 80, 80) = 87 — MAPEH outweighing Math 2:1.
    expect(generalAverageOf([math, ...components])).toBe(90);

    const untagged = components.map((c) => ({ ...c, mapeh_component: null }));
    expect(generalAverageOf([math, ...untagged])).toBe(87);
  });

  it("keeps madrasah and ALS subjects out of the average but prints them", () => {
    const rows = buildCardSubjectRows([
      subject("Math", [90, 90, 90, 90], { code: "MATH" }),
      subject("Arabic", [60, 60, 60, 60], { code: "ARB", is_madrasah: true }),
    ]);

    expect(rows).toHaveLength(2);
    expect(computeGeneralAverage(rows).average).toBe(90);
  });

  it("returns null when nothing is encoded", () => {
    expect(generalAverageOf([subject("Math", [null, null, null, null])])).toBeNull();
  });

  it("marks the average failed below 75", () => {
    const rows = buildCardSubjectRows([subject("Math", [70, 70, 70, 70])]);
    expect(computeGeneralAverage(rows)).toEqual({ average: 70, remarks: "Failed" });
  });

  it("ignores an unrecognised component value rather than folding it in", () => {
    // The column is CHECK-constrained, but a loosely-typed read must not pull
    // an unknown value into the parent grade.
    const rows = buildCardSubjectRows([
      subject("Robotics", [80, 80, 80, 80], { mapeh_component: "dance" }),
    ]);

    expect(rows.map((r) => r.kind)).toEqual(["plain"]);
  });

  // --- Senior High SF9 (migration 185) ------------------------------------

  it("folds the two communication languages into one learning area", () => {
    const rows = buildCardSubjectRows([
      subject("Effective Communication", [90, 80, 85], {
        code: "SHS-EC",
        comm_component: "effective_communication",
        units: 3,
      }),
      subject("Mabisang Komunikasyon", [80, 90, 85], {
        code: "SHS-MK",
        comm_component: "mabisang_komunikasyon",
        units: 3,
      }),
    ]);

    expect(rows.map((r) => [r.name, r.kind, r.units])).toEqual([
      ["Effective Communication / Mabisang Komunikasyon", "header", 6],
      ["Effective Communication", "sub", null],
      ["Mabisang Komunikasyon", "sub", null],
    ]);
    // Equal weights, and the parent counts once toward the average.
    expect(rows[0].q1).toBe(85);
    expect(computeGeneralAverage(rows).average).toBe(85);
  });

  it("groups Core then Elective, and prints nothing when nothing is tagged", () => {
    const roster = [
      subject("Academic Elective 1", [90], { code: "ELEC-1", shs_category: "elective", units: 3 }),
      subject("General Mathematics", [80], { code: "CORE-2", shs_category: "core", units: 6 }),
      subject("General Science", [85], { code: "CORE-1", shs_category: "core", units: 6 }),
    ];

    expect(
      buildCardSubjectRows(roster, { groupByShsCategory: true }).map((r) => [
        r.name,
        r.kind,
      ]),
    ).toEqual([
      ["Core Subjects", "group"],
      ["General Science", "plain"],
      ["General Mathematics", "plain"],
      ["Elective Subjects", "group"],
      ["Academic Elective 1", "plain"],
    ]);

    // Untagged roster: grouping asked for, but no headings invented.
    const untagged = [subject("General Science", [85]), subject("Alpha", [80])];
    expect(
      buildCardSubjectRows(untagged, { groupByShsCategory: true }).map((r) => r.kind),
    ).toEqual(["plain", "plain"]);
  });

  it("keeps an untagged subject visible, after both blocks and under no heading", () => {
    const rows = buildCardSubjectRows(
      [
        subject("Work Immersion", [88], { code: "ZZ-WI" }),
        subject("General Science", [85], { code: "CORE-1", shs_category: "core" }),
      ],
      { groupByShsCategory: true },
    );

    expect(rows.map((r) => [r.name, r.kind])).toEqual([
      ["Core Subjects", "group"],
      ["General Science", "plain"],
      ["Work Immersion", "plain"],
    ]);
  });

  it("carries units through without letting them weight the average", () => {
    const rows = buildCardSubjectRows([
      subject("General Mathematics", [88], { code: "A", units: 6 }),
      subject("Academic Elective 1", [95], { code: "B", units: 3 }),
    ]);

    expect(rows.map((r) => r.units)).toEqual([6, 3]);
    // The plain mean of 88 and 95 — a units-weighted mean would give 90.
    expect(computeGeneralAverage(rows).average).toBe(92);
  });

  it("leaves a K-10 card untouched: no units, no headings", () => {
    const rows = buildCardSubjectRows([
      subject("English", [80, 80, 80, 80]),
      subject("Science", [90, 90, 90, 90]),
    ]);

    expect(rows.every((r) => r.kind === "plain" && r.units === null)).toBe(true);
  });

});
