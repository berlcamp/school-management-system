import { supabase } from "@/lib/supabase/client";

export const SCHOOL_MANAGEMENT_BUCKET = "school-management";

const PUBLIC_URL_MARKER = "/storage/v1/object/public/school-management/";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_BYTES = 5 * 1024 * 1024;

export function isSchoolManagementPublicObjectUrl(url: string): boolean {
  return url.includes(PUBLIC_URL_MARKER);
}

/** Object path inside the bucket, e.g. landing-hero/6/banner-123.webp */
export function objectPathFromSchoolManagementPublicUrl(
  publicUrl: string
): string | null {
  const i = publicUrl.indexOf(PUBLIC_URL_MARKER);
  if (i === -1) return null;
  try {
    return decodeURIComponent(publicUrl.slice(i + PUBLIC_URL_MARKER.length));
  } catch {
    return null;
  }
}

export async function removeSchoolManagementObjects(
  paths: string[]
): Promise<void> {
  const unique = [...new Set(paths.filter((p) => p.length > 0))];
  if (unique.length === 0) return;
  const { error } = await supabase.storage
    .from(SCHOOL_MANAGEMENT_BUCKET)
    .remove(unique);
  if (error) {
    console.error("school-management storage remove:", error);
  }
}

export async function uploadSchoolLandingHeroImage(
  file: File,
  schoolId: string | number
): Promise<{ publicUrl: string; path: string }> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Please use a JPEG, PNG, WebP, or GIF image.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Image must be 5 MB or smaller.");
  }

  const extFromName = file.name.split(".").pop()?.toLowerCase();
  const ext =
    extFromName && extFromName.length <= 5 && /^[a-z0-9]+$/i.test(extFromName)
      ? extFromName
      : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : file.type === "image/gif"
            ? "gif"
            : "jpg";

  const sid = String(schoolId);
  const path = `landing-hero/${sid}/banner-${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(SCHOOL_MANAGEMENT_BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type || "image/jpeg",
    });

  if (uploadErr) {
    throw new Error(uploadErr.message);
  }

  const { data } = supabase.storage
    .from(SCHOOL_MANAGEMENT_BUCKET)
    .getPublicUrl(path);

  return { publicUrl: data.publicUrl, path };
}
