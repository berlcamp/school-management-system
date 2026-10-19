import type { SbfpHeaderInfo } from "@/lib/pdf/generateSbfpForms";
import { fetchSchoolHeader, type SbfpProgram } from "@/lib/sbfp/queries";
import type { SchoolSettings } from "@/lib/utils/schoolSettings";

/** The header and signature lines every SBFP printable shares. */
export async function buildSbfpHeaderInfo(
  program: SbfpProgram,
  schoolId: string,
  schoolYear: string,
  settings: SchoolSettings,
): Promise<SbfpHeaderInfo> {
  const school = await fetchSchoolHeader(schoolId);
  return {
    schoolName: school.name,
    depedSchoolId: school.deped_school_id,
    region: program.region ?? school.region ?? "",
    division: program.division_name ?? "",
    district: program.district ?? school.district ?? "",
    municipalityBarangay: program.municipality_barangay ?? "",
    schoolYear,
    principalName: settings.principal_name ?? "",
    principalTitle: settings.principal_title ?? "School Head",
    focalPersonName: program.focal_person_name ?? "",
    feedingStartDate: program.feeding_start_date,
    feedingEndDate: program.feeding_end_date,
    midlineWeighingDate: program.midline_weighing_date,
    isLastMileSchool: program.is_last_mile_school,
  };
}
