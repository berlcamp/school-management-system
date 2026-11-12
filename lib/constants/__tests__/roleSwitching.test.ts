import { describe, expect, it } from "vitest";
import { canSwitchToRole } from "../userTypes";

describe("canSwitchToRole", () => {
  it("offers school roles and QA at a school", () => {
    expect(canSwitchToRole("teacher")).toBe(true);
    expect(canSwitchToRole("qa")).toBe(true);
    expect(canSwitchToRole("division_type")).toBe(false);
  });

  it("offers only Division User and QA Reviewer with no school", () => {
    expect(canSwitchToRole("division_type", false)).toBe(true);
    expect(canSwitchToRole("qa", false)).toBe(true);
    expect(canSwitchToRole("teacher", false)).toBe(false);
    expect(canSwitchToRole("division_admin", false)).toBe(false);
    expect(canSwitchToRole("super admin", false)).toBe(false);
  });

  it("never offers a login-disabled role", () => {
    expect(canSwitchToRole("accounting")).toBe(false);
    expect(canSwitchToRole("security_guard", false)).toBe(false);
  });
});
