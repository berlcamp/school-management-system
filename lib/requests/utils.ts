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

export function validateRequestFile(file: File): {
  valid: boolean;
  error?: string;
} {
  if (!ACCEPTED_MIME.includes(file.type as (typeof ACCEPTED_MIME)[number])) {
    return {
      valid: false,
      error: "Only PDF, JPG, and PNG files are accepted.",
    };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: "File size must not exceed 10 MB." };
  }
  return { valid: true };
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
