"use server";

import { supabase2 } from "@/lib/supabase/admin";

/**
 * Generate a signed URL for an approved diploma request.
 * Verifies the request exists, is approved/completed, and student_lrn matches.
 */
export async function getDiplomaSignedUrl(
  requestId: string,
  lrn: string
): Promise<{ url: string } | { error: string }> {
  try {
    const { data: req, error: reqError } = await supabase2
      .from("sms_form137_requests")
      .select("id, student_lrn, student_id, request_type, status")
      .eq("id", requestId)
      .single();

    if (reqError || !req) {
      return { error: "Request not found" };
    }

    if (req.request_type !== "diploma") {
      return { error: "Invalid request type" };
    }

    if (req.student_lrn.trim() !== lrn.trim()) {
      return { error: "LRN does not match" };
    }

    if (req.status !== "approved" && req.status !== "completed") {
      return { error: "Request not yet approved" };
    }

    if (!req.student_id) {
      return { error: "Student not found" };
    }

    const { data: student, error: studentError } = await supabase2
      .from("sms_students")
      .select("diploma_file_path")
      .eq("id", req.student_id)
      .single();

    if (studentError || !student?.diploma_file_path) {
      return { error: "Diploma not yet uploaded" };
    }

    const { data: signed, error: signError } = await supabase2.storage
      .from("diplomas")
      .createSignedUrl(student.diploma_file_path, 3600);

    if (signError || !signed?.signedUrl) {
      return { error: "Failed to generate download link" };
    }

    return { url: signed.signedUrl };
  } catch {
    return { error: "An error occurred" };
  }
}
