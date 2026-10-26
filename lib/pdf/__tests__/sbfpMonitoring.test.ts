/**
 * Hot Meals deliveries report and the four Monitoring printouts (migration
 * 220), built from synthetic data (never real learners or schools).
 */

import { describe, expect, it } from "vitest";
import {
  buildDispatchLogSheet,
  buildHotMealsReport,
  buildKitchenLogSheet,
  buildQualitySummary,
  buildReceivingLogSheet,
  dateTime,
  time12,
  type ReceivingLogSheet,
  type SbfpHeaderInfo,
} from "@/lib/pdf/generateSbfpForms";
import { summarizeQuality } from "@/lib/utils/sbfp";

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
  feedingStartDate: null,
  feedingEndDate: null,
  midlineWeighingDate: null,
  isLastMileSchool: null,
};

describe("formatting", () => {
  it("prints times as 12-hour clock with seconds", () => {
    expect(time12("13:05:09")).toBe("1:05:09 PM");
    expect(time12("00:30:00")).toBe("12:30:00 AM");
    expect(time12("12:00")).toBe("12:00:00 PM");
    expect(time12(null)).toBe("");
  });

  it("prints a timestamp in Philippine time", () => {
    expect(dateTime("2026-08-03T23:30:00Z")).toBe("08/04/2026 7:30 AM");
  });
});

describe("Hot Meals deliveries report", () => {
  it("lists viands by kind with servings and totals", () => {
    const html = buildHotMealsReport(info, 120, [
      {
        id: "1",
        component: "hot_meals",
        grade_level: null,
        delivered_on: "2026-08-03",
        packs_new: 0,
        packs_replacement: 0,
        packs_rejected: 0,
        remarks: "Late <arrival>",
        meals: [
          { kind: "new", quantity: 3, unit: "pot", viand_name: "Lugaw", servings: 80 },
          { kind: "replacement", quantity: 1, unit: "tray", viand_name: "Adobo", servings: 15 },
          { kind: "rejected", quantity: 1, unit: "tray", viand_name: "Adobo", servings: 15 },
        ],
      },
    ]);
    expect(html).toContain("Hot Meals Deliveries (SY 2026-2027)");
    expect(html).toContain("Number of Beneficiaries");
    expect(html).toContain("3 pot <b>Lugaw</b> – 80");
    expect(html).toContain(">95<"); // new + replacement servings
    expect(html).toContain("Late &lt;arrival&gt;");
    expect(html).toContain(">All<");
  });

  it("says so when nothing was delivered", () => {
    expect(buildHotMealsReport(info, 0, [])).toContain("No hot-meals deliveries recorded.");
  });
});

describe("monitoring sheets", () => {
  it("prints the kitchen tool with the school counts and checklists", () => {
    const html = buildKitchenLogSheet(info, {
      loggedAt: "2026-08-03T00:00:00Z",
      kitchenName: "Sample Kitchen ES",
      target: [
        { district: "Central", names: ["A ES", "B ES"] },
        { district: "North", names: ["C ES"] },
      ],
      actual: [{ district: "Central", names: ["A ES"] }],
      hasExcessFood: false,
      hasRejectedFood: true,
      rejectedReason: "Spoiled",
      hygiene: { hairnets: true, masks: false },
      vehicle: { personnel_identified: true },
      deliveryPersonnelName: "Driver Name",
      remarks: null,
      preparedBy: "Monitor Name",
    });
    expect(html).toContain("SBFP Daily Monitoring Tool for Kitchens");
    expect(html).toContain("Target number of schools to prepare for: <b>3</b>");
    expect(html).toContain("Actual number of schools prepared for: <b>1</b>");
    expect(html).toContain("CENTRAL (2)");
    expect(html).toContain("Spoiled");
    expect(html).toContain("Driver Name");
    expect(html).toContain("Monitor Name");
  });

  it("prints the dispatch tool", () => {
    const html = buildDispatchLogSheet(info, {
      loggedAt: "2026-08-03T00:00:00Z",
      kitchenName: "At school site",
      schools: [{ district: "East", names: ["D ES"] }],
      vehicle: "Bao-Bao",
      departedAt: "10:15:00",
      weather: "Raining (light)",
      remarks: null,
      preparedBy: null,
    });
    expect(html).toContain("SBFP Food Dispatch Daily Monitoring Tool");
    expect(html).toContain("10:15:00 AM");
    expect(html).toContain("Bao-Bao");
    expect(html).toContain("Raining (light)");
  });

  it("prints the receiving tool, None for zero counts", () => {
    const log: ReceivingLogSheet = {
      receivedOn: "2026-08-03",
      arrivedAt: "11:00:00",
      weather: "Sunny",
      deliveryRemarks: null,
      foodCondition: { temperature: "good", aroma: "poor" },
      conditionRemarks: null,
      setsExpected: 100,
      setsReceived: 98,
      setsDamaged: 0,
      setsRejected: 2,
      setsAdditional: 0,
      safety: { stored: true },
      totalBeneficiaries: 100,
      presentBeneficiaries: 95,
      absentBeneficiaries: 5,
      mealsConsumed: 95,
      leftoverMeals: 0,
      additionalServingRequests: 0,
      hasIncident: true,
      incidentDetails: "One learner vomited; referred to the nurse.",
      remarks: null,
      preparedBy: null,
    };
    const html = buildReceivingLogSheet(info, log);
    expect(html).toContain("August 3, 2026");
    expect(html).toContain("Number of Damaged Sets: <span class=\"v\">None</span>");
    expect(html).toContain("Number of Rejected Sets: <span class=\"v\">2</span>");
    expect(html).toContain("referred to the nurse");
  });

  it("prints the quality summary", () => {
    const summaries = summarizeQuality(
      [
        { id: "1", code: "taste", kind: "face", prompt: "Nalamian ko", sort_order: 1, is_active: true },
        { id: "2", code: "liked", kind: "text", prompt: "Unsa ang ganahan", sort_order: 2, is_active: true },
      ],
      [{ answers: { "1": 5, "2": "Sabaw" } }, { answers: { "1": 3 } }],
    );
    const html = buildQualitySummary(info, summaries, 2, "August 2026");
    expect(html).toContain("Nalamian ko");
    expect(html).toContain(">4.00<");
    expect(html).toContain("<li>Sabaw</li>");
    expect(html).toContain("August 2026");
    expect(html).not.toContain("Evaluations by Grade &amp; Section");
  });

  it("prints the quality summary's grade & section breakdown", () => {
    const html = buildQualitySummary(info, [], 3, "August 2026", [
      { label: "Grade 5 - Rizal", count: 2 },
      { label: "Anonymous", count: 1 },
    ]);
    expect(html).toContain("Evaluations by Grade &amp; Section");
    expect(html).toContain("<td>Grade 5 - Rizal</td><td class=\"c\">2</td>");
    expect(html).toContain("<td>Anonymous</td><td class=\"c\">1</td>");
  });
});
