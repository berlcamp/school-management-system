"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getExistingRequestsForLrn,
  submitPublicRequest,
} from "@/lib/requests/actions";
import { supabase } from "@/lib/supabase/client";
import { DocumentRequestType } from "@/types/database";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, ClipboardCopy, FilePlus, Loader2, Search } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";
import { LrnBoxInput } from "@/components/LrnBoxInput";
import { FileUploadZone } from "./FileUploadZone";

const FormSchema = z
  .object({
    requester_type: z.enum(["school", "parent", "student"], {
      required_error: "Requester type is required",
    }),
    requester_name: z.string().min(1, "Requester name is required"),
    requester_contact: z.string().min(1, "Contact number is required"),
    requester_email: z.string().email("Invalid email").optional().or(z.literal("")),
    requester_relationship: z.string().min(1, "Relationship is required"),
    student_name: z.string().min(1, "Student name is required"),
    student_lrn: z
      .string()
      .regex(/^\d{12}$/, "LRN must be exactly 12 digits"),
    last_school_attended: z.string().optional(),
    year_graduated: z.string().optional(),
    purpose: z.string().min(1, "Purpose is required"),
    request_form137: z.boolean(),
    request_diploma: z.boolean(),
  })
  .refine((d) => d.request_form137 || d.request_diploma, {
    message: "Select at least one document (School Form 10 or Diploma)",
    path: ["request_form137"],
  });

type FormType = z.infer<typeof FormSchema>;

interface ExistingRequest {
  request_type: DocumentRequestType;
  status: string;
}

