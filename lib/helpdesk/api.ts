/**
 * Help Desk (migration 218) reads and writes for signed-in users. Reads go
 * through RLS; every write is an RPC, so the database decides who may do what.
 */

import {
  HELPDESK_BUCKET,
  HELPDESK_FILE_TYPES,
  HELPDESK_MAX_FILE_BYTES,
  HELPDESK_MAX_FILES,
  type HelpdeskAttachment,
  type HelpdeskCategory,
  type HelpdeskMessage,
  type HelpdeskStatus,
  type HelpdeskTicket,
  type HelpdeskTicketFilters,
} from "@/lib/constants/helpdesk";
import { supabase } from "@/lib/supabase/client";
import { escapeIlikePattern } from "@/lib/utils";

export type HelpdeskResult<T> = { ok: true; data: T } | { ok: false; error: string };

const TICKET_SELECT =
  "*, assignee:assigned_to(id, name), school:school_id(name)";

const fail = (error: { message?: string } | null, fallback: string) => ({
  ok: false as const,
  error: error?.message || fallback,
});

export async function fetchHelpdeskTickets(
  filters: HelpdeskTicketFilters,
  perPage: number,
  rangeFrom: number,
): Promise<HelpdeskResult<{ rows: HelpdeskTicket[]; count: number }>> {
  let query = supabase
    .from("sms_helpdesk_tickets")
    .select(TICKET_SELECT, { count: "exact" });

  if (filters.submitterId) query = query.eq("submitter_user_id", filters.submitterId);
  if (filters.status === "") query = query.neq("status", "closed");
  else if (filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.attention) query = query.eq("needs_attention", true);
  if (filters.assigned === "me") query = query.eq("assigned_to", filters.userId ?? -1);
  if (filters.assigned === "unassigned") query = query.is("assigned_to", null);

  // PostgREST's or() syntax breaks on commas and parentheses.
  const keyword = escapeIlikePattern(filters.keyword.replace(/[,()]/g, " ").trim());
  if (keyword) {
    query = query.or(
      `reference_code.ilike.%${keyword}%,subject.ilike.%${keyword}%,submitter_name.ilike.%${keyword}%,submitter_email.ilike.%${keyword}%`,
    );
  }

  const { data, error, count } = await query
    .order("needs_attention", { ascending: false })
    .order("last_message_at", { ascending: false })
    .range(rangeFrom, rangeFrom + perPage - 1);
  if (error) return fail(error, "Could not load concerns.");
  return { ok: true, data: { rows: (data ?? []) as HelpdeskTicket[], count: count ?? 0 } };
}

export async function fetchHelpdeskTicket(id: number): Promise<HelpdeskResult<HelpdeskTicket | null>> {
  const { data, error } = await supabase
    .from("sms_helpdesk_tickets")
    .select(TICKET_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(error, "Could not load this concern.");
  return { ok: true, data: (data as HelpdeskTicket | null) ?? null };
}

export async function fetchHelpdeskMessages(ticketId: number): Promise<HelpdeskResult<HelpdeskMessage[]>> {
  const { data, error } = await supabase
    .from("sms_helpdesk_messages")
    .select("*, author:author_user_id(name)")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) return fail(error, "Could not load messages.");
  return { ok: true, data: (data ?? []) as HelpdeskMessage[] };
}

export async function createHelpdeskTicket(input: {
  subject: string;
  category: HelpdeskCategory;
  body: string;
}): Promise<HelpdeskResult<{ id: number; reference_code: string; message_id: number }>> {
  const { data, error } = await supabase.rpc("helpdesk_create_ticket", {
    p_subject: input.subject,
    p_category: input.category,
    p_body: input.body,
  });
  if (error || !data) return fail(error, "Could not send your concern. Please try again.");
  return { ok: true, data };
}

export async function postHelpdeskMessage(input: {
  ticketId: number;
  body: string;
  isInternal?: boolean;
  setStatus?: HelpdeskStatus | null;
}): Promise<HelpdeskResult<{ message_id: number; status: HelpdeskStatus }>> {
  const { data, error } = await supabase.rpc("helpdesk_post_message", {
    p_ticket_id: input.ticketId,
    p_body: input.body,
    p_is_internal: input.isInternal ?? false,
    p_set_status: input.setStatus ?? null,
  });
  if (error || !data) return fail(error, "Could not send. Please try again.");
  return { ok: true, data };
}

export async function updateHelpdeskTicket(input: {
  ticketId: number;
  status?: HelpdeskStatus;
  assignedTo?: number;
  unassign?: boolean;
}): Promise<HelpdeskResult<null>> {
  const { error } = await supabase.rpc("helpdesk_update_ticket", {
    p_ticket_id: input.ticketId,
    p_status: input.status ?? null,
    p_assigned_to: input.assignedTo ?? null,
    p_unassign: input.unassign ?? false,
  });
  if (error) return fail(error, "Could not update this concern.");
  return { ok: true, data: null };
}

