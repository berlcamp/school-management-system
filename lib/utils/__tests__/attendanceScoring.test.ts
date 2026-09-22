import { describe, expect, it } from "vitest";
import { scoreAttendanceDay } from "@/lib/utils/attendanceScoring";
import {
  countSchoolDays,
  getSchoolDaysInMonth,
  ResolvedDay,
} from "@/lib/utils/schoolCalendar";

const fullDay = (date: string): ResolvedDay => ({ date, am: true, pm: true });
const amOnly = (date: string): ResolvedDay => ({ date, am: true, pm: false });

describe("scoreAttendanceDay", () => {
  it("credits a full day when no row was saved", () => {
    expect(scoreAttendanceDay(fullDay("2025-07-01"), undefined)).toMatchObject({
      present: 1,
      absent: 0,
      tardy: 0,
    });
  });

  it("credits a full day when both sessions were sat", () => {
    expect(
      scoreAttendanceDay(fullDay("2025-07-01"), { am: true, pm: true })
    ).toMatchObject({ present: 1, absent: 0, tardy: 0 });
  });

  it("counts a whole day absent when no session was sat", () => {
    expect(
      scoreAttendanceDay(fullDay("2025-07-03"), { am: false, pm: false })
    ).toMatchObject({ present: 0, absent: 1, tardy: 0 });
  });

  it("counts a missed AM as a full day present plus one tardy", () => {
    expect(
      scoreAttendanceDay(fullDay("2025-07-07"), { am: false, pm: true })
    ).toMatchObject({ attended: 0.5, present: 1, absent: 0, tardy: 1, missed: "am" });
  });

  it("counts a missed PM as a full day present plus one tardy", () => {
    expect(
      scoreAttendanceDay(fullDay("2025-07-07"), { am: true, pm: false })
    ).toMatchObject({ attended: 0.5, present: 1, absent: 0, tardy: 1, missed: "pm" });
  });

  it("scores a half-day suspension out of 0.5, not out of 1", () => {
    expect(scoreAttendanceDay(amOnly("2025-07-08"), { am: true, pm: false })).toMatchObject({
      present: 0.5,
      absent: 0,
      tardy: 0,
    });
    expect(scoreAttendanceDay(amOnly("2025-07-08"), { am: false, pm: false })).toMatchObject({
      present: 0,
      absent: 0.5,
      tardy: 0,
    });
  });

  it("ignores a stale row against a session the school never held", () => {
    // pm_present=true on a day whose PM was suspended must not earn credit.
    expect(scoreAttendanceDay(amOnly("2025-07-08"), { am: true, pm: true })).toMatchObject({
      attended: 0.5,
      present: 0.5,
      tardy: 0,
    });
  });

  it("scores nothing at all on a day with no session", () => {
    expect(
      scoreAttendanceDay({ date: "2025-07-05", am: false, pm: false }, undefined)
    ).toMatchObject({ present: 0, absent: 0, tardy: 0 });
  });
});

describe("SF2 month totals reconcile to the No. of Days of Classes", () => {
  // Learner 1510 / section 41, July 2025 on the local clone: 23 class days
  // (no calendar entry covers July 2025), 20 full days present, absent on the
  // 3rd and the 14th, and AM missed on the 7th. SF2 printed 20.5 present
  // against 2 absent — 22.5 of 23, the half day counted nowhere.
  const days = getSchoolDaysInMonth("2025-07", []);
  const rows: Record<string, { am: boolean; pm: boolean }> = {
    "2025-07-03": { am: false, pm: false },
    "2025-07-14": { am: false, pm: false },
    "2025-07-07": { am: false, pm: true },
  };

  it("has 23 class days in July 2025", () => {
    expect(countSchoolDays(days)).toBe(23);
  });

  it("reports 21 present, 2 absent and 1 tardy", () => {
    const total = days.reduce(
      (sum, day) => {
        const score = scoreAttendanceDay(day, rows[day.date]);
        return {
          present: sum.present + score.present,
          absent: sum.absent + score.absent,
          tardy: sum.tardy + score.tardy,
        };
      },
      { present: 0, absent: 0, tardy: 0 }
    );

    expect(total).toEqual({ present: 21, absent: 2, tardy: 1 });
    expect(total.present + total.absent).toBe(countSchoolDays(days));
  });
});
