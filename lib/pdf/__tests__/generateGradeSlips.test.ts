import { describe, expect, it } from "vitest";
import { buildGradeSlipsHtml, type GradeSlipLearner } from "../generateGradeSlips";
import { buildCardSubjectRows } from "@/lib/utils/mapeh";

const rows = buildCardSubjectRows(
  [
    { name: "Mathematics", code: "MATH", is_madrasah: false, q1: 80, q2: 90, q3: 85, q4: null },
    { name: "Music and Arts", code: "MAPEH1", is_madrasah: false, mapeh_component: "music_arts", q1: 88, q2: 86, q3: 90, q4: null },
    { name: "PE and Health", code: "MAPEH2", is_madrasah: false, mapeh_component: "pe_health", q1: 84, q2: 90, q3: 88, q4: null },
  ],
  { gradeLevel: 5, requirePeriods: 3 },
);

const learner = (name: string): GradeSlipLearner => ({ name, lrn: "123456789012", rows });

const base = {
  schoolName: "Sample Elementary School",
  schoolYear: "2026-2027",
  sectionLabel: "Grade 5 - Rizal",
  adviserName: "Juana Dela Cruz",
  periods: [
    { value: 1, short: "T1" },
    { value: 2, short: "T2" },
  ],
  includeFinal: false,
};

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("buildGradeSlipsHtml", () => {
  it("puts four slips on a page", () => {
    const learners = ["A", "B", "C", "D", "E"].map(learner);
    const html = buildGradeSlipsHtml({ ...base, learners });
    expect(count(html, 'class="page"')).toBe(2);
    expect(count(html, 'class="slip"')).toBe(5);
  });

  it("prints only the chosen periods", () => {
    const html = buildGradeSlipsHtml({ ...base, learners: [learner("A")] });
    expect(html).toContain("<th>T1</th>");
    expect(html).toContain("<th>T2</th>");
    expect(html).not.toContain("<th>T3</th>");
    expect(html).not.toContain("<th>Final</th>");
  });

  it("folds MAPEH into one parent line with its components beneath", () => {
    const html = buildGradeSlipsHtml({ ...base, learners: [learner("A")] });
    expect(html).toContain('class="area parent">MAPEH<');
    expect(count(html, 'class="area sub"')).toBe(2);
  });

  it("adds Final and remarks when asked", () => {
    const html = buildGradeSlipsHtml({
      ...base,
      includeFinal: true,
      periods: [1, 2, 3].map((v) => ({ value: v, short: `T${v}` })),
      learners: [learner("A")],
    });
    expect(html).toContain("<th>Final</th><th>Remarks</th>");
    expect(html).toContain("Passed");
  });

  it("escapes learner names", () => {
    const html = buildGradeSlipsHtml({ ...base, learners: [learner("<b>x</b>")] });
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