export async function fetchHelpdeskStaff(): Promise<HelpdeskResult<{ id: number; name: string; type: string }[]>> {
  const { data, error } = await supabase.rpc("helpdesk_staff_list");
  if (error) return fail(error, "Could not load the Help Desk staff.");
  return { ok: true, data: data ?? [] };
}

/** A user-facing problem with the chosen files, or null when they are fine. */
export function validateHelpdeskFiles(files: File[]): string | null {
  if (files.length > HELPDESK_MAX_FILES) return `Attach at most ${HELPDESK_MAX_FILES} files.`;
  const bad = files.find((f) => !HELPDESK_FILE_TYPES[f.type]);
  if (bad) return `${bad.name}: only images (JPG, PNG, GIF, WebP, HEIC) and PDF files can be attached.`;
  const big = files.find((f) => f.size > HELPDESK_MAX_FILE_BYTES);
  if (big) return `${big.name} is larger than 5 MB.`;
  return null;
}

/**
 * Uploads files into the ticket's folder and records them on the message.
 * Returns the names of files that could not be uploaded; a failure to record
 * them on the message is returned as an error result.
 */
export async function uploadHelpdeskFiles(
  ticketId: number,
  messageId: number,
  files: File[],
): Promise<HelpdeskResult<{ failed: string[] }>> {
  const uploaded: HelpdeskAttachment[] = [];
  const failed: string[] = [];

  await Promise.all(
    files.map(async (file) => {
      // Storage only accepts help desk files with an image or PDF extension.
      const ext = HELPDESK_FILE_TYPES[file.type];
      let safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
      if (
        ext &&
        !safeName.toLowerCase().endsWith(`.${ext}`) &&
        !(ext === "jpg" && safeName.toLowerCase().endsWith(".jpeg"))
      ) {
        safeName = `${safeName.slice(0, 75)}.${ext}`;
      }
      const path = `${ticketId}/${crypto.randomUUID()}-${safeName}`;
      const { error } = await supabase.storage
        .from(HELPDESK_BUCKET)
        .upload(path, file, { contentType: file.type });
      if (error) failed.push(file.name);
      else uploaded.push({ path, name: file.name, size: file.size, type: file.type });
    }),
  );

  if (uploaded.length === 0) return { ok: true, data: { failed } };

  const { error } = await supabase.rpc("helpdesk_attach_to_message", {
    p_message_id: messageId,
    p_attachments: uploaded,
  });
  if (error) return fail(error, "Could not attach the files.");
  return { ok: true, data: { failed } };
}

/** A 5-minute link to an attachment, or null if storage refused. */
export async function helpdeskFileUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(HELPDESK_BUCKET)
    .createSignedUrl(path, 300);
  return error ? null : data.signedUrl;
}

/**
 * How many concerns each inbox view holds. Head-only counts, so no rows are
 * transferred; RLS limits them to what the caller may see.
 */
export async function fetchHelpdeskViewCounts(
  userId: number | undefined,
): Promise<HelpdeskResult<Record<string, number>>> {
  const base = () =>
    supabase.from("sms_helpdesk_tickets").select("id", { count: "exact", head: true });
  const queries = {
    attention: base().neq("status", "closed").eq("needs_attention", true),
    mine: base().neq("status", "closed").eq("assigned_to", userId ?? -1),
    unassigned: base().neq("status", "closed").is("assigned_to", null),
    active: base().neq("status", "closed"),
    resolved: base().eq("status", "resolved"),
    closed: base().eq("status", "closed"),
  };
  const keys = Object.keys(queries) as (keyof typeof queries)[];
  const results = await Promise.all(keys.map((k) => queries[k]));
  const counts: Record<string, number> = {};
  for (let i = 0; i < keys.length; i++) {
    const r = results[i];
    if (r.error) return fail(r.error, "Could not count concerns.");
    counts[keys[i]] = r.count ?? 0;
  }
  return { ok: true, data: counts };
}

/** The submitter's own concerns where the Help Desk replied last. */
export async function fetchMyHelpdeskReplyCount(userId: number): Promise<number> {
  const { count } = await supabase
    .from("sms_helpdesk_tickets")
    .select("id", { count: "exact", head: true })
    .eq("submitter_user_id", userId)
    .eq("last_message_by", "staff")
    .not("status", "in", "(resolved,closed)");
  return count ?? 0;
}

export async function setHelpdeskEnabled(enabled: boolean): Promise<HelpdeskResult<null>> {
  const { error } = await supabase.rpc("helpdesk_set_enabled", { p_enabled: enabled });
  if (error) return fail(error, "Could not change the Help Desk setting.");
  return { ok: true, data: null };
}

export async function setHelpdeskStaff(userId: number, on: boolean): Promise<HelpdeskResult<null>> {
  const { error } = await supabase.rpc("helpdesk_set_staff", { p_user_id: userId, p_on: on });
  if (error) return fail(error, "Could not update the Help Desk staff.");
  return { ok: true, data: null };
}
