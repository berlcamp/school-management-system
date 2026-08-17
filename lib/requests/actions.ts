"use server";

import { isTeacherRole } from "@/lib/constants/userTypes";
import { supabase2 } from "@/lib/supabase/admin";
import type { RequestStatus } from "@/types/database";
import { canActOnSchool, getRequestStaff } from "./auth";
import {
  ACCEPTED_UPLOAD_MIME,
  buildTrackingNumber,
  PDF_ONLY,
  safeFileExtension,
  validateRequestFile,
} from "./utils";

// ---------------------------------------------------------------------------
// Public: Submit a new document request with optional file attachment
// ---------------------------------------------------------------------------
export async function submitPublicRequest(formData: FormData): Promise<
  | { tracking_numbers: string[] }
  | { error: string }
> {
  try {
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
    const requestTypes = [...new Set(formData.getAll("request_type") as string[])];

    if (!requesterName || !requesterContact || !requesterRelationship || !studentName || !studentLrn || !purpose || requestTypes.length === 0) {
      return { error: "Missing required fields." };
    }

    // One row per requested document, each with its own tracking number so the
    // requester can track every document they asked for. Check the numbers we
    // are actually about to insert — a base that is free says nothing about the
    // suffixed variants.
    let base = "";
    let trackingNumbers: string[] = [];
    for (let i = 0; i < 5; i++) {
      const candidateBase = buildTrackingNumber();
      const candidates =
        requestTypes.length === 1
          ? [candidateBase]
          : requestTypes.map((t) => `${candidateBase}-${t.toUpperCase().slice(0, 1)}`);
      const { data: existing } = await supabase2
        .from("sms_requests")
        .select("id")
        .in("tracking_number", candidates)
        .limit(1);
      if (!existing?.length) {
        base = candidateBase;
        trackingNumbers = candidates;
        break;
      }
    }
    if (!trackingNumbers.length) {
      return { error: "Failed to generate tracking number. Please try again." };
    }

    // Handle file upload
    const file = formData.get("attachment") as File | null;
    let attachmentFilePath: string | null = null;

    if (file && file.size > 0) {
      // The upload widget checks this too, but that check is a courtesy — this
      // action is reachable directly, so the type and size limits are enforced
      // where they cannot be skipped.
      const check = validateRequestFile(file);
      if (!check.valid) {
        return { error: check.error ?? "Unsupported attachment." };
      }
      const ext = safeFileExtension(file.type);
      const storagePath = `${base}/signed-request.${ext}`;
      const { error: uploadError } = await supabase2.storage
        .from("request-attachments")
        .upload(storagePath, file, { upsert: true, contentType: file.type });
      if (uploadError) {
        return { error: "Failed to upload attachment. Please try again." };
      }
      attachmentFilePath = storagePath;
    }

    // Insert one row per request type
    const inserts = requestTypes.map((request_type, i) => ({
      tracking_number: trackingNumbers[i]!,
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

    return { tracking_numbers: inserted.map((r: { tracking_number: string }) => r.tracking_number) };
  } catch {
    return { error: "An unexpected error occurred." };
  }
}

// ---------------------------------------------------------------------------
// Public: which documents this learner already has an open request for
// ---------------------------------------------------------------------------
// The submit form uses this to grey out a document that is already in flight.
// It runs server-side so `sms_requests` needs no anon read policy: the reply
// carries only the document type and its status — no requester, no contact
// details, no purpose — for an LRN the caller has already resolved to a
// student through the lookup above the form.
export async function getExistingRequestsForLrn(
  lrn: string,
): Promise<{ request_type: string; status: string }[]> {
  try {
    const digits = lrn.replace(/\D/g, "");
    if (digits.length !== 12) return [];

    const { data } = await supabase2
      .from("sms_requests")
      .select("request_type, status")
      .eq("student_lrn", digits);

    return data ?? [];
  } catch {
    return [];
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
  } = {}
): Promise<{ success: true } | { error: string }> {
  try {
    // The actor comes from the session, never from the caller — otherwise the
    // audit trail in sms_request_logs is whatever the client says it is.
    const staff = await getRequestStaff();
    if (!staff) {
      return { error: "You are not signed in as staff." };
    }

    const { data: current, error: fetchError } = await supabase2
      .from("sms_requests")
      .select("status, school_id")
      .eq("id", requestId)
      .single();

    if (fetchError || !current) {
      return { error: "Request not found." };
    }

    if (!canActOnSchool(staff, current.school_id)) {
      return { error: "This request belongs to another school." };
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
      updatePayload.reviewed_by = staff.id;
      updatePayload.reviewed_at = new Date().toISOString();
    }
    if (newStatus === "approved") {
      updatePayload.approved_by = staff.id;
      updatePayload.approved_at = new Date().toISOString();
    }

    // Re-assert the status we validated against. Two staff acting on the same
    // request at once would otherwise both pass the transition check above and
    // both write a log entry; the loser of the race now changes nothing.
    const { data: updated, error: updateError } = await supabase2
      .from("sms_requests")
      .update(updatePayload)
      .eq("id", requestId)
      .eq("status", current.status)
      .select("id");

    if (updateError) {
      return { error: "Failed to update request status." };
    }
    if (!updated?.length) {
      return {
        error: "Someone else just updated this request. Refresh and try again.",
      };
    }

    await supabase2.from("sms_request_logs").insert({
      request_id: parseInt(requestId),
      action: newStatus,
      actor_name: staff.name,
      actor_id: staff.id,
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
// Staff: Upload SF10 delivery document and mark request as completed
// ---------------------------------------------------------------------------
export async function uploadDeliveryDocument(
  requestId: string,
  formData: FormData
): Promise<{ success: true } | { error: string }> {
  try {
    const staff = await getRequestStaff();
    if (!staff) {
      return { error: "You are not signed in as staff." };
    }

    const { data: req, error: fetchError } = await supabase2
      .from("sms_requests")
      .select("status, tracking_number, request_type, school_id")
      .eq("id", requestId)
      .single();

    if (fetchError || !req) {
      return { error: "Request not found." };
    }

    if (!canActOnSchool(staff, req.school_id)) {
      return { error: "This request belongs to another school." };
    }

    if (req.status !== "approved") {
      return { error: "Request must be approved before uploading delivery document." };
    }

    const file = formData.get("sf10") as File | null;
    if (!file || file.size === 0) {
      return { error: "No file provided." };
    }

    // The bucket is shared by both document types; the file name follows the
    // document that was actually requested so a diploma delivery is not filed
    // away as an SF10. A diploma is delivered as a scan, an SF10 as a document.
    const isDiploma = req.request_type === "diploma";
    const docLabel = isDiploma ? "Diploma" : "SF10";
    const check = validateRequestFile(
      file,
      isDiploma ? ACCEPTED_UPLOAD_MIME : PDF_ONLY,
    );
    if (!check.valid) {
      return { error: check.error ?? "Unsupported file." };
    }
    const ext = safeFileExtension(file.type);
    const storagePath = `${req.tracking_number}/${docLabel.toLowerCase()}.${ext}`;

    const { error: uploadError } = await supabase2.storage
      .from("sf10-documents")
      .upload(storagePath, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      return { error: `Failed to upload ${docLabel} document.` };
    }

    // Conditional on the status we just checked — see updateRequestStatus.
    const { data: completed, error: updateError } = await supabase2
      .from("sms_requests")
      .update({
        status: "completed",
        delivery_file_path: storagePath,
        completed_by: staff.id,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("status", "approved")
      .select("id");

    if (updateError) {
      return { error: "Failed to mark request as completed." };
    }
    if (!completed?.length) {
      return {
        error: "Someone else just updated this request. Refresh and try again.",
      };
    }

    await supabase2.from("sms_request_attachments").insert({
      request_id: parseInt(requestId),
      file_path: storagePath,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      uploaded_by: staff.name,
      category: "sf10_delivery",
    });

    await supabase2.from("sms_request_logs").insert({
      request_id: parseInt(requestId),
      action: "completed",
      actor_name: staff.name,
      actor_id: staff.id,
      previous_status: "approved",
      new_status: "completed",
      notes: `${docLabel} document uploaded and delivered.`,
    });

    return { success: true };
  } catch {
    return { error: "An unexpected error occurred." };
  }
}

// ---------------------------------------------------------------------------
// Staff: Generate a signed URL for one attachment of one request
// ---------------------------------------------------------------------------
// Takes the attachment id, not a path. The path and the bucket are read from
// the row, so there is nothing for a caller to forge: the previous signature
// would sign any path handed to it in either bucket, for anybody.
export async function getRequestSignedUrl(
  attachmentId: string | number
): Promise<{ url: string } | { error: string }> {
  try {
    const staff = await getRequestStaff();
    if (!staff) {
      return { error: "You are not signed in as staff." };
    }

    const { data: attachment, error: fetchError } = await supabase2
      .from("sms_request_attachments")
      .select("file_path, category, request:sms_requests(school_id)")
      .eq("id", attachmentId)
      .single();

    if (fetchError || !attachment) {
      return { error: "Attachment not found." };
    }

    const parent = attachment.request as unknown as
      | { school_id: number | null }
      | { school_id: number | null }[]
      | null;
    const schoolId = Array.isArray(parent)
      ? (parent[0]?.school_id ?? null)
      : (parent?.school_id ?? null);

    if (!canActOnSchool(staff, schoolId)) {
      return { error: "This request belongs to another school." };
    }

    const bucket =
      attachment.category === "sf10_delivery"
        ? "sf10-documents"
        : "request-attachments";

    const { data, error } = await supabase2.storage
      .from(bucket)
      .createSignedUrl(attachment.file_path, 3600);

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
  trackingNumber: string,
  lrn: string
): Promise<{ url: string } | { error: string }> {
  try {
    const { data: req, error } = await supabase2
      .from("sms_requests")
      .select("status, delivery_file_path, student_lrn")
      .eq("tracking_number", trackingNumber.trim().toUpperCase())
      .maybeSingle();

    if (error || !req) {
      return { error: "Request not found." };
    }
    // A tracking number alone is a weak secret — it is five random characters
    // and it travels through messages and email. Releasing a learner's record
    // takes the LRN as well, the same bar getDiplomaSignedUrl already sets.
    if (req.student_lrn.replace(/\D/g, "") !== lrn.replace(/\D/g, "")) {
      return { error: "LRN does not match this request." };
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

// ---------------------------------------------------------------------------
// Staff: Delete every document request belonging to a learner
// ---------------------------------------------------------------------------
/**
 * Used only by the permanent-delete-student flow on /students.
 *
 * sms_requests.student_id has no ON DELETE rule, so these rows block the
 * learner row from being deleted — but migration 129 revoked DELETE on the
 * three request tables from `authenticated`, so the client cannot clear them
 * itself (it gets "permission denied for table sms_requests"). Like every
 * other write in this module, the delete therefore runs here on the
 * service-role client behind an explicit caller check.
 *
 * Requests at a school the caller cannot act on abort the whole thing rather
 * than being skipped: a partial delete would leave the learner row blocked
 * anyway, and the caller has no business destroying another school's paper
 * trail. Attachments and logs cascade (049); their storage objects are removed
 * here because nothing else would ever reach them again.
 *
 * The caller check mirrors the gate on the page itself (students/List.tsx) —
 * school management, or the teacher who encoded this particular learner — and
 * is re-derived here rather than trusted, because a server action is a public
 * endpoint.
 */
export async function deleteStudentDocumentRequests(
  studentId: string,
): Promise<{ deleted: number } | { error: string }> {
  try {
    const staff = await getRequestStaff({ includeTeachers: true });
    if (!staff) return { error: "You are not signed in as staff." };

    // A teacher may only reach a learner they encoded. Everyone else is scoped
    // by the per-request school check below — not by sms_students.school_id,
    // which names where the record was created, not where the learner is: the
    // registry lists anyone ever enrolled here, so a learner legitimately in
    // this list can carry another school's id.
    if (isTeacherRole(staff.type)) {
      const { data: student } = await supabase2
        .from("sms_students")
        .select("id, encoded_by")
        .eq("id", studentId)
        .maybeSingle();

      if (!student) return { error: "Learner not found." };
      if (String(student.encoded_by ?? "") !== String(staff.id)) {
        return { error: "You may only delete learners you encoded." };
      }
    }

    const { data: requests, error: loadError } = await supabase2
      .from("sms_requests")
      .select("id, school_id")
      .eq("student_id", studentId);

    if (loadError) return { error: "Failed to read the learner's requests." };
    if (!requests || requests.length === 0) return { deleted: 0 };

    const foreign = requests.filter((r) => !canActOnSchool(staff, r.school_id));
    if (foreign.length > 0) {
      return {
        error: `This learner has ${foreign.length} document request(s) at another school. They must be removed by that school first.`,
      };
    }

    const requestIds = requests.map((r) => r.id);

    // Storage first: the rows are the only index of these paths, so once they
    // cascade away an orphaned file can never be found again. A storage
    // failure is not fatal — a stranded file is a smaller problem than a
    // learner who cannot be deleted.
    const { data: attachments } = await supabase2
      .from("sms_request_attachments")
      .select("file_path, category")
      .in("request_id", requestIds);

    const deliveryPaths = (attachments ?? [])
      .filter((a) => a.category === "sf10_delivery")
      .map((a) => a.file_path);
    const attachmentPaths = (attachments ?? [])
      .filter((a) => a.category !== "sf10_delivery")
      .map((a) => a.file_path);

    if (deliveryPaths.length > 0) {
      await supabase2.storage.from("sf10-documents").remove(deliveryPaths);
    }
    if (attachmentPaths.length > 0) {
      await supabase2.storage.from("request-attachments").remove(attachmentPaths);
    }

    const { error: deleteError } = await supabase2
      .from("sms_requests")
      .delete()
      .in("id", requestIds);

    if (deleteError) {
      return { error: `Failed to delete document requests: ${deleteError.message}` };
    }

    return { deleted: requestIds.length };
  } catch {
    return { error: "An unexpected error occurred." };
  }
}
