"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HELPDESK_CATEGORIES, type HelpdeskCategory } from "@/lib/constants/helpdesk";
import { createHelpdeskTicket, uploadHelpdeskFiles } from "@/lib/helpdesk/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";
import { FilePicker } from "./FilePicker";

const schema = z.object({
  category: z.string().min(1, "Choose a category."),
  subject: z
    .string()
    .trim()
    .min(5, "Subject must be 5 to 150 characters.")
    .max(150, "Subject must be 5 to 150 characters."),
  body: z.string().trim().min(1, "Describe your concern.").max(5000, "Message must be 1 to 5000 characters."),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (ticketId: number) => void;
}

const fieldClass =
  "mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-red-600";

export function NewTicketDialog({ open, onOpenChange, onCreated }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { category: "", subject: "", body: "" },
  });
  const bodyLength = watch("body")?.length ?? 0;

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const result = await createHelpdeskTicket({
      category: values.category as HelpdeskCategory,
      subject: values.subject,
      body: values.body,
    });
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    const code = result.data.reference_code;
    let warned = false;
    if (files.length > 0) {
      const upload = await uploadHelpdeskFiles(result.data.id, result.data.message_id, files);
      if (!upload.ok) {
        warned = true;
        toast.error(`Concern sent (${code}), but the files could not be attached: ${upload.error}`);
      } else if (upload.data.failed.length > 0) {
        warned = true;
        toast.error(
          `Concern sent (${code}), but ${upload.data.failed.length} file(s) failed to upload. You can attach them in a reply.`,
        );
      }
    }
    if (!warned) toast.success(`Concern sent · ${code}`);
    reset();
    setFiles([]);
    onOpenChange(false);
    onCreated(result.data.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New concern</DialogTitle>
          <DialogDescription>The division Help Desk will reply here.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <label htmlFor="nt-category" className="text-sm font-medium text-gray-800">
              Category
            </label>
            <select id="nt-category" {...register("category")} aria-invalid={!!errors.category} className={fieldClass}>
              <option value="">Choose…</option>
              {HELPDESK_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            {errors.category && (
              <p role="alert" className="mt-1 text-xs text-red-700">
                {errors.category.message}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="nt-subject" className="text-sm font-medium text-gray-800">
              Subject
            </label>
            <input
              id="nt-subject"
              {...register("subject")}
              maxLength={150}
              aria-invalid={!!errors.subject}
              className={fieldClass}
            />
            {errors.subject && (
              <p role="alert" className="mt-1 text-xs text-red-700">
                {errors.subject.message}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="nt-body" className="text-sm font-medium text-gray-800">
              Message
            </label>
            <textarea
              id="nt-body"
              {...register("body")}
              rows={6}
              maxLength={5000}
              aria-invalid={!!errors.body}
              className={fieldClass}
            />
            <div className="mt-1 flex justify-between text-xs">
              <span className="text-red-700" role={errors.body ? "alert" : undefined}>
                {errors.body?.message}
              </span>
              <span className="text-gray-500">{bodyLength}/5000</span>
            </div>
          </div>
          <FilePicker files={files} onChange={setFiles} disabled={isSubmitting} />
          {serverError && (
            <p role="alert" className="text-sm text-red-700">
              {serverError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {isSubmitting ? "Sending…" : "Send concern"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
