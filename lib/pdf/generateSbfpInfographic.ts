/**
 * One-page A4 infographic of the SBFP division dashboard (/sbfp-viewer).
 *
 * Takes the figures the page already holds, narrowed by the same filters, and
 * recomputes nothing a second way: every rate comes from `sbfpOverview.ts`, so
 * the printout and the screen cannot disagree. Counts only — no learner name
 * reaches this document.
 *
 * Flat style on a healthy green with one orange accent. The nutrition bars keep
 * the dashboard's diverging band colours, and identity is never colour alone:
 * every waffle and segment carries its figure and every band is named in the
 * legend, so a greyscale photocopy still reads.
 */

import { SBFP_WEIGHING_PERIODS } from "@/lib/constants/sbfp";
import {
  ALL_DISTRICTS,
  OTHER_DISTRICT,
  SBFP_BAND_STYLE,
  attendancePercent,
  beneficiariesByDistrict,
  formatCount,
  formatRate,
  nutritionDistribution,
  openConcerns,
  rehabilitationPercent,
  topSchoolsByBeneficiaries,
  type BeneficiaryGroup,
  type NutritionDistribution,
  type SbfpNutritionRow,
  type SbfpOverviewSchool,
  type SbfpOverviewTotals,
} from "@/lib/utils/sbfpOverview";
import { jsPDF } from "jspdf";

export interface SbfpInfographicInput {
  schoolYear: string;
  /** The district filter's value: ALL_DISTRICTS, OTHER_DISTRICT or a district. */
  district: string;
  /** The grade band's label, or null with every grade level. */
  bandLabel: string | null;
  totals: SbfpOverviewTotals;
  schools: readonly SbfpOverviewSchool[];
  nutrition: readonly SbfpNutritionRow[];
  learnerNutrition: readonly SbfpNutritionRow[];
  generatedAt?: Date;
}

// Lucide icons (ISC licence), inlined because jsPDF draws no SVG.
const ICONS = {
  beneficiaries:
    '<path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/>',
  school:
    '<path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="M18 5v16"/><path d="m4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6"/><path d="m6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11"/><path d="M6 5v16"/><circle cx="12" cy="9" r="2"/>',
  meals:
    '<path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"/><path d="m2.1 21.8 6.4-6.3"/><path d="m19 5-7 7"/>',
  health:
    '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/><path d="M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>',
  truck:
    '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  soup:
    '<path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z"/><path d="M7 21h10"/><path d="M19.5 12 22 6"/><path d="M16.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.73 1.62"/><path d="M11.25 3c.27.1.8.53.74 1.36-.05.83-.93 1.2-.98 2.02-.06.78.33 1.24.72 1.62"/><path d="M6.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.74 1.62"/>',
  concerns:
    '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M12 15h.01"/><path d="M12 7v4"/>',
  clipboard:
    '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  pin:
    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  scale:
    '<path d="M12 3v18"/><path d="m19 8 3 8a5 5 0 0 1-6 0zV7"/><path d="M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1"/><path d="m5 8 3 8a5 5 0 0 1-6 0zV7"/><path d="M7 21h10"/>',
} as const;

type IconName = keyof typeof ICONS;

/** Images are optional: without them (node, a failed load) the page still prints. */
export interface InfographicAssets {
  logo?: string;
  icons?: Partial<Record<IconName, string>>;
}

const C = {
  brandDeep: "#064E3B",
  brand: "#047857",
  brandTint: "#D1FAE5",
  brandWash: "#ECFDF5",
  accent: "#C2410C",
  accentTint: "#FFEDD5",
  ink: "#0F172A",
  muted: "#475569",
  border: "#D7E5DF",
  track: "#E2E8F0",
  white: "#FFFFFF",
  onDeep: "#A7F3D0",
};

const PAGE_W = 210;
const MARGIN = 10;
const CONTENT_W = PAGE_W - MARGIN * 2;
const GAP = 4;
/** Between stacked sections: wider than GAP, so the page fills to its footer. */
const ROW_GAP = 5.5;
const COL_W = (CONTENT_W - GAP) / 2;

