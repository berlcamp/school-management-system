import type { SbfpProgram, SbfpSection } from "@/lib/sbfp/queries";

/** What every SBFP tab needs to know about the page it sits on. */
export interface SbfpTabProps {
  schoolId: string;
  schoolYear: string;
  /** Null until the programme is opened on the Program tab. */
  program: SbfpProgram | null;
  sections: SbfpSection[];
  /**
   * Head / assistant / admin / nurse of the school, the focal person, the SBFP
   * Coordinator, super admin. Everyone else, teachers included, only views
   * (migration 230); a teacher also files Hot Meals Quality evaluations.
   */
  canManage: boolean;
  /** Sections whose learners the user may add as beneficiaries. */
  recordableSectionIds: ReadonlySet<string>;
  /** `sms_users.id` of the signed-in user. */
  actorId: string | null;
}

export function sectionOptionLabel(s: SbfpSection): string {
  const grade =
    s.grade_level === -1 ? "SNED" : s.grade_level === 0 ? "K" : String(s.grade_level);
  return `${grade} - ${s.name}`;
}

/** "Grade 5 - Rizal", "Kinder - Sampaguita"; "—" when the section is unknown. */
export function gradeSectionLabel(gradeLevel: number | null, sectionName: string): string {
  if (gradeLevel == null && !sectionName) return "—";
  const grade =
    gradeLevel == null
      ? ""
      : gradeLevel === -1
        ? "SNED"
        : gradeLevel === 0
          ? "Kinder"
          : `Grade ${gradeLevel}`;
  return [grade, sectionName].filter(Boolean).join(" - ");
}
