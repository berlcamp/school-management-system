/**
 * Client side of the exam release code (migration 161).
 *
 * Every call here is an RPC, never a table read: `sms_exam_release_codes` has
 * RLS on with no policies at all, so PostgREST cannot reach it under any role.
 * The code is compared inside the database, which is what stops the gate from
 * being a hidden button.
 */

import { supabase } from "@/lib/supabase/client";

/** Codes are stored upper-cased and trimmed; the UI should show them that way. */
export function normalizeReleaseCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * A code that survives being read down a phone line and written on a whiteboard.
 *
 * No O/0, I/1 or S/5 — a teacher mis-keying a lookalike gets "that code is not
 * right" for an exam they were legitimately given, which is the one failure
 * that makes people stop trusting the gate.
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRTUVWXYZ2346789";

export function generateReleaseCode(length = 8): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join(
    "",
  );
}

/** The current code, or null when the exam is not gated. Managers only. */
export async function fetchReleaseCode(
  examId: string | number,
): Promise<{ code: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("exam_get_release_code", {
    p_exam_id: Number(examId),
  });
  if (error) return { code: null, error: error.message };
  return { code: (data as string | null) ?? null, error: null };
}

/** Set or replace the code. An empty string clears the gate and every unlock. */
export async function saveReleaseCode(
  examId: string | number,
  code: string,
): Promise<string | null> {
  const { error } = await supabase.rpc("exam_set_release_code", {
    p_exam_id: Number(examId),
    p_code: normalizeReleaseCode(code),
  });
  return error ? error.message : null;
}

/**
 * Redeem a code. `false` means it was wrong — deliberately indistinguishable
 * from any other wrong guess.
 */
export async function redeemReleaseCode(
  examId: string | number,
  code: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc("exam_unlock", {
    p_exam_id: Number(examId),
    p_code: normalizeReleaseCode(code),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: data === true, error: null };
}

/**
 * Whether this account may read the exam's paper right now.
 *
 * Asked of the database rather than worked out in the browser, so the answer is
 * the same one RLS will give when the questions are actually fetched.
 *
 * THREE outcomes, not two, and the third one matters: `allowed` is what the
 * database said, and `error` is set when it could not be asked at all — the
 * function missing because migration 161 has not been applied, EXECUTE not
 * granted, PostgREST not yet aware of it. An earlier version collapsed that
 * third case into `false`, which showed every reader the "this exam has not
 * been released" screen for an exam nobody had sealed, and threw away the one
 * string that said why.
 *
 * Callers must treat `error` as ALLOWED and surface the message. That is safe,
 * because this check is presentation only: the real gate is the RLS policy on
 * the five paper tables (migration 161 §7), which answers the same question
 * again when the rows are actually fetched and hands back nothing to a reader
 * who may not have them. Failing closed here protects no data and only hides
 * the exam from the people entitled to it.
 */
export async function canReadExamPaper(
  examId: string | number,
): Promise<{ allowed: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc("can_read_exam_paper", {
    p_exam_id: Number(examId),
  });
  if (error) return { allowed: true, error: error.message };
  return { allowed: data === true, error: null };
}

// ---------------------------------------------------------------------------
// Division exams (migration 236): published by the division office, then
// opened per SCHOOL by its school head with a 6-character passcode.
// ---------------------------------------------------------------------------

export const DIVISION_PASSCODE_LENGTH = 6;

/** Show / hide an approved division exam for every teacher in the division. */
export async function setDivisionExamPublished(
  examId: string | number,
  published: boolean,
): Promise<string | null> {
  const { error } = await supabase.rpc("exam_division_set_published", {
    p_exam_id: Number(examId),
    p_published: published,
  });
  return error ? error.message : null;
}

/** Set or replace the school passcode; an empty string clears it and every school's unlock. */
export async function saveDivisionPasscode(
  examId: string | number,
  code: string,
): Promise<string | null> {
  const { error } = await supabase.rpc("exam_division_set_passcode", {
    p_exam_id: Number(examId),
    p_code: normalizeReleaseCode(code),
  });
  return error ? error.message : null;
}

/** A school head opens a division exam for their active school. `false` = wrong code. */
export async function redeemSchoolPasscode(
  examId: string | number,
  code: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc("exam_school_unlock", {
    p_exam_id: Number(examId),
    p_code: normalizeReleaseCode(code),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: data === true, error: null };
}

export interface SchoolUnlock {
  school_id: string;
  school_name: string;
  unlocked_at: string;
}

/** Schools whose head has entered the passcode (division office and QA see every school). */
export async function fetchSchoolUnlocks(
  examId: string | number,
): Promise<{ rows: SchoolUnlock[]; error: string | null }> {
  const { data, error } = await supabase
    .from("sms_exam_school_unlocks")
    .select("school_id, unlocked_at, school:school_id(name)")
    .eq("exam_id", Number(examId))
    .order("unlocked_at");
  if (error) return { rows: [], error: error.message };
  const rows = ((data ?? []) as unknown as {
    school_id: string | number;
    unlocked_at: string;
    school: { name: string | null } | null;
  }[]).map((r) => ({
    school_id: String(r.school_id),
    school_name: r.school?.name ?? "",
    unlocked_at: r.unlocked_at,
  }));
  return { rows, error: null };
}
