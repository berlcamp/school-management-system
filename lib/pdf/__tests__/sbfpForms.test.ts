/**
 * SBFP Forms 1A–6 printouts, built from synthetic learners (never real ones).
 * Pins the parts a division office checks against the issued template: the
 * column heads, the per-form signatories, and that the figures printed are the
 * ones the aggregation in lib/utils/sbfp.ts computes.
 */

import { describe, expect, it } from "vitest";
import {
  buildFeedbackLog,
  buildForm1A,
  buildForm1B,
  buildForm2Sheets,
  buildForm3Sheet,
  buildForm4,
  buildForm5ConsolidatedSheet,
  buildForm5Milk,
  buildForm6,
  buildMidlineMasterList,
  buildSbfpDocument,
  longDate,
  mdy,
  type SbfpHeaderInfo,
} from "@/lib/pdf/generateSbfpForms";
import type { SbfpBeneficiaryView } from "@/lib/utils/sbfp";

const info: SbfpHeaderInfo = {
  schoolName: "Sample Central Elementary School",
  depedSchoolId: "999999",
  region: "Caraga",
  division: "Sample Division",
  district: "Sample District",
  municipalityBarangay: "Sample City / Poblacion",
  schoolYear: "2026-2027",
  principalName: "Head Person",
  principalTitle: "School Principal I",
  focalPersonName: "Focal Person",
  feedingStartDate: "2026-06-15",
  feedingEndDate: null,
  midlineWeighingDate: "2026-10-15",
  isLastMileSchool: false,
};

function learner(partial: Partial<SbfpBeneficiaryView>): SbfpBeneficiaryView {
  return {
    id: "b1",
    student_id: "s1",
    section_id: "sec1",
    name: "LEARNER, ONE A.",
    lrn: null,
    sex: "male",
    date_of_birth: "2019-01-10",
    grade_level: 1,
    section_name: "Alpha",
    classification: "primary",
    is_pregnant: false,
    has_infant: false,
    is_dewormed: true,
    milk_consent: true,
    is_previous_beneficiary: false,
    is_pardo: false,
    is_indigent: false,
    is_4ps: true,
    is_ip: false,
    milk_tolerance: "none",
    baseline: {
      measured_at: "2026-07-01",
      height_cm: 110,
      weight_kg: 15,
      nutritional_status: "wasted",
      height_for_age: "stunted",
    },
    endline: {
      measured_at: "2027-02-15",
      height_cm: 113,
      weight_kg: 18,
      nutritional_status: "normal",
      height_for_age: "stunted",
    },
    midline: null,
    ...partial,
  };
}

const older = learner({});
const younger = learner({
  id: "b2",
  student_id: "s2",
  name: "LEARNER, TWO B.",
  sex: "female",
  date_of_birth: "2021-05-01",
  grade_level: 0,
  section_name: "Kinder A",
  section_id: "sec0",
  milk_tolerance: "not_allowed",
  milk_consent: null,
});

describe("formatting", () => {
  it("prints dates the way the forms ask", () => {
    expect(mdy("2026-08-03")).toBe("08/03/2026");
    expect(mdy(null)).toBe("");
    expect(longDate("2026-06-15")).toBe("June 15, 2026");
  });
});

describe("Form 1A", () => {
  const html = buildForm1A(info, [younger, older]);

  it("carries the baseline title and the issued column heads", () => {
    expect(html).toContain("SBFP Form 1A (2026)");
    expect(html).toContain("( SY 2026-2027 ) - BASELINE");
    expect(html).toContain("BMI for 6 y.o. and above");
    expect(html).toContain("Beneficiary of SBFP in Previous Years (yes or no)");
  });

  it("prints BMI only for learners six and above at the weighing", () => {
    // 2019-01-10 → 7 y 5 m at 2026-07-01: 15 / 1.1² = 12.4
    expect(html).toContain("12.4");
    expect(html).toContain("7 y 5 m");
    // 2021-05-01 → 5 y 2 m: no BMI cell value
    expect(html).toContain("5 y 2 m");
    expect(html.match(/12\.4/g)?.length).toBe(1);
  });

  it("leaves an unasked milk consent blank instead of No", () => {
    const row = html.split("LEARNER, TWO B.")[1].split("</tr>")[0];
    // dewormed Yes | milk consent (blank) | 4Ps Yes
    expect(row).toContain('<td class="c">Yes</td>\n  <td class="c"></td>\n  <td class="c">Yes</td>');
  });
});

