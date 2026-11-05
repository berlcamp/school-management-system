import { describe, expect, it } from "vitest";
import { staffPersonalFields } from "../staffPersonalFields";

describe("staffPersonalFields", () => {
  it.each(["teacher", "registrar", "school_head", "admin"])(
    "writes position but not sex for a %s, who keeps sex on /profile",
    (type) => {
      expect(
        staffPersonalFields(type, { position: " Teacher III ", gender: "male" }),
      ).toEqual({ position: "Teacher III" });
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

  it("stores a blank position as null", () => {
    expect(staffPersonalFields("teacher", { position: " " })).toEqual({ position: null });
    expect(staffPersonalFields("utility_worker", { position: " ", gender: undefined })).toEqual({
      position: null,
      gender: null,
    });
  });
});
