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
import { isTerminalEnrollmentStatus } from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { Student } from "@/types";
import { Check, Copy, KeyRound, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

const table = "sms_students";

// Ambiguous characters (0/O, 1/I/L) are excluded so codes are easy to read and
// dictate to learners.
const PORTAL_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generatePortalCode(length = 8): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += PORTAL_CODE_ALPHABET[bytes[i] % PORTAL_CODE_ALPHABET.length];
  }
  return code;
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  enrollmentStatus?: string;
  onUpdated: (student: Student) => void;
}

export const GeneratePortalCodeModal = ({
  isOpen,
  onClose,
  student,
  enrollmentStatus,
  onUpdated,
}: ModalProps) => {
  const user = useAppSelector((state) => state.user.user);
  const [portalCode, setPortalCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPortalCode(student?.portal_code ?? null);
      setCodeCopied(false);
    }
  }, [isOpen, student?.portal_code]);

  const studentName = student
    ? [student.last_name, student.first_name].filter(Boolean).join(", ")
    : "";

  const handleGenerateCode = async () => {
    if (isGenerating || !student?.id) return;
    if (isTerminalEnrollmentStatus(enrollmentStatus)) {
      toast.error(
        "Cannot generate a code for a student with a terminal enrollment status."
      );
      return;
    }
    setIsGenerating(true);
    try {
      const newCode = generatePortalCode();
      let updateQuery = supabase
        .from(table)
        .update({ portal_code: newCode })
        .eq("id", student.id);
      if (user?.school_id != null) {
        updateQuery = updateQuery.eq("school_id", user.school_id);
      }
      const { error } = await updateQuery;
      if (error) throw new Error(error.message);

      setPortalCode(newCode);
      setCodeCopied(false);
      onUpdated({ ...student, portal_code: newCode });
      toast.success("Portal code generated.");
    } catch (err) {
      console.error("Portal code generation error:", err);
      toast.error(err instanceof Error ? err.message : "Error generating code");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyCode = async () => {
    if (!portalCode) return;
    try {
      await navigator.clipboard.writeText(portalCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      toast.error("Could not copy code");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            <KeyRound className="h-5 w-5" />
            Student Portal Code
          </DialogTitle>
          <DialogDescription>
            {studentName ? (
              <>
                Generate a sign-in code for <strong>{studentName}</strong>. The
                student signs in to the Student Portal with their LRN and this
                code.
              </>
            ) : (
              "Generate a Student Portal sign-in code."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {portalCode ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border bg-muted px-3 py-2.5 text-center font-mono text-lg tracking-[0.3em]">
                {portalCode}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 gap-2"
                onClick={handleCopyCode}
              >
                {codeCopied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {codeCopied ? "Copied" : "Copy"}
              </Button>
            </div>
          ) : (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
              No code has been generated yet.
            </p>
          )}

          {portalCode && (
            <p className="text-xs text-amber-600">
              Regenerating replaces the current code; the old code will stop
              working immediately.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isGenerating}
            className="h-10"
          >
            Close
          </Button>
          <Button
            type="button"
            onClick={handleGenerateCode}
            disabled={isGenerating}
            className="h-10 min-w-[120px] gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${isGenerating ? "animate-spin" : ""}`}
            />
            {portalCode ? "Regenerate" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
