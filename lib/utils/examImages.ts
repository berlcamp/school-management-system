/**
 * Storage helpers for exam question / choice figures (migration 159).
 *
 * Files live under the `exam-images/` prefix of the existing `school-management`
 * bucket, following the crla-materials / philiri-materials /
 * supervision-lesson-plans convention (088 / 089 / 110 / 122).
 *
 * That bucket is PUBLIC: an object URL resolves without authentication. The
 * uuid in the path keeps URLs unguessable, but this is obscurity, not access
 * control — see the exam-security note in migration 159.
 */

import { supabase } from "@/lib/supabase/client";

export const EXAM_IMAGE_BUCKET = "school-management";
export const EXAM_IMAGE_PREFIX = "exam-images";

/** What the picture picker accepts. */
export const EXAM_IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp";

/**
 * 5 MB. A figure is printed at roughly a third of a page, so anything larger is
 * a camera original that would only slow the preview down — and a whole exam of
 * them has to render at once when the teacher hits Print.
 */
export const EXAM_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Object path for a figure:
 * `exam-images/<school id | "division">/<uuid>-<name>`.
 *
 * The leading prefix is load-bearing, not cosmetic: migration 159's write
 * policies match on `split_part(name, '/', 1)`, so an upload outside this
 * prefix is rejected by RLS.
 *
 * The uuid lets the picture be attached BEFORE the question row exists (the
 * editor uploads on pick, not on save) and keeps two teachers who both upload
 * "figure1.png" from colliding. The filename is sanitised because Supabase
 * storage keys reject spaces and most punctuation.
 */
export function examImagePath(
  schoolId: string | number | null,
  filename: string,
): string {
  const safe = filename
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-80);
  const scope = schoolId == null ? "division" : String(schoolId);
  return `${EXAM_IMAGE_PREFIX}/${scope}/${crypto.randomUUID()}-${safe || "figure"}`;
}

/**
 * Public URL for a stored figure, or "" when there is no image.
 *
 * Deliberately the public URL rather than a signed one, which is the opposite
 * of the supervision module's choice (122) and for a specific reason: this URL
 * ends up in an `<img>` on a page the teacher PRINTS. A signed URL expires
 * (300s there), so an exam opened, read through and printed twenty minutes
 * later would print with broken figures. Synchronous, so the preview stays a
 * pure render.
 */
export function examImageUrl(path: string | null | undefined): string {
  if (!path) return "";
  return supabase.storage.from(EXAM_IMAGE_BUCKET).getPublicUrl(path).data
    .publicUrl;
}

/**
 * Delete a figure that nothing references yet.
 *
 * Only ever called for an object uploaded during the current editing session —
 * a picture already saved on a question is left in the bucket, because the row
 * still points at it until the builder is submitted and deleting here would
 * leave a dangling reference the moment the teacher cancels (the 122 rule).
 */
export async function removeExamImage(path: string): Promise<void> {
  await supabase.storage.from(EXAM_IMAGE_BUCKET).remove([path]);
}
