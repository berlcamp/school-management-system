import { describe, expect, it } from "vitest";
import { STAFF_DESIGNATIONS } from "../designations";
import { ROLE_CAPABILITIES, roleCapability, DESIGNATION_CAPABILITIES } from "../roleCapabilities";
import { USER_TYPE_LABELS, isLoginDisabledUserType } from "../userTypes";

describe("roleCapabilities", () => {
  it("describes every role that can sign in", () => {
    const loginRoles = Object.keys(USER_TYPE_LABELS).filter(
      (type) => !isLoginDisabledUserType(type),
    );
    for (const type of loginRoles) {
      expect(ROLE_CAPABILITIES[type], type).toBeDefined();
      expect(ROLE_CAPABILITIES[type].can.length, type).toBeGreaterThan(0);
    }
  });

  it("falls back for an unknown or missing role", () => {
    expect(roleCapability("not_a_role").can).toEqual([]);
    expect(roleCapability(null).summary).toMatch(/School Head/);
  });

  it("describes every designation", () => {
    for (const d of STAFF_DESIGNATIONS) {
      expect(DESIGNATION_CAPABILITIES[d]).toBeTruthy();
    }
  });
});
