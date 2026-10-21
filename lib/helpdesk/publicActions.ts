"use server";

/**
 * The public Help Desk form at /contact and its status page (migration 218).
 * No sign-in, so these actions are open HTTP endpoints: the database functions
 * they call are granted to service_role only, and the honeypot, the
 * time-to-submit check and the per-IP rate limits are the protection. The raw
 * IP is never stored — only sha256(ip + HELPDESK_IP_SALT).
 */

import type { HelpdeskPublicThread, HelpdeskStatus } from "@/lib/constants/helpdesk";
import { supabase2 } from "@/lib/supabase/admin";
import { createHash, randomInt } from "crypto";
import { headers } from "next/headers";
import { z } from "zod";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string; reset?: boolean };

async function hashIp(): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
  return createHash("sha256")
    .update(`${ip}|${process.env.HELPDESK_IP_SALT ?? ""}`)
    .digest("hex");
}

/** A code that looks real, for bots that filled the honeypot. Never stored. */
function decoyCode(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "HD-";
  for (let i = 0; i < 6; i++) code += alphabet[randomInt(alphabet.length)];
  return code;
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(150),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  contact: z.string().trim().max(50).optional().default(""),
  school_office: z.string().trim().max(150).optional().default(""),
  category: z.string().min(1, "Choose a category."),
  subject: z
    .string()
    .trim()
    .min(5, "Subject must be 5 to 150 characters.")
    .max(150, "Subject must be 5 to 150 characters."),
  body: z
    .string()
    .trim()
    .min(1, "Message must be 1 to 5000 characters.")
    .max(5000, "Message must be 1 to 5000 characters."),
  website: z.string().optional().default(""),
  started_at: z.number(),
});

const lookupSchema = z.object({
  code: z.string().trim().min(1, "Enter your reference code.").max(20),
  email: z.string().trim().email("Enter a valid email address.").max(254),
});

const replySchema = lookupSchema.extend({
  body: z
    .string()
    .trim()
    .min(1, "Message must be 1 to 5000 characters.")
    .max(5000, "Message must be 1 to 5000 characters."),
});

/** Whether the public form is open. Read without a session. */
export async function isHelpdeskOpen(): Promise<boolean> {
  const { data } = await supabase2.rpc("helpdesk_enabled");
  return data === true;
}

export async function submitPublicConcern(input: unknown): Promise<Result<{ reference_code: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const form = parsed.data;

  // Bots fill every field; people never see this one. Pretend it worked.
  if (form.website !== "") return { ok: true, reference_code: decoyCode() };

  const age = Date.now() - form.started_at;
  if (age < 3000 || age > 2 * 60 * 60 * 1000) {
    return { ok: false, reset: true, error: "Please review your message and submit again." };
  }

  const { data, error } = await supabase2.rpc("helpdesk_public_create", {
    p_payload: {
      name: form.name,
      email: form.email,
      contact: form.contact,
      school_office: form.school_office,
      category: form.category,
      subject: form.subject,
      body: form.body,
    },
    p_ip_hash: await hashIp(),
  });
  if (error || !data) {
    console.error("Help desk public create:", error?.message);
    return { ok: false, error: "Could not send your concern. Please try again." };
  }
  if (!data.ok) return { ok: false, error: data.error };
  return { ok: true, reference_code: data.reference_code };
}

export async function fetchPublicThread(input: unknown): Promise<Result<HelpdeskPublicThread>> {
  const parsed = lookupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter your code and email." };
  }
  const { data, error } = await supabase2.rpc("helpdesk_public_thread", {
    p_code: parsed.data.code,
    p_email: parsed.data.email,
    p_ip_hash: await hashIp(),
  });
  if (error || !data) {
    console.error("Help desk public lookup:", error?.message);
    return { ok: false, error: "Could not load your concern. Please try again." };
  }
  if (!data.ok) return { ok: false, error: data.error };
  return { ok: true, ticket: data.ticket, messages: data.messages };
}

export async function replyToPublicConcern(input: unknown): Promise<Result<{ status: HelpdeskStatus }>> {
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your reply." };
  }
  const { data, error } = await supabase2.rpc("helpdesk_public_reply", {
    p_code: parsed.data.code,
    p_email: parsed.data.email,
    p_body: parsed.data.body,
    p_ip_hash: await hashIp(),
  });
  if (error || !data) {
    console.error("Help desk public reply:", error?.message);
    return { ok: false, error: "Could not send your reply. Please try again." };
  }
  if (!data.ok) return { ok: false, error: data.error };
  return { ok: true, status: data.status };
}
