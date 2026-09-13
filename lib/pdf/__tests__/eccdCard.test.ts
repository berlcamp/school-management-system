import { describe, expect, it } from "vitest";
import { ECCD_MONTH_INITIALS, ECCD_MONTH_NAMES } from "@/lib/constants/eccd";
import { KINDER_ATTENDANCE_MONTHS } from "@/lib/constants/kinderProgress";
import { buildEccdCardHtml, type EccdCardData } from "@/lib/pdf/generateEccdCard";
import type { EccdCompetency, EccdDomain, EccdScaleScore } from "@/types";

/**
 * Two domains of two items each. `scaleScores` deliberately maps only some raw
 * scores, so the "no mapping means blank" rule is exercised rather than assumed.
 */
function makeData(overrides: Partial<EccdCardData> = {}): EccdCardData {
  const domains: EccdDomain[] = [
    { id: "1", code: "GM", name: "Gross Motor", description: "", sort_order: 1, is_active: true, created_at: "", updated_at: "" },
    { id: "2", code: "SE", name: "Social Emotional", description: "", sort_order: 2, is_active: true, created_at: "", updated_at: "" },
  ];
  const competencies = [
    { id: "11", domain_id: "1", code: "GM-1", description: "Makalakaw", sort_order: 1, is_active: true, created_at: "", updated_at: "" },
    { id: "12", domain_id: "1", code: "GM-2", description: "Makalukso", sort_order: 2, is_active: true, created_at: "", updated_at: "" },
    { id: "21", domain_id: "2", code: "SE-1", description: "Modula", sort_order: 1, is_active: true, created_at: "", updated_at: "" },
    { id: "22", domain_id: "2", code: "SE-2", description: "Gakson", sort_order: 2, is_active: true, created_at: "", updated_at: "" },
  ] as EccdCompetency[];
  const scaleScores: EccdScaleScore[] = [
    { id: "a", domain_id: "1", raw_score: 1, scale_score: 7, created_at: "", updated_at: "" },
    { id: "b", domain_id: "1", raw_score: 2, scale_score: 9, created_at: "", updated_at: "" },
    { id: "c", domain_id: "2", raw_score: 2, scale_score: 13, created_at: "", updated_at: "" },
    // raw 1 on domain 2 is deliberately unmapped
  ];

  return {
    school: { name: "San Juan ES", address: "", district: "North District", region: "Caraga", school_id: "131640" },
    student: { first_name: "Darren", middle_name: "S.", last_name: "Beniga", lrn: "131640250036", date_of_birth: "2019-12-20", gender: "Male" },
    section: { name: "Sampaguita" },
    adviserName: "Cheene G. Gonia",
    principalName: "Marianito O. Dargantes",
    principalTitle: "Principal II",
    domains,
    competencies,
    scaleScores,
    assessments: {
      "11": { "1ST_SEM": 1, "2ND_SEM": 1 },
      "12": { "1ST_SEM": 0, "2ND_SEM": 1 },
      "21": { "1ST_SEM": 1, "2ND_SEM": 1 },
      "22": { "1ST_SEM": 0, "2ND_SEM": 1 },
    },
    attendance: Array.from({ length: 11 }, () => ({ classDays: 20, present: 19, absent: 1 })),
    schoolYear: "2025-2026",
    ...overrides,
  };
}

/** Pulls the two score values off a TOTAL / SCALED row of a given domain block. */
function scoreRow(html: string, domainName: string, label: string): [string, string] {
  const block = html.split(`${domainName.toUpperCase()} DOMAIN`)[1] ?? "";
  const row = block.split(label)[1] ?? "";
  const marks = [...row.matchAll(/<span class="c-mark">([^<]*)<\/span>/g)].slice(0, 2);
  return [marks[0]?.[1].trim() ?? "", marks[1]?.[1].trim() ?? ""];
}