describe("Form 1B", () => {
  it("prints attendance and the average", () => {
    const html = buildForm1B(
      info,
      [older, younger],
      new Map([
        ["b1", { present: 9, feedingDays: 10, percent: 90 }],
        ["b2", { present: 7, feedingDays: 10, percent: 70 }],
      ]),
    );
    expect(html).toContain("- ENDLINE");
    expect(html).toContain("Feeding Days (B)");
    expect(html).toContain("90.00%");
    expect(html).toContain("Average Percent Attendance");
    expect(html).toContain("80.00%");
  });
});

describe("Midline master list", () => {
  it("prints the midline weighing, not the baseline or endline", () => {
    const mid = learner({
      midline: {
        measured_at: "2026-10-15",
        height_cm: 111.5,
        weight_kg: 16.25,
        nutritional_status: "normal",
        height_for_age: "normal",
      },
    });
    const html = buildMidlineMasterList(
      info,
      [mid],
      new Map([["b1", { present: 40, feedingDays: 50, percent: 80 }]]),
    );
    expect(html).toContain("SBFP Master List (2026)");
    expect(html).toContain("- MIDLINE");
    expect(html).toContain("10/15/2026");
    expect(html).toContain(">16.25<");
    expect(html).not.toContain(">15<"); // the baseline weight
    expect(html).toContain("80.00%");
  });
});

describe("Form 2", () => {
  it("prints an elementary sheet with the start date and the counts", () => {
    const sheets = buildForm2Sheets(info, [older, younger], "baseline");
    expect(sheets).toHaveLength(1);
    const html = sheets[0];
    expect(html).toContain("Start of Feeding (SY 2026-2027)");
    expect(html).toContain("June 15, 2026");
    expect(html).toContain("1.&nbsp; Kinder");
    expect(html).toContain("7.&nbsp; Grade VI");
    expect(html).toContain("Grand Total");
    expect(html).toContain("No. of Pupils-at-risk-of-dropping-out (PARDOs)");
  });

  it("prints a midline sheet dated with the midline weighing", () => {
    const [html] = buildForm2Sheets(info, [older], "midline");
    expect(html).toContain("Midline of Feeding (SY 2026-2027)");
    expect(html).toContain("Date of Midline Weighing");
    expect(html).toContain("October 15, 2026");
  });

  it("adds a secondary sheet only when there are secondary beneficiaries", () => {
    const hs = learner({ id: "b9", grade_level: 8 });
    const sheets = buildForm2Sheets(info, [older, hs], "endline");
    expect(sheets).toHaveLength(2);
    expect(sheets[1]).toContain("1.&nbsp; Grade VII");
    expect(sheets[1]).toContain("End of Feeding");
  });
});

describe("Form 3", () => {
  it("prints at least 20 day columns, the codes, and the deworming mark", () => {
    const html = buildForm3Sheet(
      info,
      { gradeLevel: 1, sectionName: "Alpha", adviserName: "Adviser One", rows: [older] },
      "2026-08",
      ["2026-08-03", "2026-08-04"],
      new Map([["b1", new Map([["2026-08-03", "H+M"], ["2026-08-04", "A"]])]]),
    );
    expect(html).toContain("For the month of AUGUST 2026, SY 2026-2027");
    expect(html).toContain('colspan="20"');
    expect(html).toContain(">8/3<");
    expect(html).toContain(">H+M<");
    expect(html).toContain(">A<");
    expect(html).toContain(">√<");
    expect(html).toContain("Adviser One");
    expect(html).toContain("Present, served twice");
  });
});

