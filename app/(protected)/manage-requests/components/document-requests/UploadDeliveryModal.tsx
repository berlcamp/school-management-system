"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { uploadDeliveryDocument } from "@/lib/requests/actions";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import toast from "react-hot-toast";

interface UploadDeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestId: string;
  trackingNumber: string;
  /** Which document was requested — decides the copy and the accepted types. */
  requestType: string;
  onSuccess: () => void;
}

export function UploadDeliveryModal({
  isOpen,
  onClose,
  requestId,
  trackingNumber,
  requestType,
  onSuccess,
}: UploadDeliveryModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // A diploma is delivered as a scan, so images are allowed for it; an SF10 is
  // generated as a document and stays PDF-only.
  const isDiploma = requestType === "diploma";
  const docLabel = isDiploma ? "Diploma" : "SF10";
  const docTitle = isDiploma ? "Diploma" : "School Form 10";
  const acceptedTypes = isDiploma
    ? ["application/pdf", "image/jpeg", "image/jpg", "image/png"]
    : ["application/pdf"];
  const acceptAttr = isDiploma
    ? ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
    : ".pdf,application/pdf";
  const acceptedHint = isDiploma ? "PDF, JPG or PNG" : "PDF only";

  const handleClose = () => {
    if (!uploading) {
      setFile(null);
      onClose();
    }
  };

  const handleFile = (f: File) => {
    if (!acceptedTypes.includes(f.type)) {
      toast.error(`Only ${acceptedHint} files are accepted for ${docLabel} delivery.`);
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("File size must not exceed 10 MB.");
      return;
    }
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    const fd = new FormData();
    fd.append("sf10", file);

    const result = await uploadDeliveryDocument(requestId, fd);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      toast.success(`${docLabel} uploaded and request marked as completed.`);
      onSuccess();
      handleClose();
    }
    setUploading(false);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload {docLabel} Document</DialogTitle>
          <DialogDescription>
            Upload the completed {docTitle} for{" "}
            <span className="font-mono font-medium">{trackingNumber}</span>. This
            will mark the request as completed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {file ? (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted border">
              <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                disabled={uploading}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full flex flex-col items-center gap-2 p-6 rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/50 transition-colors"
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">Click to select a file</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {acceptedHint} — max 10 MB
                </p>
              </div>
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={acceptAttr}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Uploading...
              </>
            ) : (
              "Upload & Complete"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
