"use server";

import { supabase2 } from "@/lib/supabase/admin";
import type { RequestStatus } from "@/types/database";
import { buildTrackingNumber } from "./utils";

// ---------------------------------------------------------------------------
// Public: Submit a new document request with optional file attachment
// ---------------------------------------------------------------------------
export async function submitPublicRequest(formData: FormData): Promise<
  | { tracking_number: string }
  | { error: string }
> {
  try {
    // Generate a unique tracking number (retry up to 5 times on collision)
    let tracking_number = "";
    for (let i = 0; i < 5; i++) {
      const candidate = buildTrackingNumber();
      const { data: existing } = await supabase2
        .from("sms_requests")
        .select("id")
        .eq("tracking_number", candidate)
        .maybeSingle();
      if (!existing) {
        tracking_number = candidate;
        break;
      }
    }
    if (!tracking_number) {
      return { error: "Failed to generate tracking number. Please try again." };
    }

    const requesterType = formData.get("requester_type") as string;
    const requesterName = (formData.get("requester_name") as string)?.trim();
    const requesterContact = (formData.get("requester_contact") as string)?.trim();
    const requesterEmail = (formData.get("requester_email") as string | null)?.trim() || null;
    const requesterRelationship = (formData.get("requester_relationship") as string)?.trim();
    const studentName = (formData.get("student_name") as string)?.trim();
    const studentLrn = (formData.get("student_lrn") as string)?.trim();
    const studentIdRaw = formData.get("student_id") as string | null;
    const studentId = studentIdRaw ? parseInt(studentIdRaw) : null;
    const schoolIdRaw = formData.get("school_id") as string | null;
    const schoolId = schoolIdRaw ? parseInt(schoolIdRaw) : null;
    const lastSchool = (formData.get("last_school_attended") as string | null)?.trim() || null;
    const yearGraduated = (formData.get("year_graduated") as string | null)?.trim() || null;
    const purpose = (formData.get("purpose") as string)?.trim();
    const requestTypes = formData.getAll("request_type") as string[];

    if (!requesterName || !requesterContact || !requesterRelationship || !studentName || !studentLrn || !purpose || requestTypes.length === 0) {
      return { error: "Missing required fields." };
    }

    // Handle file upload
    const file = formData.get("attachment") as File | null;
    let attachmentFilePath: string | null = null;

    if (file && file.size > 0) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
      const storagePath = `${tracking_number}/signed-request.${ext}`;
      const { error: uploadError } = await supabase2.storage
        .from("request-attachments")
        .upload(storagePath, file, { upsert: true, contentType: file.type });
      if (uploadError) {
        return { error: "Failed to upload attachment. Please try again." };
      }
      attachmentFilePath = storagePath;
    }

    // Insert one row per request type
    const inserts = requestTypes.map((request_type) => ({
      tracking_number: requestTypes.length === 1
        ? tracking_number
        : `${tracking_number}-${request_type.toUpperCase().slice(0, 1)}`,
      school_id: schoolId,
      request_type,
      requester_type: requesterType,
      requester_name: requesterName,
      requester_contact: requesterContact,
      requester_email: requesterEmail,
      requester_relationship: requesterRelationship,
      student_name: studentName,
      student_lrn: studentLrn,
      student_id: studentId,
      last_school_attended: lastSchool,
      year_graduated: yearGraduated,
      purpose,
      status: "pending",
    }));

    const { data: inserted, error: insertError } = await supabase2
      .from("sms_requests")
      .insert(inserts)
      .select("id, tracking_number");

    if (insertError || !inserted?.length) {
      return { error: "Failed to submit request. Please try again." };
    }

    // Create attachment records and log entries
    const logsToInsert = inserted.map((r: { id: number; tracking_number: string }) => ({
      request_id: r.id,
      action: "created" as const,
      actor_name: "Public",
      new_status: "pending",
      notes: "Request submitted via public portal.",
    }));

    await supabase2.from("sms_request_logs").insert(logsToInsert);

    if (attachmentFilePath) {
      const attachmentsToInsert = inserted.map((r: { id: number }) => ({
        request_id: r.id,
        file_path: attachmentFilePath!,
        file_name: file!.name,
        file_type: file!.type,
        file_size: file!.size,
        uploaded_by: "Public",
        category: "attachment" as const,
      }));
      await supabase2.from("sms_request_attachments").insert(attachmentsToInsert);
    }

    return { tracking_number: inserted[0]!.tracking_number };
  } catch {
    return { error: "An unexpected error occurred." };
  }
}