describe("Form 4", () => {
  it("prints both lists with signature space for at least three each", () => {
    const html = buildForm4(info, [
      { kind: "consignee", name: "Head Person", designation: "Principal", tel_no: null, mobile_no: "0917", email: "h@deped.gov.ph" },
    ]);
    expect(html).toContain("List of Authorized Consignees (SY: 2026-2027)");
    expect(html).toContain("School Inspection Team (SY: 2026-2027)");
    expect(html.match(/<tr style="height:46px">/g)?.length).toBe(6);
    expect(html).toContain("Use long hand signature.");
  });
});

describe("Form 5", () => {
  it("checks the milk-tolerance column the learner falls in", () => {
    const html = buildForm5Milk(info, [older, younger]);
    expect(html).toContain("Milk Component");
    expect(html.match(/✓/g)?.length).toBe(2);
  });

  it("consolidates per section with before/after bands and attendance", () => {
    const html = buildForm5ConsolidatedSheet(
      info,
      [older, younger],
      new Map([
        ["b1", { present: 9, feedingDays: 10, percent: 90 }],
        ["b2", { present: 7, feedingDays: 10, percent: 70 }],
      ]),
    );
    expect(html).toContain("Consolidated Nutritional Status and Attendance Report");
    expect(html).toContain("KINDER/KINDER A");
    expect(html).toContain("1/ALPHA");
    expect(html).toContain("AVERAGE: 80.00%");
    expect(html).toContain("Classroom Adviser / School Nurse");
  });
});

describe("Form 6", () => {
  it("prints the NFP and milk tables with delivery lines and totals", () => {
    const [nfp, milk] = buildForm6(
      info,
      [older, younger],
      [
        { id: "d1", component: "milk", grade_level: 1, delivered_on: "2026-08-10", packs_new: 100, packs_replacement: 4, packs_rejected: 4, remarks: "spoiled" },
      ],
    );
    expect(nfp).toContain("NFP DELIVERIES (SY 2026-2027)");
    expect(milk).toContain("MILK DELIVERIES (SY 2026-2027)");
    expect(milk).toContain("08/10/2026");
    expect(milk).toContain(">104<");
    expect(milk).toContain("spoiled");
  });
});

describe("Feedback Mechanism log", () => {
  it("lists every entry with its status counts and signatories", () => {
    const html = buildFeedbackLog(info, [
      { received_on: "2026-07-01", source: "Parent / Guardian", raised_by: "A <Parent>", category: "Food quality / safety", concern: "Rice was\nundercooked", action_taken: "Talked to cook", status: "resolved", resolved_on: "2026-07-02" },
      { received_on: "2026-07-05", source: "Learner", raised_by: null, category: null, concern: "Milk too cold", action_taken: null, status: "open", resolved_on: null },
    ]);
    expect(html).toContain("Feedback Mechanism: Issues and Concerns (SY: 2026-2027)");
    expect(html).toContain("A &lt;Parent&gt;");
    expect(html).toContain("Rice was<br>undercooked");
    expect(html).toContain("07/02/2026");
    expect(html).toContain("Open: <b>1</b>");
    expect(html).toContain("Resolved: <b>1</b>");
    expect(html).toContain("SBFP Focal Person");
    expect(html).toContain("Head Person");
  });

  it("prints an empty-state row when nothing is logged", () => {
    expect(buildFeedbackLog(info, [])).toContain("No issues or concerns recorded.");
  });
});

describe("document", () => {
  it("wraps sheets in one printable page-broken document", () => {
    const doc = buildSbfpDocument("SBFP Form 2", "landscape", ["<p>a</p>", "<p>b</p>"]);
    expect(doc).toContain("size: 13in 8.5in");
    expect(doc.match(/class="sheet"/g)?.length).toBe(2);
  });
});