type Font = "normal" | "bold";

function text(
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  opts: { size: number; color?: string; style?: Font; align?: "left" | "center" | "right" },
) {
  doc.setFont("helvetica", opts.style ?? "normal");
  doc.setFontSize(opts.size);
  doc.setTextColor(opts.color ?? C.ink);
  doc.text(value, x, y, { align: opts.align ?? "left" });
}

/** Shrinks to fit, so a large division's figures never run out of their tile. */
function fittedSize(doc: jsPDF, value: string, size: number, maxWidth: number, style: Font = "bold"): number {
  doc.setFont("helvetica", style);
  let s = size;
  while (s > 8) {
    doc.setFontSize(s);
    if (doc.getTextWidth(value) <= maxWidth) break;
    s -= 0.5;
  }
  return s;
}

function truncate(doc: jsPDF, value: string, maxWidth: number, size: number): string {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  if (doc.getTextWidth(value) <= maxWidth) return value;
  let v = value;
  while (v.length > 1 && doc.getTextWidth(`${v}...`) > maxWidth) v = v.slice(0, -1);
  return `${v.trimEnd()}...`;
}

function card(doc: jsPDF, x: number, y: number, w: number, h: number, fill = C.white) {
  doc.setFillColor(fill);
  doc.setDrawColor(C.border);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, 2, 2, "FD");
}

function icon(
  doc: jsPDF,
  assets: InfographicAssets,
  name: IconName,
  x: number,
  y: number,
  size: number,
  tint = C.brandTint,
) {
  doc.setFillColor(tint);
  doc.circle(x + size / 2, y + size / 2, size / 2, "F");
  const png = assets.icons?.[name];
  if (png) {
    const pad = size * 0.2;
    doc.addImage(png, "PNG", x + pad, y + pad, size - pad * 2, size - pad * 2);
  }
}

function sectionTitle(
  doc: jsPDF,
  assets: InfographicAssets,
  name: IconName,
  title: string,
  subtitle: string | null,
  x: number,
  y: number,
) {
  icon(doc, assets, name, x, y, 7);
  text(doc, title, x + 9, y + (subtitle ? 3 : 4.6), { size: 10.5, style: "bold" });
  if (subtitle) text(doc, subtitle, x + 9, y + 6.6, { size: 7.5, color: C.muted });
}

/** The 100-cell grid: one square per percent, its figure printed beside it. */
function waffle(doc: jsPDF, percent: number | null, x: number, y: number, fill: string) {
  const cell = 2.5;
  const gap = 0.4;
  const filled = percent === null ? 0 : Math.round(Math.min(100, Math.max(0, percent)));
  // Fills from the bottom-left, the way a level rises.
  for (let i = 0; i < 100; i++) {
    const col = i % 10;
    const row = 9 - Math.floor(i / 10);
    doc.setFillColor(i < filled ? fill : C.track);
    doc.rect(x + col * (cell + gap), y + row * (cell + gap), cell, cell, "F");
  }
  return 10 * cell + 9 * gap;
}

/** A two-part bar that names each side, for a split of one whole. */
function splitBar(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  a: { label: string; value: number; fill: string; ink: string },
  b: { label: string; value: number; fill: string; ink: string },
) {
  const h = 6;
  const total = a.value + b.value;
  text(doc, `${a.label}  ${formatCount(a.value)}`, x, y - 1.2, { size: 8, style: "bold", color: C.ink });
  text(doc, `${formatCount(b.value)}  ${b.label}`, x + w, y - 1.2, {
    size: 8,
    style: "bold",
    color: C.ink,
    align: "right",
  });
  if (total === 0) {
    doc.setFillColor(C.track);
    doc.rect(x, y, w, h, "F");
    return;
  }
  const aw = (a.value / total) * w;
  doc.setFillColor(a.fill);
  doc.rect(x, y, aw, h, "F");
  doc.setFillColor(b.fill);
  doc.rect(x + aw, y, w - aw, h, "F");
  const pct = (v: number) => `${Math.round((v / total) * 100)}%`;
  if (aw > 10) text(doc, pct(a.value), x + 1.5, y + 4.2, { size: 8, style: "bold", color: a.ink });
  if (w - aw > 10) {
    text(doc, pct(b.value), x + w - 1.5, y + 4.2, { size: 8, style: "bold", color: b.ink, align: "right" });
  }
}

