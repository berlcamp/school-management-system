"use server";

/**
 * Transfer record requests — approve, reject, cancel, remove.
 *
 * These wrap the SECURITY DEFINER RPCs in migrations 066/127. Those functions
 * bypass RLS by definition and, until migration 129, were granted to
 * `authenticated` and trusted the responder id they were handed — so any
 * signed-in user could approve a transfer for any school, or drop a learner's
 * enrollment and move them back to their previous school.
 *
 * Migration 129 revokes EXECUTE from anon/authenticated, leaving the
 * service-role client as the only caller. That makes this file the gate: it
 * resolves the acting staff member from the session and checks their school
 * against the request before the RPC is reached.
 */

import { supabase2 } from "@/lib/supabase/admin";
import { canActOnSchool, getRequestStaff } from "./auth";

type Result = { success: true } | { error: string };

interface RecordRequestRow {
  id: number;
  status: string;
  origin_school_id: number | null;
  requesting_school_id: number | null;
}

async function loadRequest(
  requestId: string,
): Promise<RecordRequestRow | null> {
  const { data } = await supabase2
    .from("sms_record_requests")
    .select("id, status, origin_school_id, requesting_school_id")
    .eq("id", requestId)
    .maybeSingle();
  return (data as RecordRequestRow | null) ?? null;
}

/**
 * Approve or reject an incoming request. Only the ORIGIN school holds the
 * records being asked for, so only it (or division staff) may answer.
 */
export async function respondToRecordRequest(
  requestId: string,
  action: "approved" | "rejected",
  rejectionReason?: string,
): Promise<Result> {
  try {
    const staff = await getRequestStaff();
    if (!staff) return { error: "You are not signed in as staff." };

    if (action === "rejected" && !rejectionReason?.trim()) {
      return { error: "A rejection reason is required." };
    }

    const request = await loadRequest(requestId);
    if (!request) return { error: "Record request not found." };

    if (!canActOnSchool(staff, request.origin_school_id)) {
      return { error: "Only the school holding these records can answer this request." };
    }

    const { error } = await supabase2.rpc("respond_to_record_request", {
      p_request_id: requestId,
      p_action: action,
      p_responder_id: staff.id,
      p_rejection_reason: action === "rejected" ? rejectionReason!.trim() : null,
    });

    if (error) {
      return { error: error.message || "Failed to update the record request." };
    }
    return { success: true };
  } catch {
    return { error: "An unexpected error occurred." };
  }
}

/**
 * Withdraw a request we raised. Only the REQUESTING school may cancel its own.
 */
export async function cancelRecordRequest(requestId: string): Promise<Result> {
  try {
    const staff = await getRequestStaff();
    if (!staff) return { error: "You are not signed in as staff." };

    const request = await loadRequest(requestId);
    if (!request) return { error: "Record request not found." };

    if (!canActOnSchool(staff, request.requesting_school_id)) {
      return { error: "Only the school that raised this request can cancel it." };
    }

    const { error } = await supabase2.rpc("cancel_record_request", {
      p_request_id: requestId,
      p_user_id: staff.id,
    });

    if (error) {
      return { error: error.message || "Failed to cancel the record request." };
    }
    return { success: true };
  } catch {
    return { error: "An unexpected error occurred." };
  }
}

/**
 * Drop a transferee after reviewing their records and send them back to the
 * origin school. This one moves a learner between schools, so it is the most
 * consequential of the three — only the REQUESTING (destination) school, which
 * is the one holding the enrollment being dropped, may call it.
 */
export async function removeTransferStudent(
  requestId: string,
  reason: string,
): Promise<Result> {
  try {
    const staff = await getRequestStaff();
    if (!staff) return { error: "You are not signed in as staff." };

    if (!reason?.trim()) return { error: "A reason is required." };

    const request = await loadRequest(requestId);
    if (!request) return { error: "Record request not found." };

    if (!canActOnSchool(staff, request.requesting_school_id)) {
      return { error: "Only the school the learner transferred to can remove them." };
    }

    const { error } = await supabase2.rpc("remove_transfer_student", {
      p_request_id: requestId,
      p_remover_id: staff.id,
      p_reason: reason.trim(),
    });

    if (error) {
      return { error: error.message || "Failed to remove the student." };
    }
    return { success: true };
  } catch {
    return { error: "An unexpected error occurred." };
  }
}
