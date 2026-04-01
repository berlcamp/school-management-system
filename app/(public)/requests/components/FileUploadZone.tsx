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
        <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
            {getIcon(file.type)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
            <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
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
              ? "border-red-300 bg-red-50"
              : "border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400"
          }`}
        >
          <Upload className="h-6 w-6 text-gray-400" />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700">
              Click to upload or drag and drop
            </p>
            <p className="text-xs text-gray-500 mt-0.5">PDF, JPG, PNG — max 10 MB</p>
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
        <p className="text-sm text-red-500 font-medium">{error}</p>
      )}
    </div>
  );
}
