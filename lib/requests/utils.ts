/**
 * Utility helpers for the Requests module.
 */

const ACCEPTED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
] as const;

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Shared by the upload widgets and by the server actions that receive the file.
 * The client-side call is a courtesy so the user finds out early; the
 * server-side call is the one that actually enforces anything.
 */
export function validateRequestFile(
  file: File,
  accepted: readonly string[] = ACCEPTED_MIME,
): {
  valid: boolean;
  error?: string;
} {
  if (!accepted.includes(file.type)) {
    const names = accepted.includes("image/png")
      ? "PDF, JPG, and PNG"
      : "PDF";
    return {
      valid: false,
      error: `Only ${names} files are accepted.`,
    };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: "File size must not exceed 10 MB." };
  }
  return { valid: true };
}

/** Delivery uploads for an SF10 are documents, never scans. */
export const PDF_ONLY = ["application/pdf"] as const;

/** Everything the module will store: PDF plus the two scan formats. */
export const ACCEPTED_UPLOAD_MIME = ACCEPTED_MIME;

/**
 * The extension to store a file under, derived from its MIME type rather than
 * its name. A caller-supplied filename can carry slashes and `..` segments and
 * is interpolated straight into a storage path — so the name never reaches the
 * path at all.
 */
export function safeFileExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    default:
      return "pdf";
  }
}

/**
 * Generates a tracking number in the format REQ-YYYYMMDD-XXXXX.
 * XXXXX is a 5-character uppercase alphanumeric random suffix.
 */
export function buildTrackingNumber(): string {
  const now = new Date();
  const datePart = now
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let suffix = "";
  for (let i = 0; i < 5; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `REQ-${datePart}-${suffix}`;
}
