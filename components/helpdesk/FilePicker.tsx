"use client";

import { Button } from "@/components/ui/button";
import { HELPDESK_FILE_TYPES, HELPDESK_MAX_FILES } from "@/lib/constants/helpdesk";
import { validateHelpdeskFiles } from "@/lib/helpdesk/api";
import { Paperclip, X } from "lucide-react";
import { useId, useRef, useState } from "react";

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

export function FilePicker({ files, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);

  const add = (picked: FileList | null) => {
    const next = files.concat(Array.from(picked ?? []));
    const problem = validateHelpdeskFiles(next);
    setError(problem);
    if (!problem) onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || files.length >= HELPDESK_MAX_FILES}
          onClick={() => inputRef.current?.click()}
          aria-describedby={error ? errorId : undefined}
        >
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          Attach
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={Object.keys(HELPDESK_FILE_TYPES).join(",")}
          className="hidden"
          onChange={(e) => add(e.target.files)}
        />
        {files.map((f, i) => (
          <span
            key={`${f.name}-${i}`}
            className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700"
          >
            <span className="max-w-[10rem] truncate">{f.name}</span>
            <button
              type="button"
              aria-label={`Remove ${f.name}`}
              onClick={() => onChange(files.filter((_, j) => j !== i))}
              className="rounded p-0.5 hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <p className="mt-1 text-xs text-gray-500">Images or PDF, up to 3 files, 5 MB each.</p>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
