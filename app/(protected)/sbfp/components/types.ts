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
  /** Sections whose beneficiaries and feeding the user may encode. */
  recordableSectionIds: ReadonlySet<string>;
  /** `sms_users.id` of the signed-in user. */
  actorId: string | null;
}

export function sectionOptionLabel(s: SbfpSection): string {
  const grade =
    s.grade_level === -1 ? "SNED" : s.grade_level === 0 ? "K" : String(s.grade_level);
  return `${grade} - ${s.name}`;
}
