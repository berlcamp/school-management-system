import { describe, expect, it } from "vitest";
import { ECCD_MONTH_INITIALS, ECCD_MONTH_NAMES } from "@/lib/constants/eccd";
import { KINDER_ATTENDANCE_MONTHS } from "@/lib/constants/kinderProgress";
import { buildEccdCardHtml, type EccdCardData } from "@/lib/pdf/generateEccdCard";
import type { EccdCompetency, EccdDomain } from "@/types";

/** The seven official domains in print order; Social Emotional is printed last, on the outer side. */
const OFFICIAL: [code: string, name: string, items: number][] = [
  ["GM", "Gross Motor", 13],
  ["FM", "Fine Motor", 11],
  ["SH", "Self Help", 27],
  ["RL", "Receptive Language", 5],
  ["EL", "Expressive Language", 8],
  ["COG", "Cognitive", 21],
  ["SE", "Social Emotional", 24],
];

/**
 * Raw scores per domain code, [1st sem, 2nd sem]. The 2nd-sem figures are the
 * completed sample card's; the 1st-sem ones are low enough to land in a delay band.
 */
const RAW: Record<string, [number, number]> = {
  GM: [0, 13], FM: [8, 11], SH: [0, 25], RL: [4, 5], EL: [0, 8], COG: [8, 16], SE: [22, 24],
};

/**
 * The official checklist with `RAW` ticked: the first n items of a domain are
 * checked. `items` overrides a domain's item count, to model a checklist edited
 * at /settings/eccd (inactive items never reach the card, so "deactivated" is
 * simply fewer items).
 */
function makeData(
  overrides: Partial<EccdCardData> = {},
  items: Record<string, number> = {},
): EccdCardData {
  const domains: EccdDomain[] = [];
  const competencies: EccdCompetency[] = [];
  const assessments: EccdCardData["assessments"] = {};

  OFFICIAL.forEach(([code, name, official], d) => {
    const domainId = String(d + 1);
    domains.push({ id: domainId, code, name, description: "", sort_order: d + 1, is_active: true, created_at: "", updated_at: "" });
    const count = items[code] ?? official;
    for (let n = 0; n < count; n++) {
      const id = `${domainId}-${n}`;
      competencies.push({ id, domain_id: domainId, code: `${code}-${n + 1}`, description: `${name} item ${n + 1}`, sort_order: n + 1, is_active: true, created_at: "", updated_at: "" } as EccdCompetency);
      assessments[id] = {
        "1ST_SEM": n < RAW[code][0] ? 1 : 0,
        "2ND_SEM": n < RAW[code][1] ? 1 : 0,
      };
    }
  });

  return {
    school: { name: "San Juan ES", address: "", district: "North District", region: "Caraga", school_id: "131640" },
    // 5y5m at the 1st administration, 6y3m at the 2nd: both on the 5.1-5.11 band.
    student: { first_name: "Darren", middle_name: "S.", last_name: "Beniga", lrn: "131640250036", date_of_birth: "2019-12-20", gender: "Male" },
    section: { name: "Sampaguita" },
    adviserName: "Cheene G. Gonia",
    principalName: "Marianito O. Dargantes",
    principalTitle: "Principal II",
    domains,
    competencies,
    assessments,
    attendance: Array.from({ length: 11 }, () => ({ classDays: 20, present: 19, absent: 1 })),
    schoolYear: "2025-2026",
    ...overrides,
  };
}

