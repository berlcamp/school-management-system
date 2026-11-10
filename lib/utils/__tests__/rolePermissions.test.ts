import { describe, expect, it } from "vitest";
import {
  cellKey,
  diffCells,
  effectiveCells,
} from "@/lib/utils/rolePermissions";
import {
  buildNavSections,
  defaultMenuUrls,
  menuCatalogue,
  menuItemForPath,
} from "@/lib/nav/buildNavSections";

const types = ["teacher", "school_nurse"];
const urls = ["/a", "/b"];
const defaults = new Map([
  ["teacher", new Set(["/a"])],
  ["school_nurse", new Set<string>()],
]);

describe("role permissions matrix", () => {
  it("shows the default where no row exists, the row where one does", () => {
    const cells = effectiveCells(types, urls, defaults, [
      { user_type: "teacher", item_key: "/a", is_enabled: false },
      { user_type: "school_nurse", item_key: "/b", is_enabled: true },
    ]);
    expect([...cells]).toEqual([cellKey("school_nurse", "/b")]);
  });

  it("sends a change back to the default as null", () => {
    const before = new Set([cellKey("school_nurse", "/b")]);
    const after = new Set([cellKey("teacher", "/b")]);
    expect(diffCells(types, urls, defaults, before, after)).toEqual([
      { user_type: "teacher", item_key: "/b", is_enabled: true },
      { user_type: "school_nurse", item_key: "/b", is_enabled: null },
    ]);
  });
});

const ctx = (userType: string, overrides?: Map<string, boolean>) => ({
  userType,
  isTutor: false,
  hasDesignation: () => false,
  helpdesk: { enabled: false, isStaff: false },
  sbfpEnabled: true,
  needsReviewEnabled: true,
  overrides,
});
const urlsOf = (userType: string, overrides?: Map<string, boolean>) =>
  buildNavSections(ctx(userType, overrides)).flatMap((s) => s.items.map((i) => i.url));

describe("School Counselor Associate", () => {
  it("gets the guidance counselor's menu", () => {
    expect(urlsOf("school_counselor_associate")).toEqual(urlsOf("guidance_counselor"));
    expect(defaultMenuUrls("school_counselor_associate")).toEqual(
      new Set([
        "/teacher/anecdotal",
        "/teacher/anecdotal/manifestation",
        "/teacher/cardex",
        "/teacher/absenteeism",
      ]),
    );
  });
});

describe("menu overrides", () => {
  it("removes a page switched off and adds one switched on", () => {
    const urls = urlsOf(
      "school_nurse",
      new Map([
        ["/health", false],
        ["/teacher/cardex", true],
      ]),
    );
    expect(urls).not.toContain("/health");
    expect(urls).toContain("/teacher/cardex");
  });

  it("shows a hidden group with only the added page", () => {
    const sections = buildNavSections(
      ctx("school_nurse", new Map([["/teacher/cardex", true]])),
    );
    const teacherMenu = sections.find((s) => s.label === "Teacher Menu");
    expect(teacherMenu?.items.map((i) => i.url)).toEqual(["/teacher/cardex"]);
  });

  it("never offers the super admin's own pages", () => {
    const catalogue = menuCatalogue().map((i) => i.url);
    expect(catalogue).not.toContain("/division/users");
    expect(catalogue).not.toContain("/division/permissions");
    expect(catalogue).not.toContain("/home");
  });

  it("matches a path to its longest menu page", () => {
    expect(menuItemForPath("/teacher/anecdotal/manifestation")).toBe(
      "/teacher/anecdotal/manifestation",
    );
    expect(menuItemForPath("/teacher/anecdotal/123")).toBe("/teacher/anecdotal");
    expect(menuItemForPath("/sbfp-viewer")).not.toBe("/sbfp");
    expect(menuItemForPath("/profile")).toBeNull();
  });
});
