import type { SbfpProgram, SbfpSection } from "@/lib/sbfp/queries";

/** What every SBFP tab needs to know about the page it sits on. */
export interface SbfpTabProps {
  schoolId: string;
  schoolYear: string;
  /** Null until the programme is opened on the Program tab. */
  program: SbfpProgram | null;
  sections: SbfpSection[];
  /** Head / assistant / admin / nurse of the school, the focal person, super admin. */
  canManage: boolean;
  /** Sections whose learners the user may add as beneficiaries. */
  recordableSectionIds: ReadonlySet<string>;
  /**
   * A teacher who manages nothing: they see and edit only the beneficiaries they
   * encoded (migration 210), and may add — not remove — feeding days.
   */
  ownRecordsOnly: boolean;
  /** `sms_users.id` of the signed-in user. */
  actorId: string | null;
}

export function sectionOptionLabel(s: SbfpSection): string {
  const grade =
    s.grade_level === -1 ? "SNED" : s.grade_level === 0 ? "K" : String(s.grade_level);
  return `${grade} - ${s.name}`;
}