/** One stacked bar of the nutritional bands, or a dashed outline when empty. */
function bandBar(doc: jsPDF, dist: NutritionDistribution, x: number, y: number, w: number, h: number) {
  const banded = dist.total - dist.unrecorded;
  if (banded === 0) {
    doc.setDrawColor("#94A3B8");
    doc.setLineWidth(0.25);
    doc.setLineDashPattern([1, 1], 0);
    doc.rect(x, y, w, h, "S");
    doc.setLineDashPattern([], 0);
    text(doc, "Not weighed yet", x + w / 2, y + h / 2 + 1, { size: 7.5, color: C.muted, align: "center" });
    return;
  }
  let cursor = x;
  for (const b of dist.bands) {
    if (b.count === 0) continue;
    const seg = (b.percent / 100) * w;
    const style = SBFP_BAND_STYLE[b.key];
    doc.setFillColor(style?.fill ?? C.track);
    doc.rect(cursor, y, Math.max(seg, 0.4), h, "F");
    // A segment too narrow for its figure relies on the legend for its name.
    if (seg >= 9) {
      text(doc, `${Math.round(b.percent)}%`, cursor + seg / 2, y + h / 2 + 1, {
        size: 7.5,
        style: "bold",
        color: style?.ink ?? C.ink,
        align: "center",
      });
    }
    cursor += seg;
  }
}

function scopeLine(input: SbfpInfographicInput): string {
  const district =
    input.district === ALL_DISTRICTS
      ? "All districts"
      : input.district === OTHER_DISTRICT
        ? "Other districts"
        : `${input.district} District`;
  return [`SY ${input.schoolYear}`, district, input.bandLabel ?? "All grade levels"].join("  |  ");
}

function normalPercent(d: NutritionDistribution): number | null {
  const banded = d.total - d.unrecorded;
  if (banded === 0) return null;
  return d.bands.find((b) => b.key === "normal")?.percent ?? null;
}

function drawHeader(doc: jsPDF, input: SbfpInfographicInput, assets: InfographicAssets) {
  doc.setFillColor(C.brandDeep);
  doc.rect(0, 0, PAGE_W, 34, "F");
  doc.setFillColor(C.accent);
  doc.rect(0, 34, PAGE_W, 1.2, "F");

  let tx = MARGIN;
  if (assets.logo) {
    doc.setFillColor(C.white);
    doc.circle(MARGIN + 11, 17, 11, "F");
    doc.addImage(assets.logo, "PNG", MARGIN + 0.8, 6.8, 20.4, 20.4);
    tx = MARGIN + 26;
  }
  text(doc, "SCHOOLS DIVISION OF BAYUGAN CITY", tx, 11, { size: 8.5, style: "bold", color: C.onDeep });
  text(doc, "School-Based Feeding Program", tx, 20.5, { size: 21, style: "bold", color: C.white });
  text(doc, scopeLine(input), tx, 27.5, { size: 9.5, color: C.white });
}

