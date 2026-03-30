"use client";

import { Upload, X, FileText, ImageIcon } from "lucide-react";
import { useRef } from "react";
import { validateRequestFile } from "@/lib/requests/utils";

interface FileUploadZoneProps {
  file: File | null;
  onChange: (file: File | null) => void;
  error?: string;
}

export function FileUploadZone({ file, onChange, error }: FileUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    const result = validateRequestFile(f);
    if (!result.valid) {
      alert(result.error);
      return;
    }
    onChange(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getIcon = (type: string) => {
    if (type.startsWith("image/")) return <ImageIcon className="h-5 w-5" />;
    return <FileText className="h-5 w-5" />;
  };

  return (
    <div className="space-y-2">
      {file ? (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/15 border border-white/25">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20 text-white">
            {getIcon(file.type)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{file.name}</p>
            <p className="text-xs text-white/70">{formatBytes(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 text-white/60 hover:text-white/90 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className={`w-full flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-dashed transition-colors ${
            error
              ? "border-red-400/60 bg-red-500/10"
              : "border-white/30 bg-white/10 hover:bg-white/15 hover:border-white/50"
          }`}
        >
          <Upload className="h-6 w-6 text-white/70" />
          <div className="text-center">
            <p className="text-sm font-medium text-white">
              Click to upload or drag and drop
            </p>
            <p className="text-xs text-white/70 mt-0.5">
              PDF, JPG, PNG — max 10 MB
            </p>
          </div>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      {error && (
        <p className="text-sm text-red-300 font-medium">{error}</p>
      )}
    </div>
  );
}
