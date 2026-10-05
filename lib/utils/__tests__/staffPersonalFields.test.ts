import { describe, expect, it } from "vitest";
import { staffPersonalFields } from "../staffPersonalFields";

describe("staffPersonalFields", () => {
  it.each(["teacher", "registrar", "school_head", "admin"])(
    "writes nothing for a %s, who keeps these on /profile",
    (type) => {
      expect(
        staffPersonalFields(type, { position: "Teacher III", gender: "male" }),
      ).toEqual({});
    },
  );

  it.each(["accounting", "security_guard", "utility_worker"])(
    "writes position and sex for a %s, who cannot sign in to /profile",
    (type) => {
      expect(
        staffPersonalFields(type, { position: "  Security Guard I ", gender: "female" }),
      ).toEqual({ position: "Security Guard I", gender: "female" });
    },
  );

  it("stores blanks as null for a login-disabled role", () => {
    expect(staffPersonalFields("utility_worker", { position: " ", gender: undefined })).toEqual({
      position: null,
      gender: null,
    });
  });
});
