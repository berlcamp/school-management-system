import { printHTMLContent } from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";

export interface Sf8Params {
  schoolId: string;
  sectionId: string;
  schoolYear: string;
}

/** SF8 - Learner Basic Health and Nutrition Report. Template only - requires health/BMI schema. */
export async function generateSf8Print(params: Sf8Params): Promise<void> {
  const { schoolId, sectionId, schoolYear } = params;

  const { data: school } = await supabase
    .from("sms_schools")
    .select("id, name")
    .eq("id", schoolId)
    .single();

  const { data: section } = await supabase
    .from("sms_sections")
    .select("id, name, grade_level")
    .eq("id", sectionId)
    .single();

  const schoolName = school?.name || "—";
  const sectionName = section?.name || "—";
  const gradeLabel =
    section?.grade_level === 0 ? "Kindergarten" : `Grade ${section?.grade_level ?? ""}`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SF8 - Learner Basic Health and Nutrition Report</title>
  <style>
    @page { size: 8.5in 13in; margin: 0.5in; }
    body { font-family: "Times New Roman", serif; font-size: 11pt; }
    .header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #000; }
    .form-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    .form-table th, .form-table td { border: 1px solid #000; padding: 4px; }
    .template-note { background: #fff3cd; padding: 10px; margin: 15px 0; font-size: 10pt; }
    .text-center { text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>Republic of the Philippines</div>
    <div style="font-weight:bold">Department of Education</div>
    <div style="font-weight:bold; margin-top:6px">${schoolName}</div>
    <div style="font-size:10pt; margin-top:4px">SF8 - Learner Basic Health and Nutrition Report</div>
    <div style="font-size:10pt">${gradeLabel} - ${sectionName} | School Year ${schoolYear}</div>
  </div>
  <div class="template-note">Template only. Health/BMI tracking is not yet implemented.</div>
  <table class="form-table">
    <thead>
      <tr>
        <th style="width:40px">No.</th>
        <th>Name of Learner</th>
        <th style="width:70px">Height (cm)</th>
        <th style="width:70px">Weight (kg)</th>
        <th style="width:60px">BMI</th>
      </tr>
    </thead>
    <tbody>
      <tr><td colspan="5" class="text-center">No data - manual entry</td></tr>
    </tbody>
  </table>
</body>
</html>`;

  printHTMLContent(htmlContent);
}