function drawHero(doc: jsPDF, t: SbfpOverviewTotals, assets: InfographicAssets, y: number): number {
  const tiles: { name: IconName; value: string; label: string; caption: string; tint?: string }[] = [
    {
      name: "beneficiaries",
      value: formatCount(t.beneficiaries),
      label: "Learners fed",
      caption: "SBFP beneficiaries",
    },
    {
      name: "school",
      value: formatCount(t.schoolsFeeding),
      label: "Schools feeding",
      caption: `of ${formatCount(t.schools)} schools`,
    },
    {
      name: "meals",
      value: formatCount(t.days_present),
      label: "Meals served",
      caption: `on ${formatCount(t.feeding_days)} school feeding days`,
    },
    {
      name: "health",
      value: formatCount(t.rehabilitated),
      label: "Reached normal",
      caption: `of ${formatCount(t.wasted_at_baseline)} wasted at baseline`,
      tint: C.accentTint,
    },
  ];
  const h = 27;
  const w = (CONTENT_W - GAP * 3) / 4;
  tiles.forEach((tile, i) => {
    const x = MARGIN + i * (w + GAP);
    card(doc, x, y, w, h);
    icon(doc, assets, tile.name, x + 3, y + 3, 7, tile.tint);
    text(doc, tile.label, x + 11.5, y + 7.6, { size: 8.5, style: "bold", color: C.muted });
    text(doc, tile.value, x + 3, y + 18.5, {
      size: fittedSize(doc, tile.value, 21, w - 6),
      style: "bold",
      color: C.brandDeep,
    });
    text(doc, truncate(doc, tile.caption, w - 6, 7.5), x + 3, y + 23.8, { size: 7.5, color: C.muted });
  });
  return y + h;
}

function drawWhoAndRates(doc: jsPDF, t: SbfpOverviewTotals, assets: InfographicAssets, y: number): number {
  const h = 45;

  // Left: who the programme feeds.
  card(doc, MARGIN, y, COL_W, h);
  sectionTitle(doc, assets, "beneficiaries", "Who the program feeds", null, MARGIN + 3, y + 3);
  const inner = COL_W - 6;
  splitBar(
    doc,
    MARGIN + 3,
    y + 16,
    inner,
    { label: "Male", value: t.male, fill: C.brandDeep, ink: C.white },
    { label: "Female", value: t.female, fill: C.brandTint, ink: C.ink },
  );
  splitBar(
    doc,
    MARGIN + 3,
    y + 28,
    inner,
    { label: "Primary", value: t.primary_count, fill: C.accent, ink: C.white },
    { label: "Secondary", value: t.secondary_count, fill: C.accentTint, ink: C.ink },
  );
  text(doc, "Milk participants", MARGIN + 3, y + 40.5, { size: 8, color: C.muted });
  text(doc, formatCount(t.milk_participants), MARGIN + COL_W - 3, y + 40.5, {
    size: 9.5,
    style: "bold",
    align: "right",
  });

  // Right: the two rates, one square per percent.
  const rx = MARGIN + COL_W + GAP;
  card(doc, rx, y, COL_W, h);
  const half = COL_W / 2;
  const attendance = attendancePercent(t);
  const rehab = rehabilitationPercent(t);
  const rates = [
    { label: "Feeding attendance", value: attendance, fill: C.brand, note: "of expected meals" },
    { label: "Rehabilitated", value: rehab, fill: C.accent, note: "of wasted at baseline" },
  ];
  rates.forEach((r, i) => {
    const cx = rx + i * half;
    text(doc, r.label, cx + 3, y + 5.4, { size: 8.5, style: "bold" });
    const size = waffle(doc, r.value, cx + 3, y + 7.4, r.fill);
    const rate = formatRate(r.value, 0);
    text(doc, rate, cx + 3 + size + 1.5, y + 7.4 + size / 2 + 2, {
      size: fittedSize(doc, rate, 15, half - size - 6),
      style: "bold",
      color: r.fill,
    });
    text(doc, r.value === null ? "No data yet" : r.note, cx + 3, y + 39.2, { size: 7.5, color: C.muted });
  });
  text(doc, "One square = 1%", rx + 3, y + 42.8, { size: 7, color: C.muted });
  return y + h;
}