/** The six cells of the administrations table: [scaled, standard, interpretation] x 2. */
function administrations(html: string): string[] {
  const adm = html.split('<table class="adm">')[1].split("</table>")[0];
  return [...adm.matchAll(/<td>([^<]*)<\/td>/g)].map((m) => m[1].trim());
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

  it("totals the ticked items and scales them off DepEd's table", () => {
    const html = buildEccdCardHtml(makeData());
    expect(scoreRow(html, "Gross Motor", "TOTAL SCORE")).toEqual(["0", "13"]);
    expect(scoreRow(html, "Gross Motor", "SCALED SCORE")).toEqual(["1", "11"]);
    expect(scoreRow(html, "Social Emotional", "SCALED SCORE")).toEqual(["10", "13"]);
  });

  it("reproduces the completed sample card's scaled scores", () => {
    const html = buildEccdCardHtml(makeData());
    expect(scoreRow(html, "Fine Motor", "SCALED SCORE")[1]).toBe("12");
    expect(scoreRow(html, "Self Help", "SCALED SCORE")[1]).toBe("10");
    expect(scoreRow(html, "Receptive Language", "SCALED SCORE")[1]).toBe("11");
    expect(scoreRow(html, "Cognitive", "SCALED SCORE")[1]).toBe("8");
  });

  it("converts the sum to a Standard Score and interprets it", () => {
    // 1st: 1 + 7 + 2 + 8 + 5 + 1 + 10 = 34 -> 44. 2nd: 11 + 12 + 10 + 11 + 11 + 8 + 13 = 76 -> 105.
    expect(administrations(buildEccdCardHtml(makeData()))).toEqual([
      "34", "44", "Suggest Significant Delay on Overall Development",
      "76", "105", "Average Overall Development",
    ]);
  });

  it("scores the same raw total differently for learners in different age bands", () => {
    const younger = makeData();
    younger.student.date_of_birth = "2021-01-01"; // 4y5m at 1 June 2025
    const older = makeData();
    older.student.date_of_birth = "2020-03-01"; // 5y3m at 1 June 2025
    // Both tick 8 Fine Motor items in the 1st sem: 9 at 4.1-5.0, 7 at 5.1-5.11.
    expect(scoreRow(buildEccdCardHtml(younger), "Fine Motor", "SCALED SCORE")[0]).toBe("9");
    expect(scoreRow(buildEccdCardHtml(older), "Fine Motor", "SCALED SCORE")[0]).toBe("7");
  });

  it("re-bands between the two administrations when the learner crosses a band", () => {
    const data = makeData();
    data.student.date_of_birth = "2020-07-01"; // 4y11m at the 1st, 5y8m at the 2nd
    // Social Emotional raw 22 -> 4.1-5.0 band -> 10; raw 24 -> 5.1-5.11 band -> 13
    expect(scoreRow(buildEccdCardHtml(data), "Social Emotional", "SCALED SCORE")).toEqual(["10", "13"]);
  });

  it("names the band it scored each administration against", () => {
    const html = buildEccdCardHtml(makeData());
    expect(html).toContain("5.1 \u2013 5.11 years");
  });

  it("blanks a domain with an item added, and the Standard Score with it", () => {
    const html = buildEccdCardHtml(makeData({}, { GM: 14 }));
    expect(scoreRow(html, "Gross Motor", "TOTAL SCORE")).toEqual(["0", "13"]);
    expect(scoreRow(html, "Gross Motor", "SCALED SCORE")).toEqual(["", ""]);
    expect(scoreRow(html, "Fine Motor", "SCALED SCORE")).toEqual(["7", "12"]);
    expect(administrations(html)).toEqual(["", "", "", "", "", ""]);
  });

  it("blanks a domain with an item deactivated", () => {
    const html = buildEccdCardHtml(makeData({}, { FM: 10 }));
    expect(scoreRow(html, "Fine Motor", "SCALED SCORE")).toEqual(["", ""]);
    expect(administrations(html)).toEqual(["", "", "", "", "", ""]);
  });

  it("never prints a partial sum when an official domain is missing", () => {
    const data = makeData();
    data.domains = data.domains.filter((d) => d.code !== "EL");
    expect(administrations(buildEccdCardHtml(data))).toEqual(["", "", "", "", "", ""]);
  });

  it("prints an added domain unscored and leaves it out of the sum", () => {
    const data = makeData();
    data.domains.push({ id: "99", code: "MUS", name: "Music", description: "", sort_order: 0, is_active: true, created_at: "", updated_at: "" });
    data.competencies.push({ id: "99-0", domain_id: "99", code: "MUS-1", description: "Makakanta", sort_order: 1, is_active: true, created_at: "", updated_at: "" } as EccdCompetency);
    data.assessments["99-0"] = { "1ST_SEM": 1, "2ND_SEM": 1 };
    const html = buildEccdCardHtml(data);
    expect(scoreRow(html, "Music", "SCALED SCORE")).toEqual(["", ""]);
    expect(administrations(html).slice(0, 2)).toEqual(["34", "44"]);
  });

  it("leaves every scaled score blank without a birth date", () => {
    const data = makeData();
    data.student.date_of_birth = null;
    const html = buildEccdCardHtml(data);
    expect(scoreRow(html, "Gross Motor", "SCALED SCORE")).toEqual(["", ""]);
    expect(administrations(html)).toEqual(["", "", "", "", "", ""]);
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
    expect(html).toContain("Gross Motor Domain nga may 13 ka aytem");
    expect(html).toContain("Social Emotional Domain nga may 24 ka aytem");
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