// ---------------------------------------------------------------------------
// Public: Track request status by tracking number
// ---------------------------------------------------------------------------
export async function trackRequest(trackingNumber: string): Promise<
  | {
      tracking_number: string;
      request_type: string;
      requester_type: string;
      student_name_masked: string;
      status: string;
      rejection_reason: string | null;
      has_delivery: boolean;
      logs: { action: string; actor_name: string | null; notes: string | null; created_at: string }[];
      created_at: string;
    }
  | { error: string }
> {
  try {
    const { data: req, error } = await supabase2
      .from("sms_requests")
      .select("id, tracking_number, request_type, requester_type, student_name, status, rejection_reason, delivery_file_path, created_at")
      .eq("tracking_number", trackingNumber.trim().toUpperCase())
      .maybeSingle();

    if (error || !req) {
      return { error: "Request not found. Please check the tracking number." };
    }

    const { data: logs } = await supabase2
      .from("sms_request_logs")
      .select("action, actor_name, notes, created_at")
      .eq("request_id", req.id)
      .order("created_at", { ascending: true });

    // Mask student name: show first char + asterisks + last char per word
    const maskName = (name: string) =>
      name
        .split(/[\s,]+/)
        .map((w) => (w.length <= 2 ? w : w[0] + "*".repeat(w.length - 2) + w[w.length - 1]))
        .join(" ");

    return {
      tracking_number: req.tracking_number,
      request_type: req.request_type,
      requester_type: req.requester_type,
      student_name_masked: maskName(req.student_name),
      status: req.status,
      rejection_reason: req.rejection_reason,
      has_delivery: !!req.delivery_file_path,
      logs: logs ?? [],
      created_at: req.created_at,
    };
  } catch {
    return { error: "An unexpected error occurred." };
  }
}

// ---------------------------------------------------------------------------
// Staff: Update request status (with audit log)
// ---------------------------------------------------------------------------
export async function updateRequestStatus(
  requestId: string,
  newStatus: RequestStatus,
  data: {
    reason?: string;
    userId: number;
    userName: string;
  }
): Promise<{ success: true } | { error: string }> {
  try {
    const { data: current, error: fetchError } = await supabase2
      .from("sms_requests")
      .select("status")
      .eq("id", requestId)
      .single();

    if (fetchError || !current) {
      return { error: "Request not found." };
    }

    // Validate allowed transitions
    const allowed: Record<string, RequestStatus[]> = {
      pending: ["under_review", "rejected"],
      under_review: ["approved", "rejected"],
      approved: ["completed"],
      rejected: [],
      completed: [],
    };

    if (!allowed[current.status]?.includes(newStatus)) {
      return {
        error: `Cannot transition from "${current.status}" to "${newStatus}".`,
      };
    }

    if (newStatus === "rejected" && !data.reason?.trim()) {
      return { error: "A rejection reason is required." };
    }

    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === "rejected") {
      updatePayload.rejection_reason = data.reason!.trim();
    }
    if (newStatus === "under_review") {
      updatePayload.reviewed_by = data.userId;
      updatePayload.reviewed_at = new Date().toISOString();
    }
    if (newStatus === "approved") {
      updatePayload.approved_by = data.userId;
      updatePayload.approved_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase2
      .from("sms_requests")
      .update(updatePayload)
      .eq("id", requestId);

    if (updateError) {
      return { error: "Failed to update request status." };
    }

    await supabase2.from("sms_request_logs").insert({
      request_id: parseInt(requestId),
      action: newStatus,
      actor_name: data.userName,
      actor_id: data.userId,
      previous_status: current.status,
      new_status: newStatus,
      notes: newStatus === "rejected" ? data.reason : null,
    });

    return { success: true };
  } catch {
    return { error: "An unexpected error occurred." };
  }
}

