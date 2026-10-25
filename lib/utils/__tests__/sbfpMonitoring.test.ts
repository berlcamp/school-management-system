/**
 * Hot Meals deliveries and the Monitoring tools (migration 220): the
 * arithmetic the screen and the printouts share. Synthetic data only.
 */

import { describe, expect, it } from "vitest";
import { SBFP_DISTRICTS } from "@/lib/constants/sbfp";
import {
  buildForm6Table,
  countYes,
  districtKey,
  hotMealDeliveries,
  mealLineLabel,
  mealTotals,
  schoolsByDistrict,
  summarizeQuality,
  type QualityQuestion,
  type SbfpDelivery,
} from "@/lib/utils/sbfp";

const hot = (id: string, date: string | null, meals: SbfpDelivery["meals"]): SbfpDelivery => ({
  id,
  component: "hot_meals",
  grade_level: null,
  delivered_on: date,
  packs_new: 0,
  packs_replacement: 0,
  packs_rejected: 0,
  remarks: null,
  meals,
});

describe("hot meals", () => {
  const deliveries: SbfpDelivery[] = [
    hot("h2", "2026-08-04", [
      { kind: "new", quantity: 2, unit: "tray", viand_name: "Adobo", servings: 50 },
      { kind: "rejected", quantity: 1, unit: "tray", viand_name: "Adobo", servings: 10 },
    ]),
    hot("h1", "2026-08-03", [
      { kind: "new", quantity: 3, unit: "pot", viand_name: "Lugaw", servings: 80 },
      { kind: "replacement", quantity: 0, unit: null, viand_name: "Arroz caldo", servings: 10 },
    ]),
    hot("h3", null, []),
    {
      id: "n1",
      component: "nfp",
      grade_level: 1,
      delivered_on: "2026-08-01",
      packs_new: 40,
      packs_replacement: 0,
      packs_rejected: 0,
      remarks: null,
      meals: [],
    },
  ];

  it("sums servings per kind", () => {
    expect(mealTotals(deliveries)).toEqual({
      servingsNew: 130,
      servingsReplacement: 10,
      servingsRejected: 10,
    });
  });

  it("orders hot-meals deliveries by date, undated last, and drops other components", () => {
    expect(hotMealDeliveries(deliveries).map((d) => d.id)).toEqual(["h1", "h2", "h3"]);
  });

  it("labels a viand line", () => {
    expect(mealLineLabel(deliveries[0].meals[0])).toBe("2 tray Adobo – 50 servings");
    expect(mealLineLabel(deliveries[1].meals[1])).toBe("Arroz caldo – 10 servings");
  });

  it("keeps hot meals off Form 6, whose grade levels stay the issued Kinder–6", () => {
    const nfp = buildForm6Table([], deliveries, "nfp");
    expect(nfp.grades.map((g) => g.gradeLevel)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(nfp.grand.packsNew).toBe(40);
  });
});

describe("districts", () => {
  it("reads the stored district names onto the five columns", () => {
    expect(districtKey("Central District", SBFP_DISTRICTS)).toBe("Central");
    expect(districtKey("NORTH", SBFP_DISTRICTS)).toBe("North");
    expect(districtKey("Northeast", SBFP_DISTRICTS)).toBeNull();
    expect(districtKey(null, SBFP_DISTRICTS)).toBeNull();
  });

  it("groups schools in the issued column order, Other last and only when used", () => {
    const groups = schoolsByDistrict(
      [
        { id: "1", name: "Zeta ES", district: "West District" },
        { id: "2", name: "Alpha ES", district: "West District" },
        { id: "3", name: "Beta ES", district: "Central District" },
      ],
      SBFP_DISTRICTS,
    );
    expect(groups.map((g) => g.district)).toEqual(["Central", "North", "South", "East", "West"]);
    expect(groups[4].schools.map((s) => s.name)).toEqual(["Alpha ES", "Zeta ES"]);

    const withOther = schoolsByDistrict([{ id: "4", name: "X", district: "" }], SBFP_DISTRICTS);
    expect(withOther.at(-1)).toEqual({ district: null, schools: [{ id: "4", name: "X", district: "" }] });
  });
});

describe("checklists", () => {
  it("counts only Yes answers among the listed codes", () => {
    expect(countYes({ a: true, b: false, gone: true }, ["a", "b", "c"])).toBe(1);
  });
});

describe("quality evaluation", () => {
  const q = (id: string, kind: "face" | "text", sort: number, active = true): QualityQuestion => ({
    id,
    code: id,
    kind,
    prompt: `Q${id}`,
    sort_order: sort,
    is_active: active,
  });

  it("tallies faces and collects text, keeping a retired question that was answered", () => {
    const out = summarizeQuality(
      [q("2", "text", 2), q("1", "face", 1), q("3", "face", 3, false), q("4", "face", 4, false)],
      [
        { answers: { "1": 5, "2": "Masarap", "3": 2 } },
        { answers: { "1": 4, "2": "  " } },
        { answers: { "1": 4 } },
      ],
    );
    expect(out.map((s) => s.question.id)).toEqual(["1", "2", "3"]);
    expect(out[0].answered).toBe(3);
    expect(out[0].mean).toBe(4.33);
    expect(out[0].distribution.get(4)).toBe(2);
    expect(out[1].texts).toEqual(["Masarap"]);
    expect(out[1].mean).toBeNull();
    expect(out[2].answered).toBe(1);
  });
});