export function SubmitRequestForm() {
  const [lrnVerified, setLrnVerified] = useState(false);
  const [verifyingLrn, setVerifyingLrn] = useState(false);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [schoolId, setSchoolId] = useState<number | null>(null);
  const [existingRequests, setExistingRequests] = useState<ExistingRequest[]>([]);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [trackingNumbers, setTrackingNumbers] = useState<string[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      requester_type: undefined,
      requester_name: "",
      requester_contact: "",
      requester_email: "",
      requester_relationship: "",
      student_name: "",
      student_lrn: "",
      last_school_attended: "",
      year_graduated: "",
      purpose: "",
      request_form137: false,
      request_diploma: false,
    },
  });

  const hasPendingForType = (type: DocumentRequestType) =>
    existingRequests.some(
      (r) =>
        r.request_type === type &&
        (r.status === "pending" || r.status === "under_review" || r.status === "approved")
    );

  const handleLrnVerify = async () => {
    const lrn = form.getValues("student_lrn").replace(/\D/g, "");
    if (lrn.length !== 12) {
      form.setError("student_lrn", { message: "LRN must be exactly 12 digits" });
      return;
    }

    setVerifyingLrn(true);
    const { data, error } = await supabase
      .from("sms_students")
      .select("id, first_name, last_name, school_id")
      .eq("lrn", lrn)
      .maybeSingle();

    if (error) {
      toast.error("Error checking LRN. Please try again.");
      setVerifyingLrn(false);
      return;
    }

    if (data) {
      setLrnVerified(true);
      setStudentId(data.id);
      setSchoolId(data.school_id ?? null);
      const fullName = `${data.last_name}, ${data.first_name}`;
      form.setValue("student_name", fullName);
      form.clearErrors("student_lrn");
      toast.success(`Student found: ${fullName}`);

      // Server-side: sms_requests holds requester contact details and is no
      // longer readable with the anon key (migration 129).
      const reqs = await getExistingRequestsForLrn(lrn);
      setExistingRequests(reqs as ExistingRequest[]);
    } else {
      setLrnVerified(false);
      setStudentId(null);
      setSchoolId(null);
      setExistingRequests([]);
      form.setError("student_lrn", {
        message: "Student not found. Please check the LRN.",
      });
    }
    setVerifyingLrn(false);
  };

  const handleCopy = (value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(value);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const onSubmit = async (data: FormType) => {
    if (!lrnVerified) {
      toast.error("Please verify the LRN first.");
      return;
    }
    if (!attachmentFile) {
      setAttachmentError("A signed request document is required.");
      return;
    }
    setAttachmentError(undefined);

    const types: DocumentRequestType[] = [];
    if (data.request_form137 && !hasPendingForType("form137")) types.push("form137");
    if (data.request_diploma && !hasPendingForType("diploma")) types.push("diploma");

    if (types.length === 0) {
      toast.error("All selected documents already have a pending request.");
      return;
    }

    setSubmitting(true);

    const fd = new FormData();
    fd.append("requester_type", data.requester_type);
    fd.append("requester_name", data.requester_name);
    fd.append("requester_contact", data.requester_contact);
    if (data.requester_email) fd.append("requester_email", data.requester_email);
    fd.append("requester_relationship", data.requester_relationship);
    fd.append("student_name", data.student_name);
    fd.append("student_lrn", data.student_lrn.replace(/\D/g, ""));
    if (studentId) fd.append("student_id", String(studentId));
    if (schoolId) fd.append("school_id", String(schoolId));
    if (data.last_school_attended) fd.append("last_school_attended", data.last_school_attended);
    if (data.year_graduated) fd.append("year_graduated", data.year_graduated);
    fd.append("purpose", data.purpose);
    types.forEach((t) => fd.append("request_type", t));
    fd.append("attachment", attachmentFile);

    const result = await submitPublicRequest(fd);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      setTrackingNumbers(result.tracking_numbers);
      form.reset();
      setAttachmentFile(null);
      setLrnVerified(false);
      setStudentId(null);
      setSchoolId(null);
      setExistingRequests([]);
    }

    setSubmitting(false);
  };

  // Success state — one tracking number per requested document.
  if (trackingNumbers) {
    return (
      <div className="flex flex-col items-center gap-4 text-center py-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Request Submitted!</h2>
          <p className="text-sm text-gray-500 mt-1">
            {trackingNumbers.length > 1
              ? "Each document has its own tracking number. Save all of them to check your request status."
              : "Save your tracking number to check your request status."}
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full max-w-sm">
          {trackingNumbers.map((number) => (
            <div
              key={number}
              className="flex items-center justify-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-5 py-3"
            >
              <span className="font-mono text-lg font-semibold text-gray-900 tracking-wider">
                {number}
              </span>
              <button
                type="button"
                onClick={() => handleCopy(number)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                {copied === number ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <ClipboardCopy className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          onClick={() => setTrackingNumbers(null)}
          className="bg-slate-900 hover:bg-slate-800 text-white gap-2 mt-2"
        >
          <FilePlus className="h-4 w-4" />
          Submit Another Request
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {/* Requester type */}
        <FormField
          control={form.control}
          name="requester_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-gray-700">Requester Type *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="bg-white border-gray-200 text-gray-900 h-10">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="parent">Parent / Guardian</SelectItem>
                  <SelectItem value="school">School / Institution</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Requester info */}
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="requester_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-gray-700">Full Name *</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Requester's full name"
                    {...field}
                    className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="requester_contact"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-gray-700">Contact Number *</FormLabel>
                <FormControl>
                  <Input
                    placeholder="09XX XXX XXXX"
                    {...field}
                    className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="requester_email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-gray-700">Email (optional)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="email@example.com"
                    type="email"
                    {...field}
                    className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="requester_relationship"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-gray-700">Relationship to Student *</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., Parent, Guardian, Self"
                    {...field}
                    className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Student info */}
        <div className="space-y-3 p-4 rounded-xl bg-gray-50 border border-gray-200">
          <p className="text-sm font-semibold text-gray-700">
            Student Information
          </p>

          <FormField
            control={form.control}
            name="student_lrn"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-gray-700">
                  Learner Reference Number (LRN) *
                </FormLabel>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                  <FormControl>
                    <LrnBoxInput
                      id="request-student-lrn"
                      variant="light"
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v);
                        if (!v.replace(/\D/g, "")) {
                          setLrnVerified(false);
                          setStudentId(null);
                          setSchoolId(null);
                          setExistingRequests([]);
                        }
                      }}
                      disabled={verifyingLrn}
                    />
                  </FormControl>
                  <Button
                    type="button"
                    onClick={handleLrnVerify}
                    disabled={verifyingLrn}
                    variant="outline"
                    className="shrink-0 h-11 px-4 border-gray-200 self-start sm:self-auto"
                  >
                    {verifyingLrn ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Search className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Verify</span>
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                  12 digits in groups of four (4-4-4).
                </p>
                {lrnVerified && (
                  <p className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Student verified
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="student_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-gray-700">Student Full Name *</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Last name, First name"
                    {...field}
                    readOnly={lrnVerified}
                    className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="last_school_attended"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-700">Last School Attended</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="School name"
                      {...field}
                      className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="year_graduated"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-700">Year Graduated</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., 2023"
                      {...field}
                      className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Documents */}
        <div className="space-y-3">
          <FormLabel className="text-gray-700">Documents Requested *</FormLabel>
          <div className="flex gap-6">
            <FormField
              control={form.control}
              name="request_form137"
              render={({ field }) => {
                const pending = hasPendingForType("form137");
                return (
                  <FormItem className="flex items-center gap-2.5 space-y-0">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={field.onChange}
                        disabled={pending}
                        className="h-4 w-4 rounded border-gray-300 text-slate-900"
                      />
                    </FormControl>
                    <FormLabel
                      className={`font-normal cursor-pointer flex items-center gap-1.5 ${
                        pending ? "text-gray-400 cursor-not-allowed" : "text-gray-700"
                      }`}
                    >
                      School Form 10
                      {pending && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          Active
                        </Badge>
                      )}
                    </FormLabel>
                  </FormItem>
                );
              }}
            />
            <FormField
              control={form.control}
              name="request_diploma"
              render={({ field }) => {
                const pending = hasPendingForType("diploma");
                return (
                  <FormItem className="flex items-center gap-2.5 space-y-0">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={field.onChange}
                        disabled={pending}
                        className="h-4 w-4 rounded border-gray-300 text-slate-900"
                      />
                    </FormControl>
                    <FormLabel
                      className={`font-normal cursor-pointer flex items-center gap-1.5 ${
                        pending ? "text-gray-400 cursor-not-allowed" : "text-gray-700"
                      }`}
                    >
                      Diploma
                      {pending && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          Active
                        </Badge>
                      )}
                    </FormLabel>
                  </FormItem>
                );
              }}
            />
          </div>
          {form.formState.errors.request_form137 && (
            <p className="text-sm text-red-500">
              {form.formState.errors.request_form137.message}
            </p>
          )}
        </div>

        {/* Purpose */}
        <FormField
          control={form.control}
          name="purpose"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-gray-700">Purpose *</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="State the purpose (e.g., college application, employment requirements...)"
                  {...field}
                  className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 min-h-[80px] resize-none"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* File attachment */}
        <div className="space-y-1.5">
          <FormLabel className="text-gray-700">
            Signed Authorization Document *
          </FormLabel>
          <p className="text-xs text-gray-500">
            Upload a document signed by the school principal authorizing this request.
          </p>
          <FileUploadZone
            file={attachmentFile}
            onChange={(f) => {
              setAttachmentFile(f);
              if (f) setAttachmentError(undefined);
            }}
            error={attachmentError}
          />
        </div>

        <Button
          type="submit"
          disabled={submitting || !lrnVerified}
          className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Submitting...
            </>
          ) : (
            "Submit Request"
          )}
        </Button>
      </form>
    </Form>
  );
}