describe("ECCD trifold", () => {
  it("prints two sides, the outer one folded in three", () => {
    const html = buildEccdCardHtml(makeData());
    expect(html.match(/class="sheet"/g)).toHaveLength(2);
    // outer side: three fixed panels; inner side: one flow container
    expect(html.match(/class="panel"/g)).toHaveLength(3);
    expect(html.match(/class="flow"/g)).toHaveLength(1);
  });

  it("carries the last domain on the outer side and flows the rest", () => {
    const html = buildEccdCardHtml(makeData());
    const [outer, inner] = html.split('<div class="flow">');
    expect(outer).toContain("SOCIAL EMOTIONAL DOMAIN");
    expect(outer).not.toContain("GROSS MOTOR DOMAIN");
    expect(inner).toContain("GROSS MOTOR DOMAIN");
    expect(inner).not.toContain("SOCIAL EMOTIONAL DOMAIN");
  });

  it("totals the ticked items and reads the scaled score off the school's mapping", () => {
    const html = buildEccdCardHtml(makeData());
    expect(scoreRow(html, "Gross Motor", "TOTAL SCORE")).toEqual(["1", "2"]);
    expect(scoreRow(html, "Gross Motor", "SCALED SCORE")).toEqual(["7", "9"]);
  });

  it("leaves an unmapped raw score blank rather than guessing one", () => {
    const html = buildEccdCardHtml(makeData());
    // Social Emotional raw 1 has no row in sms_eccd_scale_scores
    expect(scoreRow(html, "Social Emotional", "TOTAL SCORE")).toEqual(["1", "2"]);
    expect(scoreRow(html, "Social Emotional", "SCALED SCORE")).toEqual(["", "13"]);
  });

  it("sums only the scaled scores it has, and blanks the standard score", () => {
    const html = buildEccdCardHtml(makeData());
    const adm = html.split('<table class="adm">')[1].split("</table>")[0];
    const cells = [...adm.matchAll(/<td>([^<]*)<\/td>/g)].map((m) => m[1].trim());
    // 1st: GM 7 + SE unmapped = 7. 2nd: GM 9 + SE 13 = 22. Standard score and
    // its interpretation are written in by hand.
    expect(cells.slice(0, 3)).toEqual(["7", "", ""]);
    expect(cells.slice(3, 6)).toEqual(["22", "", ""]);
  });

  it("blanks the scaled total when the school has mapped nothing at all", () => {
    const html = buildEccdCardHtml(makeData({ scaleScores: [] }));
    const adm = html.split('<table class="adm">')[1].split("</table>")[0];
    const cells = [...adm.matchAll(/<td>([^<]*)<\/td>/g)].map((m) => m[1].trim());
    expect(cells.slice(0, 3)).toEqual(["", "", ""]);
  });

  it("scores the same raw total differently for learners in different age bands", () => {
    // Both learners tick one Gross Motor item. The mapping holds a banded row
    // for each band, so the card must resolve the band from the birth date.
    const banded = [
      { id: "x", domain_id: "1", raw_score: 1, scale_score: 13, age_band: "4.1-5.0", created_at: "", updated_at: "" },
      { id: "y", domain_id: "1", raw_score: 1, scale_score: 11, age_band: "5.1-5.11", created_at: "", updated_at: "" },
    ];
    const younger = makeData({ scaleScores: banded });
    younger.student.date_of_birth = "2021-01-01"; // 4y5m at 1 June 2025
    const older = makeData({ scaleScores: banded });
    older.student.date_of_birth = "2020-03-01"; // 5y3m at 1 June 2025

    expect(scoreRow(buildEccdCardHtml(younger), "Gross Motor", "SCALED SCORE")[0]).toBe("13");
    expect(scoreRow(buildEccdCardHtml(older), "Gross Motor", "SCALED SCORE")[0]).toBe("11");
  });

  it("re-bands between the two administrations when the learner crosses a band", () => {
    // 4y11m at the first administration, 5y8m at the second.
    const data = makeData({
      scaleScores: [
        { id: "x", domain_id: "1", raw_score: 1, scale_score: 13, age_band: "4.1-5.0", created_at: "", updated_at: "" },
        { id: "y", domain_id: "1", raw_score: 2, scale_score: 4, age_band: "4.1-5.0", created_at: "", updated_at: "" },
        { id: "z", domain_id: "1", raw_score: 2, scale_score: 7, age_band: "5.1-5.11", created_at: "", updated_at: "" },
      ],
    });
    data.student.date_of_birth = "2020-07-01";
    // 1st sem raw 1 -> 4.1-5.0 band -> 13; 2nd sem raw 2 -> 5.1-5.11 band -> 7
    expect(scoreRow(buildEccdCardHtml(data), "Gross Motor", "SCALED SCORE")).toEqual(["13", "7"]);
  });

  it("names the band it scored each administration against", () => {
    const html = buildEccdCardHtml(makeData());
    expect(html).toContain("5.1 \u2013 5.11 years");
  });

  it("keeps using an unbanded mapping, so nothing changes before a band is entered", () => {
    // makeData's mapping is entirely unbanded, exactly as every row is before
    // migration 186 is applied.
    const html = buildEccdCardHtml(makeData());
    expect(scoreRow(html, "Gross Motor", "SCALED SCORE")).toEqual(["7", "9"]);
  });

  it("leaves the standard score blank while DepEd's table is unknown", () => {
    const html = buildEccdCardHtml(makeData());
    const adm = html.split('<table class="adm">')[1].split("</table>")[0];
    const cells = [...adm.matchAll(/<td>([^<]*)<\/td>/g)].map((m) => m[1].trim());
    expect(cells.slice(0, 3)).toEqual(["7", "", ""]);
  });

  it("escapes checklist text, which any staff user can edit at /settings/eccd", () => {
    const data = makeData();
    data.competencies[0].description = 'Makalakaw <script>alert("x")</script>';
    const html = buildEccdCardHtml(data);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("lists every domain and its item count on the cover", () => {
    const html = buildEccdCardHtml(makeData());
    expect(html).toContain("Gross Motor Domain nga may 2 ka aytem");
    expect(html).toContain("Social Emotional Domain nga may 2 ka aytem");
  });

  it("keeps its month columns aligned with the months it aggregates", () => {
    // The headings come from the ECCD constants and the figures from
    // KINDER_ATTENDANCE_MONTHS; a drift between them would silently shift every
    // learner's attendance one month sideways.
    expect(ECCD_MONTH_INITIALS).toHaveLength(KINDER_ATTENDANCE_MONTHS.length);
    expect(ECCD_MONTH_NAMES).toHaveLength(KINDER_ATTENDANCE_MONTHS.length);
    expect(ECCD_MONTH_NAMES.map((n) => n[0])).toEqual(ECCD_MONTH_INITIALS);
  });

  it("heads the attendance grid with the eleven Cebuano months and totals them", () => {
    const html = buildEccdCardHtml(makeData());
    const att = html.split('<table class="att">')[1].split("</table>")[0];
    expect([...att.matchAll(/<th title="([^"]+)">/g)].map((m) => m[1])).toEqual([
      "Hunyo", "Hulyo", "Agosto", "Septyembre", "Oktubre", "Nobyembre",
      "Disyembre", "Enero", "Pebrero", "Marso", "Abril",
    ]);
    expect(att).toContain(">220<"); // 11 months x 20 class days
    expect(att).toContain(">209<"); // 11 months x 19 present
  });
});