// ---------------------------------------------------------------------------
// Staff: Revert (undo) a document request status change
// ---------------------------------------------------------------------------
export async function revertRequestStatus(
  requestId: string,
  previousStatus: RequestStatus,
  data: { userId: number; userName: string }
): Promise<{ success: true } | { error: string }> {
  try {
    const { data: current, error: fetchError } = await supabase2
      .from("sms_requests")
      .select("status")
      .eq("id", requestId)
      .single();

    if (fetchError || !current) {
      return { error: "Request not found." };
    }

    // Only allow reverting non-completed/non-pending statuses
    if (current.status === "completed" || current.status === "pending") {
      return { error: `Cannot revert from "${current.status}".` };
    }

    const updatePayload: Record<string, unknown> = {
      status: previousStatus,
      updated_at: new Date().toISOString(),
    };

    // Clear fields that were set by the forward transition
    if (previousStatus === "pending") {
      updatePayload.reviewed_by = null;
      updatePayload.reviewed_at = null;
      updatePayload.rejection_reason = null;
    }
    if (previousStatus === "under_review") {
      updatePayload.approved_by = null;
      updatePayload.approved_at = null;
      updatePayload.rejection_reason = null;
    }

    const { error: updateError } = await supabase2
      .from("sms_requests")
      .update(updatePayload)
      .eq("id", requestId);

    if (updateError) {
      return { error: "Failed to revert request status." };
    }

    await supabase2.from("sms_request_logs").insert({
      request_id: parseInt(requestId),
      action: "reverted",
      actor_name: data.userName,
      actor_id: data.userId,
      previous_status: current.status,
      new_status: previousStatus,
      notes: `Undone: reverted from ${current.status} to ${previousStatus}`,
    });

    return { success: true };
  } catch {
    return { error: "An unexpected error occurred." };
  }
}