function drawNutrition(
  doc: jsPDF,
  input: SbfpInfographicInput,
  assets: InfographicAssets,
  y: number,
): number {
  const h = 67;
  card(doc, MARGIN, y, CONTENT_W, h);
  const subject = input.district === ALL_DISTRICTS ? "division" : "district";
  sectionTitle(
    doc,
    assets,
    "scale",
    "Nutritional status, BMI-for-age",
    `Share of weighed learners at each weighing, beneficiaries beside all learners in the ${subject}`,
    MARGIN + 3,
    y + 3,
  );

  // Legend: every band named.
  const periods = SBFP_WEIGHING_PERIODS.map((p) => ({
    ...p,
    dist: nutritionDistribution(input.nutrition, p.value, "bmi"),
    // Learner Health (188) has a baseline and an endline only.
    all: p.value === "midline" ? null : nutritionDistribution(input.learnerNutrition, p.value, "bmi"),
  }));
  let lx = MARGIN + 3;
  const ly = y + 14.5;
  for (const b of periods[0].dist.bands) {
    doc.setFillColor(SBFP_BAND_STYLE[b.key]?.fill ?? C.track);
    doc.rect(lx, ly - 2.4, 2.8, 2.8, "F");
    text(doc, b.label, lx + 3.8, ly, { size: 7.5, color: C.ink });
    lx += 3.8 + doc.getTextWidth(b.label) + 5;
  }

  const labelW = 34;
  const barX = MARGIN + 3 + labelW;
  const barW = CONTENT_W - 6 - labelW - 21;
  const barH = 5.2;
  let cy = y + 18;
  for (const p of periods) {
    text(doc, p.label, MARGIN + 3, cy + 3.7, { size: 9, style: "bold", color: C.brandDeep });
    const rows = [
      { caption: "Beneficiaries", d: p.dist },
      ...(p.all ? [{ caption: "All learners", d: p.all }] : []),
    ];
    rows.forEach((row, i) => {
      const ry = cy + i * (barH + 1.1);
      text(doc, row.caption, barX - 2, ry + 3.6, { size: 7.5, color: C.muted, align: "right" });
      bandBar(doc, row.d, barX, ry, barW, barH);
      const banded = row.d.total - row.d.unrecorded;
      text(doc, banded === 0 ? "-" : `${formatCount(banded)} weighed`, MARGIN + CONTENT_W - 3, ry + 3.6, {
        size: 7,
        color: C.muted,
        align: "right",
      });
    });
    cy += rows.length * (barH + 1.1) + 1.2;
  }

  // Callout: the one sentence the section exists to say, only when it is true
  // to say it, meaning both weighings of the beneficiaries have readings.
  const start = normalPercent(periods[0].dist);
  const end = normalPercent(periods[2].dist);
  const callY = y + h - 8.5;
  doc.setFillColor(C.brandWash);
  doc.roundedRect(MARGIN + 3, callY, CONTENT_W - 6, 6.2, 1, 1, "F");
  const message =
    start !== null && end !== null
      ? `Beneficiaries at normal BMI: ${start.toFixed(1)}% at baseline, ${end.toFixed(1)}% at endline.`
      : "The baseline-to-endline change appears here once beneficiaries have both weighings.";
  text(doc, message, MARGIN + CONTENT_W / 2, callY + 4.2, {
    size: 8.5,
    style: "bold",
    color: C.brandDeep,
    align: "center",
  });
  return y + h;
}

