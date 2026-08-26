"use client";

/**
 * Picture picker for one exam question or one choice (migration 159).
 *
 * Uploads on pick rather than on save, so the teacher sees the figure land
 * before committing the builder — the same trade the supervision lesson-plan
 * attachment makes (122). A picture picked and then abandoned leaves an orphan
 * object in the bucket; that is the accepted cost of the immediate feedback,
 * and an orphan carries no row that references it.
 *
 * The caller owns the draft, so this component only reports the new
 * path / name upward. It tracks which objects IT uploaded so that removing one
 * that was never saved actually deletes it, while detaching a picture already
 * stored on a question leaves the object alone — the row still points at it
 * until the builder is submitted.
 */

import { Button } from "@/components/ui/button";
import {
  EXAM_IMAGE_ACCEPT,
  EXAM_IMAGE_MAX_BYTES,
  EXAM_IMAGE_BUCKET,
  examImagePath,
  examImageUrl,
  removeExamImage,
} from "@/lib/utils/examImages";
import { supabase } from "@/lib/supabase/client";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";

interface ExamImageFieldProps {
  imagePath: string;
  imageName: string;
  /** `school_id` for a teacher-authored exam, null for a division one. */
  schoolId: number | null;
  /** A choice's thumbnail is smaller than a question's figure. */
  size?: "question" | "option";
  disabled?: boolean;
  onChange: (patch: { image_path: string; image_name: string }) => void;
}

export function ExamImageField({
  imagePath,
  imageName,
  schoolId,
  size = "question",
  disabled,
  onChange,
}: ExamImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Objects this field put in the bucket during this editing session, and which
  // therefore no saved row references yet.
  const [sessionUploads, setSessionUploads] = useState<string[]>([]);

  const pick = async (file: File | null) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError(`"${file.name}" is not an image.`);
      return;
    }
    if (file.size > EXAM_IMAGE_MAX_BYTES) {
      setError(
        `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 5 MB.`,
      );
      return;
    }
    setUploading(true);
    try {
      const path = examImagePath(schoolId, file.name);
      const { error: upErr } = await supabase.storage
        .from(EXAM_IMAGE_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);
      setSessionUploads((prev) => [...prev, path]);
      onChange({ image_path: path, image_name: file.name });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to upload the picture.",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    const path = imagePath;
    onChange({ image_path: "", image_name: "" });
    setError(null);
    if (path && sessionUploads.includes(path)) {
      setSessionUploads((prev) => prev.filter((p) => p !== path));
      await removeExamImage(path);
    }
  };

  const url = examImageUrl(imagePath);
  const thumb = size === "option" ? "h-12" : "h-24";

  return (
    <div className={size === "option" ? "" : "space-y-1"}>
      <input
        ref={inputRef}
        type="file"
        accept={EXAM_IMAGE_ACCEPT}
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0] ?? null)}
        disabled={disabled || uploading}
      />

      {url ? (
        <div className="flex items-center gap-2">
          <img
            src={url}
            alt={imageName || "Exam figure"}
            className={`${thumb} w-auto rounded border bg-white object-contain`}
          />
          {size === "question" && (
            <span className="truncate text-[11px] text-muted-foreground">
              {imageName}
            </span>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => void remove()}
            disabled={disabled || uploading}
            title="Remove picture"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={size === "option" ? "h-8 shrink-0 px-2" : ""}
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          title="Add a picture"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImagePlus className="h-3.5 w-3.5" />
          )}
          {size === "question" && (
            <span className="ml-1">
              {uploading ? "Uploading…" : "Add picture"}
            </span>
          )}
        </Button>
      )}

      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
