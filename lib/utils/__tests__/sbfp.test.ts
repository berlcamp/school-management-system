import { describe, expect, it } from "vitest";
import {
  averagePercent,
  buildForm2Summary,
  buildForm5Consolidated,
  buildForm6Table,
  feedingAttendance,
  feedingDaysInMonth,
  form2GradeLabel,
  form2GradeLevels,
  gradeSectionLabel,
  isPresentCode,
  schoolYearMonths,
  suggestClassification,
  type SbfpBeneficiaryView,
  type SbfpDelivery,
  type SbfpReading,
} from "@/lib/utils/sbfp";

function reading(partial: Partial<SbfpReading> = {}): SbfpReading {
  return {
    measured_at: "2026-07-01",
    height_cm: 110,
    weight_kg: 18,
    nutritional_status: "normal",
    height_for_age: "normal",
    ...partial,
  };
}

let seq = 0;
function learner(partial: Partial<SbfpBeneficiaryView> = {}): SbfpBeneficiaryView {
  seq += 1;
  return {
    id: `b${seq}`,
    student_id: `s${seq}`,
    section_id: "sec1",
    name: `LEARNER ${seq}`,
    lrn: null,
    sex: "male",
    date_of_birth: "2020-01-01",
    grade_level: 0,
    section_name: "Alpha",
    classification: "primary",
    is_pregnant: false,
    has_infant: false,
    is_dewormed: false,
    milk_consent: null,
    is_previous_beneficiary: false,
    is_pardo: false,
    is_indigent: false,
    is_4ps: false,
    is_ip: false,
    milk_tolerance: null,
    baseline: reading(),
    midline: null,
    endline: null,
    ...partial,
  };
}