// ---------------------------------------------------------------------------
// Staff: Upload SF10 delivery document and mark request as completed
// ---------------------------------------------------------------------------
export async function uploadDeliveryDocument(
  requestId: string,
  formData: FormData,
  userId: number,
  userName: string
): Promise<{ success: true } | { error: string }> {
  try {
    const { data: req, error: fetchError } = await supabase2
      .from("sms_requests")
      .select("status, tracking_number")
      .eq("id", requestId)
      .single();

    if (fetchError || !req) {
      return { error: "Request not found." };
    }

    if (req.status !== "approved") {
      return { error: "Request must be approved before uploading delivery document." };
    }

    const file = formData.get("sf10") as File | null;
    if (!file || file.size === 0) {
      return { error: "No file provided." };
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
    const storagePath = `${req.tracking_number}/sf10.${ext}`;

    const { error: uploadError } = await supabase2.storage
      .from("sf10-documents")
      .upload(storagePath, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      return { error: "Failed to upload SF10 document." };
    }

    const { error: updateError } = await supabase2
      .from("sms_requests")
      .update({
        status: "completed",
        delivery_file_path: storagePath,
        completed_by: userId,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (updateError) {
      return { error: "Failed to mark request as completed." };
    }

    await supabase2.from("sms_request_attachments").insert({
      request_id: parseInt(requestId),
      file_path: storagePath,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      uploaded_by: userName,
      category: "sf10_delivery",
    });

    await supabase2.from("sms_request_logs").insert({
      request_id: parseInt(requestId),
      action: "completed",
      actor_name: userName,
      actor_id: userId,
      previous_status: "approved",
      new_status: "completed",
      notes: "SF10 document uploaded and delivered.",
    });

    return { success: true };
  } catch {
    return { error: "An unexpected error occurred." };
  }
}

// ---------------------------------------------------------------------------
// Staff: Generate signed URL for any request file
// ---------------------------------------------------------------------------
export async function getRequestSignedUrl(
  filePath: string,
  bucket: "request-attachments" | "sf10-documents"
): Promise<{ url: string } | { error: string }> {
  try {
    const { data, error } = await supabase2.storage
      .from(bucket)
      .createSignedUrl(filePath, 3600);

    if (error || !data?.signedUrl) {
      return { error: "Failed to generate download link." };
    }

    return { url: data.signedUrl };
  } catch {
    return { error: "An unexpected error occurred." };
  }
}

// ---------------------------------------------------------------------------
// Public: Get signed URL for completed SF10 delivery
// ---------------------------------------------------------------------------
export async function getDeliverySignedUrl(
  trackingNumber: string
): Promise<{ url: string } | { error: string }> {
  try {
    const { data: req, error } = await supabase2
      .from("sms_requests")
      .select("status, delivery_file_path")
      .eq("tracking_number", trackingNumber.trim().toUpperCase())
      .maybeSingle();

    if (error || !req) {
      return { error: "Request not found." };
    }
    if (req.status !== "completed") {
      return { error: "Document not yet ready for download." };
    }
    if (!req.delivery_file_path) {
      return { error: "No delivery document found for this request." };
    }

    const { data: signed, error: signError } = await supabase2.storage
      .from("sf10-documents")
      .createSignedUrl(req.delivery_file_path, 3600);

    if (signError || !signed?.signedUrl) {
      return { error: "Failed to generate download link." };
    }

    return { url: signed.signedUrl };
  } catch {
    return { error: "An unexpected error occurred." };
  }
}

// ---------------------------------------------------------------------------
// Legacy: Signed URL for diploma (kept for backward compatibility)
// ---------------------------------------------------------------------------
export async function getDiplomaSignedUrl(
  requestId: string,
  lrn: string
): Promise<{ url: string } | { error: string }> {
  try {
    // Try new table first
    const { data: req } = await supabase2
      .from("sms_requests")
      .select("id, student_lrn, student_id, request_type, status")
      .eq("id", requestId)
      .maybeSingle();

    // Fall back to legacy table if not found
    const row = req ?? null;
    if (!row) {
      const { data: legacyReq, error: legacyError } = await supabase2
        .from("sms_form_requests")
        .select("id, student_lrn, student_id, request_type, status")
        .eq("id", requestId)
        .single();
      if (legacyError || !legacyReq) {
        return { error: "Request not found." };
      }

      if (legacyReq.request_type !== "diploma") return { error: "Invalid request type." };
      if (legacyReq.student_lrn.trim() !== lrn.trim()) return { error: "LRN does not match." };
      if (legacyReq.status !== "approved" && legacyReq.status !== "completed") return { error: "Request not yet approved." };
      if (!legacyReq.student_id) return { error: "Student not found." };

      const { data: student } = await supabase2
        .from("sms_students")
        .select("diploma_file_path")
        .eq("id", legacyReq.student_id)
        .single();
      if (!student?.diploma_file_path) return { error: "Diploma not yet uploaded." };

      const { data: signed } = await supabase2.storage
        .from("diplomas")
        .createSignedUrl(student.diploma_file_path, 3600);
      if (!signed?.signedUrl) return { error: "Failed to generate download link." };
      return { url: signed.signedUrl };
    }

    if (row.request_type !== "diploma") return { error: "Invalid request type." };
    if (row.student_lrn.trim() !== lrn.trim()) return { error: "LRN does not match." };
    if (row.status !== "approved" && row.status !== "completed") return { error: "Request not yet approved." };
    if (!row.student_id) return { error: "Student not found." };

    const { data: student } = await supabase2
      .from("sms_students")
      .select("diploma_file_path")
      .eq("id", row.student_id)
      .single();
    if (!student?.diploma_file_path) return { error: "Diploma not yet uploaded." };

    const { data: signed } = await supabase2.storage
      .from("diplomas")
      .createSignedUrl(student.diploma_file_path, 3600);
    if (!signed?.signedUrl) return { error: "Failed to generate download link." };
    return { url: signed.signedUrl };
  } catch {
    return { error: "An unexpected error occurred." };
  }
}