function drawReach(
  doc: jsPDF,
  input: SbfpInfographicInput,
  assets: InfographicAssets,
  y: number,
): number {
  const h = 46;
  card(doc, MARGIN, y, COL_W, h);
  const single = input.district !== ALL_DISTRICTS;
  sectionTitle(
    doc,
    assets,
    "pin",
    single ? "Schools feeding the most learners" : "Learners fed by district",
    null,
    MARGIN + 3,
    y + 3,
  );
  const groups: BeneficiaryGroup[] = single
    ? topSchoolsByBeneficiaries(input.schools)
    : beneficiariesByDistrict(input.schools);
  const max = Math.max(1, ...groups.map((g) => g.beneficiaries));
  const labelW = single ? 37 : 16;
  const valueW = 12;
  const barX = MARGIN + 3 + labelW;
  const barW = COL_W - 6 - labelW - valueW;
  if (groups.length === 0) {
    text(doc, "No school is feeding yet.", MARGIN + 3, y + 18, { size: 8.5, color: C.muted });
  }
  const step = Math.min(6.6, 33 / Math.max(1, groups.length));
  groups.forEach((g, i) => {
    const gy = y + 12.5 + i * step;
    text(doc, truncate(doc, g.label, labelW - 1.5, 8), MARGIN + 3, gy + 3.4, { size: 8 });
    doc.setFillColor(C.track);
    doc.rect(barX, gy, barW, 4.4, "F");
    doc.setFillColor(C.brand);
    doc.rect(barX, gy, (g.beneficiaries / max) * barW, 4.4, "F");
    text(doc, formatCount(g.beneficiaries), MARGIN + COL_W - 3, gy + 3.4, {
      size: 8,
      style: "bold",
      align: "right",
    });
  });

  const t = input.totals;
  const rx = MARGIN + COL_W + GAP;
  card(doc, rx, y, COL_W, h);
  sectionTitle(doc, assets, "truck", "Food delivered to schools", null, rx + 3, y + 3);
  const figures = [
    { label: "Deliveries logged", value: t.deliveries },
    { label: "Packs received", value: t.packs_new },
    { label: "Replacement packs", value: t.packs_replacement },
    { label: "Packs rejected", value: t.packs_rejected },
    { label: "Hot meal deliveries", value: t.hot_meal_deliveries },
    { label: "Servings delivered", value: t.servings_new },
    { label: "Replacement servings", value: t.servings_replacement },
    { label: "Servings rejected", value: t.servings_rejected },
  ];
  const cellW = (COL_W - 6) / 2;
  figures.forEach((f, i) => {
    // Packs fill the left column, hot meals the right.
    const col = i < 4 ? 0 : 1;
    const row = i % 4;
    const fx = rx + 3 + col * cellW;
    const fy = y + 12.5 + row * 8.2;
    const value = formatCount(f.value);
    text(doc, value, fx, fy + 3.6, { size: fittedSize(doc, value, 12, cellW - 3), style: "bold", color: C.brandDeep });
    text(doc, f.label, fx, fy + 6.6, { size: 7, color: C.muted });
  });
  return y + h;
}

function drawMonitoring(doc: jsPDF, t: SbfpOverviewTotals, assets: InfographicAssets, y: number): number {
  const h = 27;
  card(doc, MARGIN, y, CONTENT_W, h);
  sectionTitle(doc, assets, "clipboard", "Monitoring and feedback", null, MARGIN + 3, y + 3);
  const items = [
    { label: "Kitchen logs", value: t.kitchen_logs },
    { label: "Dispatch logs", value: t.dispatch_logs },
    { label: "Receiving logs", value: t.receiving_logs },
    { label: "Quality evaluations", value: t.quality_evaluations },
  ];
  const leftW = 112;
  const w = leftW / items.length;
  items.forEach((item, i) => {
    const ix = MARGIN + 3 + i * w;
    const value = formatCount(item.value);
    text(doc, value, ix, y + 18, { size: fittedSize(doc, value, 15, w - 3), style: "bold", color: C.brandDeep });
    text(doc, item.label, ix, y + 22.5, { size: 7.5, color: C.muted });
  });

  const fx = MARGIN + 3 + leftW + 3;
  const fw = CONTENT_W - 6 - leftW - 3;
  doc.setDrawColor(C.border);
  doc.setLineWidth(0.25);
  doc.line(fx - 3, y + 4, fx - 3, y + h - 4);
  icon(doc, assets, "concerns", fx, y + 3, 7, C.accentTint);
  text(doc, "Concerns raised", fx + 9, y + 7.6, { size: 9, style: "bold" });
  const raised = t.feedback_open + t.feedback_in_progress + t.feedback_resolved;
  text(doc, `${formatCount(t.feedback_resolved)} resolved`, fx, y + 15, { size: 8, style: "bold" });
  text(doc, `${formatCount(openConcerns(t))} open`, fx + fw, y + 15, { size: 8, style: "bold", align: "right" });
  doc.setFillColor(C.track);
  doc.rect(fx, y + 16.5, fw, 3.6, "F");
  if (raised > 0) {
    doc.setFillColor(C.brand);
    doc.rect(fx, y + 16.5, (t.feedback_resolved / raised) * fw, 3.6, "F");
  }
  text(doc, `${formatCount(raised)} in all`, fx, y + 23.5, { size: 7, color: C.muted });
  return y + h;
}