describe("feeding codes and attendance", () => {
  it("treats every code but A as present, and blank as not recorded", () => {
    expect(isPresentCode("H")).toBe(true);
    expect(isPresentCode("N+M2")).toBe(true);
    expect(isPresentCode("A")).toBe(false);
    expect(isPresentCode("")).toBe(false);
    expect(isPresentCode(null)).toBe(false);
    expect(isPresentCode("X")).toBe(false);
  });

  it("counts present days over feeding days and ignores codes on other dates", () => {
    const codes = new Map([
      ["2026-08-03", "H"],
      ["2026-08-04", "A"],
      ["2026-08-05", "H+M"],
      ["2026-08-08", "H"], // not a feeding day any more
    ]);
    const a = feedingAttendance(codes, ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06"]);
    expect(a).toEqual({ present: 2, feedingDays: 4, percent: 50 });
  });

  it("has no percentage before the first feeding day", () => {
    expect(feedingAttendance(new Map(), []).percent).toBeNull();
    expect(averagePercent([null, null])).toBeNull();
    expect(averagePercent([100, null, 50])).toBe(75);
  });

  it("lists the school year's months June to May", () => {
    const months = schoolYearMonths("2026-2027");
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2026-06");
    expect(months[6]).toBe("2026-12");
    expect(months[11]).toBe("2027-05");
  });

  it("picks a month's feeding days in order", () => {
    expect(
      feedingDaysInMonth(["2026-09-01", "2026-08-05", "2026-08-03"], "2026-08"),
    ).toEqual(["2026-08-03", "2026-08-05"]);
  });
});

describe("selection", () => {
  it("suggests primary for wasted, secondary for stunted, nothing otherwise", () => {
    expect(suggestClassification(reading({ nutritional_status: "severely_wasted" }))).toBe(
      "primary",
    );
    expect(
      suggestClassification(reading({ nutritional_status: "normal", height_for_age: "stunted" })),
    ).toBe("secondary");
    expect(suggestClassification(reading())).toBeNull();
    expect(suggestClassification(null)).toBeNull();
  });
});

describe("labels", () => {
  it("writes grade levels the way the forms do", () => {
    expect(form2GradeLabel(0)).toBe("Kinder");
    expect(form2GradeLabel(4)).toBe("Grade IV");
    expect(form2GradeLabel(12)).toBe("Grade XII");
    expect(gradeSectionLabel(0, "Matatag")).toBe("KINDER/MATATAG");
    expect(gradeSectionLabel(5, "Rizal")).toBe("5/RIZAL");
  });

  it("lists SNED on the elementary sheet only when it has beneficiaries", () => {
    expect(form2GradeLevels("elementary", [learner()])).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(form2GradeLevels("elementary", [learner({ grade_level: -1 })])[0]).toBe(-1);
    expect(form2GradeLevels("secondary", [])).toEqual([7, 8, 9, 10, 11, 12]);
  });
});

describe("Form 2", () => {
  const rows = [
    learner({ sex: "male", baseline: reading({ nutritional_status: "wasted", height_for_age: "stunted" }), is_dewormed: true }),
    learner({ sex: "female", baseline: reading({ nutritional_status: "obese" }), is_4ps: true }),
    learner({ sex: "female", baseline: reading({ nutritional_status: "overweight" }), has_infant: true }),
    learner({
      sex: "male",
      classification: "secondary",
      baseline: reading({ height_for_age: "severely_stunted" }),
      is_pardo: true,
      is_ip: true,
      is_previous_beneficiary: true,
    }),
    learner({ sex: "male", grade_level: 1, baseline: null }),
  ];
  const summary = buildForm2Summary(rows, "baseline", [0, 1]);

  it("bands only primary targets, folding overweight and obese together", () => {
    const k = summary.grades[0];
    expect(k.male.bmi.wasted).toBe(1);
    expect(k.male.bmiTotal).toBe(1);
    expect(k.female.bmi.overweight_obese).toBe(2);
    expect(k.total.bmiTotal).toBe(3);
    expect(k.male.hfa.stunted).toBe(1);
    expect(k.female.pregnantOrMother).toBe(1);
  });

  it("counts the secondary columns from secondary targets only", () => {
    const k = summary.grades[0];
    expect(k.male.pardo).toBe(1);
    expect(k.male.stunted).toBe(1);
    expect(k.male.ip).toBe(1);
    // the secondary learner is not in the primary bands
    expect(k.male.hfa.severely_stunted).toBe(0);
  });

  it("counts deworming, 4Ps and repeaters across everyone", () => {
    const g = summary.grandTotal.total;
    expect(g.dewormed).toBe(1);
    expect(g.fourPs).toBe(1);
    expect(g.repeaters).toBe(1);
  });

  it("adds nothing to the bands for a learner with no reading in the period", () => {
    expect(summary.grades[1].total.bmiTotal).toBe(0);
    expect(buildForm2Summary(rows, "endline", [0]).grandTotal.total.bmiTotal).toBe(0);
  });

  it("bands the midline sheet from the midline weighing", () => {
    const mid = learner({
      sex: "female",
      midline: reading({ nutritional_status: "severely_wasted", height_for_age: "tall" }),
    });
    const m = buildForm2Summary([mid], "midline", [0]).grades[0].female;
    expect(m.bmi.severely_wasted).toBe(1);
    expect(m.hfa.tall).toBe(1);
    expect(buildForm2Summary([mid], "endline", [0]).grandTotal.total.bmiTotal).toBe(0);
  });

  it("makes the grand total the sum of the grade totals", () => {
    const sum = summary.grades.reduce((n, g) => n + g.total.bmiTotal, 0);
    expect(summary.grandTotal.total.bmiTotal).toBe(sum);
    expect(summary.grandTotal.male.bmiTotal + summary.grandTotal.female.bmiTotal).toBe(sum);
  });
});

describe("Form 5 consolidated", () => {
  it("counts before/after bands and averages attendance per section", () => {
    const a = learner({ section_id: "x", section_name: "Beta", grade_level: 2, is_dewormed: true, endline: reading() });
    const b = learner({ section_id: "x", section_name: "Beta", grade_level: 2, baseline: reading({ nutritional_status: "wasted" }) });
    const c = learner({ section_id: "y", section_name: "Gamma", grade_level: 1 });
    const att = new Map([
      [a.id, { present: 10, feedingDays: 10, percent: 100 }],
      [b.id, { present: 5, feedingDays: 10, percent: 50 }],
      [c.id, { present: 9, feedingDays: 10, percent: 90 }],
    ]);
    const out = buildForm5Consolidated([a, b, c], att);
    expect(out.sections.map((s) => s.label)).toEqual(["1/GAMMA", "2/BETA"]);
    const beta = out.sections[1];
    expect(beta.dewormed).toBe(1);
    expect(beta.before.bands.wasted).toBe(1);
    expect(beta.before.total).toBe(2);
    expect(beta.after.total).toBe(1);
    expect(beta.attendance).toBe(75);
    expect(out.total.before.total).toBe(3);
    expect(out.total.attendance).toBe(80);
  });
});

describe("Form 6", () => {
  const deliveries: SbfpDelivery[] = [
    { id: "d1", component: "milk", grade_level: 0, delivered_on: "2026-08-10", packs_new: 100, packs_replacement: 5, packs_rejected: 5, remarks: null, meals: [] },
    { id: "d2", component: "nfp", grade_level: 0, delivered_on: "2026-08-01", packs_new: 40, packs_replacement: 0, packs_rejected: 0, remarks: null, meals: [] },
  ];
  const rows = [
    learner({ sex: "male", milk_tolerance: "none" }),
    learner({ sex: "female", milk_tolerance: "not_allowed" }),
    learner({ sex: "female", milk_tolerance: "intolerant_willing", grade_level: 8 }),
  ];

  it("counts every beneficiary for NFP and only milk drinkers for milk", () => {
    const nfp = buildForm6Table(rows, deliveries, "nfp");
    expect(nfp.grand.total).toBe(3);
    expect(nfp.grand.packsNew).toBe(40);
    const milk = buildForm6Table(rows, deliveries, "milk");
    expect(milk.grand).toMatchObject({ male: 1, female: 1, total: 2, packsNew: 100, packsRejected: 5 });
  });

  it("keeps the issued Kinder–Grade 6 rows and widens for other grades", () => {
    const nfp = buildForm6Table(rows, deliveries, "nfp");
    expect(nfp.grades.map((g) => g.gradeLevel)).toEqual([0, 1, 2, 3, 4, 5, 6, 8]);
    expect(nfp.grades[0].deliveries.map((d) => d.id)).toEqual(["d2"]);
  });
});
