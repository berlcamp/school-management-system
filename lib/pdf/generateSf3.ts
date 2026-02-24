import { buildDepEdHeaderWithLogos, DEPED_HEADER_LOGOS_STYLES, printHTMLContent } from "@/lib/pdf/utils";
import { supabase } from "@/lib/supabase/client";

export interface Sf3Params {
  schoolId: string;
  sectionId: string;
  schoolYear: string;
}

function formatDateDMY(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/** SF3 - Books Issued and Returned. Uses sms_book_issuances data. */
export async function generateSf3Print(params: Sf3Params): Promise<void> {
  try {
    const { schoolId, sectionId, schoolYear } = params;

    const { data: school, error: schoolError } = await supabase
      .from("sms_schools")
      .select("id, name")
      .eq("id", schoolId)
      .single();

    if (schoolError || !school) {
      throw new Error("School not found");
    }

    const { data: section, error: sectionError } = await supabase
      .from("sms_sections")
      .select("id, name, grade_level, section_adviser_id")
      .eq("id", sectionId)
      .single();

    if (sectionError || !section) {
      throw new Error("Section not found");
    }

    const { data: issuances, error: issuancesError } = await supabase
      .from("sms_book_issuances")
      .select(
        `
        id,
        date_issued,
        date_returned,
        condition_on_return,
        return_code,
        remarks,
        book:sms_books(id, title, subject_area),
        student:sms_students!sms_book_issuances_student_id_fkey(id, first_name, middle_name, last_name, suffix, gender)
      `,
      )
      .eq("section_id", sectionId)
      .eq("school_year", schoolYear)
      .order("date_issued", { ascending: true })
      .order("created_at", { ascending: true });

    if (issuancesError) {
      throw new Error(issuancesError.message);
    }

    const adviserName =
      section.section_adviser_id
        ? (
            await supabase
              .from("sms_users")
              .select("name")
              .eq("id", section.section_adviser_id)
              .single()
          ).data?.name ?? ""
        : "";

    const schoolName = school.name || "—";
    const sectionName = section.name || "—";
    const gradeLabel =
      section.grade_level === 0
        ? "Kindergarten"
        : `Grade ${section.grade_level ?? ""}`;

    const getStudentName = (row: {
      student?:
        | {
            first_name: string;
            middle_name: string | null;
            last_name: string;
            suffix: string | null;
          }
        | { first_name: string; middle_name: string | null; last_name: string; suffix: string | null }[]
        | null;
    }) => {
      const s = Array.isArray(row.student) ? row.student[0] : row.student;
      if (!s) return "—";
      return `${s.last_name}, ${s.first_name}${s.middle_name ? ` ${s.middle_name}` : ""}${s.suffix ? ` ${s.suffix}` : ""}`.trim();
    };

    let rowsHTML = "";
    let totalMale = 0;
    let totalFemale = 0;
    let totalIssued = 0;
    let totalReturned = 0;
    const studentCounted = new Set<string>();

    const gradeLevelCell =
      section.grade_level === 0 ? "K" : String(section.grade_level);

    (issuances || []).forEach((row, idx) => {
      const studentName = getStudentName(row);
      const studentObj = Array.isArray(row.student) ? row.student[0] : row.student;
      const studentId = (studentObj as { id?: string } | null)?.id;
      const gender = (studentObj as { gender?: string } | null)?.gender;
      if (studentId && gender && !studentCounted.has(studentId)) {
        studentCounted.add(studentId);
        if (gender === "male") totalMale++;
        else if (gender === "female") totalFemale++;
      }
      totalIssued++;
      if (row.date_returned) totalReturned++;

      const dateReturnedDisplay = row.date_returned
        ? formatDateDMY(row.date_returned)
        : row.return_code || "—";

      const bookData = Array.isArray(row.book) ? row.book[0] : row.book;
      const subjectTitle = bookData
        ? `${(bookData as { subject_area?: string }).subject_area ?? ""} - ${(bookData as { title?: string }).title ?? ""}`.trim()
        : "—";

      rowsHTML += `
        <tr>
          <td class="text-center">${idx + 1}</td>
          <td>${studentName}</td>
          <td class="text-center">${gradeLevelCell}</td>
          <td>${sectionName}</td>
          <td>${subjectTitle}</td>
          <td class="text-center">${formatDateDMY(row.date_issued)}</td>
          <td class="text-center">${dateReturnedDisplay}</td>
          <td>${row.remarks || "—"}</td>
        </tr>`;
    });

    const totalLearners = totalMale + totalFemale;

    if (rowsHTML === "") {
      rowsHTML = `<tr><td colspan="8" class="text-center">No book issuances recorded. Record issuances in Books → Issue/Return.</td></tr>`;
    }

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SF3 - Books Issued and Returned</title>
  <style>
    @page { size: 8.5in 13in; margin: 0.5in; }
    body { font-family: "Times New Roman", serif; font-size: 11pt; }
    .header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #000; }
    .form-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .form-table th, .form-table td { border: 1px solid #000; padding: 4px; }
    .text-center { text-align: center; }
    .footer-row { font-weight: bold; background-color: #f5f5f5; }
    .footer-totals { margin-top: 12px; font-size: 10pt; }
    ${DEPED_HEADER_LOGOS_STYLES}
    @media print { body { print-color-adjust: exact; } }
  </style>
</head>
<body>
  ${buildDepEdHeaderWithLogos(`
    <div>Republic of the Philippines</div>
    <div style="font-weight:bold">Department of Education</div>
    <div style="font-weight:bold; margin-top:6px">${schoolName}</div>
    <div style="font-size:10pt; margin-top:4px">SF3 - Books Issued and Returned</div>
    <div style="font-size:10pt">${gradeLabel} - ${sectionName} | School Year ${schoolYear}</div>
  `)}
  <table class="form-table">
    <thead>
      <tr>
        <th style="width:40px">No.</th>
        <th>Learner&apos;s Name</th>
        <th style="width:60px">Grade Level</th>
        <th style="width:80px">Section</th>
        <th>Subject Area & Title</th>
        <th style="width:90px">Date Issued</th>
        <th style="width:90px">Date Returned</th>
        <th>Remark/Action Taken</th>
      </tr>
    </thead>
    <tbody>${rowsHTML}</tbody>
  </table>
  <div class="footer-totals">
    <div>Total for Male | Total Copies: ${totalMale}</div>
    <div>Total for Female | Total Copies: ${totalFemale}</div>
    <div>Total for Learners | Total Copies: ${totalLearners}</div>
    <div>Total Copies Issued: ${(issuances || []).length}</div>
    <div>Total Copies Returned: ${totalReturned}</div>
    <div style="margin-top:12px">Prepared by: ${adviserName || "—"}</div>
  </div>
</body>
</html>`;

    printHTMLContent(htmlContent);
  } catch (error) {
    console.error("Error generating SF3:", error);
    throw error;
  }
}