function drawFooter(doc: jsPDF, input: SbfpInfographicInput, y: number) {
  const generated = (input.generatedAt ?? new Date()).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const notes = [
    "Rehabilitated: wasted or severely wasted at baseline who reached normal or above by endline. " +
      "Attendance: meals served over beneficiaries x feeding days. Learner Health has no midline weighing.",
  ];
  if (input.bandLabel) {
    notes.push(
      `Beneficiaries, deliveries and nutrition are narrowed to ${input.bandLabel}. Feeding days, hot meals, ` +
        "monitoring logs and feedback cover every grade level, since schools do not record them per grade.",
    );
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  let ny = y;
  for (const note of notes) {
    for (const line of doc.splitTextToSize(note, CONTENT_W) as string[]) {
      text(doc, line, MARGIN, ny, { size: 7, color: C.muted });
      ny += 3;
    }
  }
  text(doc, `Source: School Management System, Schools Division of Bayugan City. As of ${generated}.`, MARGIN, 291, {
    size: 7,
    color: C.muted,
  });
}

/** Draws the page. Pure: no browser needed, which is what the unit test relies on. */
export function buildSbfpInfographic(input: SbfpInfographicInput, assets: InfographicAssets = {}): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setProperties({ title: `School-Based Feeding Program, SY ${input.schoolYear}` });

  drawHeader(doc, input, assets);
  let y = drawHero(doc, input.totals, assets, 40);
  y = drawWhoAndRates(doc, input.totals, assets, y + ROW_GAP);
  y = drawNutrition(doc, input, assets, y + ROW_GAP);
  y = drawReach(doc, input, assets, y + ROW_GAP);
  y = drawMonitoring(doc, input.totals, assets, y + ROW_GAP);
  drawFooter(doc, input, y + 3.6);
  return doc;
}

export function sbfpInfographicFilename(input: Pick<SbfpInfographicInput, "schoolYear" | "district" | "bandLabel">): string {
  const parts = ["SBFP-Infographic", input.schoolYear];
  if (input.district !== ALL_DISTRICTS) parts.push(input.district === OTHER_DISTRICT ? "Other" : input.district);
  if (input.bandLabel) parts.push(input.bandLabel.replace(/[^A-Za-z0-9]+/g, "-").replace(/-$/, ""));
  return `${parts.join("-")}.pdf`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

function toPng(img: HTMLImageElement, size: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  ctx.drawImage(img, 0, 0, size, size);
  return canvas.toDataURL("image/png");
}

function iconColor(name: IconName): string {
  return name === "health" || name === "concerns" ? C.accent : C.brandDeep;
}

/** Rasterises the seal small (the source is 1 MB) and the icons at print size. */
async function loadAssets(): Promise<InfographicAssets> {
  const assets: InfographicAssets = { icons: {} };
  await Promise.all([
    loadImage("/deped_logo_1.png")
      .then((img) => {
        assets.logo = toPng(img, 240);
      })
      .catch(() => undefined),
    ...(Object.keys(ICONS) as IconName[]).map(async (name) => {
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" ` +
        `stroke="${iconColor(name)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
      try {
        const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
        assets.icons![name] = toPng(img, 96);
      } catch {
        // The tinted circle prints alone; a missing icon must not stop the page.
      }
    }),
  ]);
  return assets;
}

export async function printSbfpInfographic(input: SbfpInfographicInput): Promise<void> {
  const assets = await loadAssets();
  buildSbfpInfographic(input, assets).save(sbfpInfographicFilename(input));
}
