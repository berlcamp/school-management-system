import { describe, expect, it } from "vitest";
import {
  type ModuleGuide,
  getVisibleGuides,
} from "@/components/system-guide/system-guide-data";

/**
 * The guide is hand-written data, so the failure mode is a typo: a duplicated
 * id (which makes one entry unreachable — the finder always returns the first),
 * or an entry that renders as an empty panel. These check the shape, not the
 * prose.
 */

const ROLES = [
  "school_head",
  "assistant_school_head",
  "super admin",
  "admin",
  "registrar",
  "librarian",
  "teacher",
  "tutor",
  "division_admin",
  "division_type",
];

function modulesFor(role: string, isTutor = false): ModuleGuide[] {
  return getVisibleGuides(role, isTutor).flatMap((c) => c.modules);
}

const everyModule = Array.from(
  new Map(
    ROLES.flatMap((r) => modulesFor(r, true)).map((m) => [m.id, m]),
  ).values(),
);

describe("guide data shape", () => {
  it("gives every role at least one module", () => {
    for (const role of ROLES) {
      expect(modulesFor(role).length, role).toBeGreaterThan(0);
    }
  });

  it("keeps module ids unique within every role's guide", () => {
    for (const role of ROLES) {
      const ids = modulesFor(role, true).map((m) => m.id);
      expect(new Set(ids).size, role).toBe(ids.length);
    }
  });

  it("keeps sub-module ids unique within their module", () => {
    for (const mod of everyModule) {
      const ids = (mod.subModules ?? []).map((s) => s.id);
      expect(new Set(ids).size, mod.id).toBe(ids.length);
    }
  });

  it("never renders an empty panel", () => {
    for (const mod of everyModule) {
      expect(mod.title.trim(), mod.id).not.toBe("");
      expect(mod.description.trim(), mod.id).not.toBe("");
      expect(mod.steps.length, mod.id).toBeGreaterThan(0);

      for (const sub of mod.subModules ?? []) {
        const where = `${mod.id}/${sub.id}`;
        expect(sub.title.trim(), where).not.toBe("");
        expect(sub.description.trim(), where).not.toBe("");
        expect(sub.steps.length, where).toBeGreaterThan(0);
        for (const step of sub.steps) {
          expect(step.title.trim(), where).not.toBe("");
          expect(step.description.trim(), where).not.toBe("");
        }
      }
    }
  });
});

describe("sub-modules reach the people who use them", () => {
  it("gives a teacher My Sections with its adviser screens", () => {
    const mySections = modulesFor("teacher").find(
      (m) => m.id === "teacher_sections",
    );
    expect(mySections).toBeDefined();

    // Attendance, Learner Health and the ECCD checklist have no sidebar entry —
    // opening a section is the only way in, so the guide has to say so here.
    const subIds = (mySections?.subModules ?? []).map((s) => s.id);
    expect(subIds).toEqual(
      expect.arrayContaining(["attendance", "health", "eccd", "school_forms"]),
    );
  });

  it("gives a pure tutor the tutor menu and nothing that needs a teacher role", () => {
    const ids = modulesFor("tutor").map((m) => m.id);
    expect(ids).toEqual([
      "tutor_learners",
      "tutor_attendance",
      "tutor_progress",
    ]);
  });

  it("gives a staff member who is also a tutor both menus", () => {
    const ids = modulesFor("admin", true).map((m) => m.id);
    expect(ids).toContain("tutor_learners");
    expect(ids).toContain("staff");
  });
});
