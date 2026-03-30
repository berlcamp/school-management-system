"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { submitPublicRequest } from "@/lib/requests/actions";
import { supabase } from "@/lib/supabase/client";
import { DocumentRequestType } from "@/types/database";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, ClipboardCopy, FilePlus, Loader2, Search } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";
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
    student_lrn: z.string().min(1, "LRN is required"),
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
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
    const lrn = form.getValues("student_lrn").trim();
    if (!lrn) {
      form.setError("student_lrn", { message: "LRN is required" });
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

      // Load existing requests to prevent duplicates
      const { data: reqs } = await supabase
        .from("sms_requests")
        .select("request_type, status")
        .eq("student_lrn", lrn);
      setExistingRequests((reqs as ExistingRequest[]) ?? []);
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

  const handleCopy = () => {
    if (!trackingNumber) return;
    navigator.clipboard.writeText(trackingNumber).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
    fd.append("student_lrn", data.student_lrn.trim());
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
      setTrackingNumber(result.tracking_number);
      form.reset();
      setAttachmentFile(null);
      setLrnVerified(false);
      setStudentId(null);
      setSchoolId(null);
      setExistingRequests([]);
    }

    setSubmitting(false);
  };

  // Success state
  if (trackingNumber) {
    return (
      <Card className="rounded-2xl bg-white/20 backdrop-blur-xl border-white/30 shadow-2xl">
        <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Request Submitted!</h2>
            <p className="text-sm text-white/80 mt-1">
              Save your tracking number to check your request status.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white/15 border border-white/30 rounded-xl px-5 py-3">
            <span className="font-mono text-lg font-semibold text-white tracking-wider">
              {trackingNumber}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="text-white/60 hover:text-white transition-colors"
            >
              {copied ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <ClipboardCopy className="h-4 w-4" />
              )}
            </button>
          </div>
          <Button
            type="button"
            onClick={() => setTrackingNumber(null)}
            className="bg-white/25 hover:bg-white/35 text-white border-white/35 gap-2 mt-2"
          >
            <FilePlus className="h-4 w-4" />
            Submit Another Request
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl bg-white/20 backdrop-blur-xl border-white/30 shadow-2xl">
      <CardHeader className="pb-4">
        <CardTitle className="text-white text-lg">Submit a Request</CardTitle>
        <CardDescription className="text-white/90">
          Fill in the form below. A signed authorization document is required.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Requester type */}
            <FormField
              control={form.control}
              name="requester_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">Requester Type *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="bg-white/25 border-white/35 text-white h-10">
                        <SelectValue placeholder="Select type..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="student">Student</SelectItem>
                      <SelectItem value="parent">Parent / Guardian</SelectItem>
                      <SelectItem value="school">School / Institution</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-red-300" />
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
                    <FormLabel className="text-white">Full Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Requester's full name"
                        {...field}
                        className="bg-white/25 border-white/35 text-white placeholder:text-white/60"
                      />
                    </FormControl>
                    <FormMessage className="text-red-300" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="requester_contact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Contact Number *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="09XX XXX XXXX"
                        {...field}
                        className="bg-white/25 border-white/35 text-white placeholder:text-white/60"
                      />
                    </FormControl>
                    <FormMessage className="text-red-300" />
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
                    <FormLabel className="text-white">Email (optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="email@example.com"
                        type="email"
                        {...field}
                        className="bg-white/25 border-white/35 text-white placeholder:text-white/60"
                      />
                    </FormControl>
                    <FormMessage className="text-red-300" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="requester_relationship"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Relationship to Student *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Parent, Guardian, Self"
                        {...field}
                        className="bg-white/25 border-white/35 text-white placeholder:text-white/60"
                      />
                    </FormControl>
                    <FormMessage className="text-red-300" />
                  </FormItem>
                )}
              />
            </div>

            {/* Student info */}
            <div className="space-y-3 p-4 rounded-xl bg-white/10 border border-white/20">
              <p className="text-sm font-semibold text-white/90">
                Student Information
              </p>

              <FormField
                control={form.control}
                name="student_lrn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">
                      Learner Reference Number (LRN) *
                    </FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          placeholder="Enter LRN"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            if (!e.target.value.trim()) {
                              setLrnVerified(false);
                              setStudentId(null);
                              setSchoolId(null);
                              setExistingRequests([]);
                            }
                          }}
                          className="bg-white/25 border-white/35 text-white placeholder:text-white/60 h-10"
                        />
                      </FormControl>
                      <Button
                        type="button"
                        onClick={handleLrnVerify}
                        disabled={verifyingLrn}
                        className="shrink-0 bg-white/30 hover:bg-white/40 text-white border-white/40 h-10 px-4"
                      >
                        {verifyingLrn ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {lrnVerified && (
                      <p className="text-xs text-emerald-400 flex items-center gap-1 mt-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Student verified
                      </p>
                    )}
                    <FormMessage className="text-red-300" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="student_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Student Full Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Last name, First name"
                        {...field}
                        readOnly={lrnVerified}
                        className="bg-white/25 border-white/35 text-white placeholder:text-white/60"
                      />
                    </FormControl>
                    <FormMessage className="text-red-300" />
                  </FormItem>
                )}
              />

              <div className="grid sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="last_school_attended"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white">
                        Last School Attended
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="School name"
                          {...field}
                          className="bg-white/25 border-white/35 text-white placeholder:text-white/60"
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
                      <FormLabel className="text-white">Year Graduated</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., 2023"
                          {...field}
                          className="bg-white/25 border-white/35 text-white placeholder:text-white/60"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Documents */}
            <div className="space-y-3">
              <FormLabel className="text-white">Documents Requested *</FormLabel>
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
                            className="h-4 w-4 rounded border-white/35 bg-white/15 text-blue-400"
                          />
                        </FormControl>
                        <FormLabel
                          className={`font-normal cursor-pointer flex items-center gap-1.5 ${
                            pending ? "text-white/50 cursor-not-allowed" : "text-white"
                          }`}
                        >
                          School Form 10
                          {pending && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 border-white/25 text-white/70"
                            >
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
                            className="h-4 w-4 rounded border-white/35 bg-white/15 text-blue-400"
                          />
                        </FormControl>
                        <FormLabel
                          className={`font-normal cursor-pointer flex items-center gap-1.5 ${
                            pending ? "text-white/50 cursor-not-allowed" : "text-white"
                          }`}
                        >
                          Diploma
                          {pending && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 border-white/25 text-white/70"
                            >
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
                <p className="text-sm text-red-300">
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
                  <FormLabel className="text-white">Purpose *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="State the purpose (e.g., college application, employment requirements...)"
                      {...field}
                      className="bg-white/25 border-white/35 text-white placeholder:text-white/60 min-h-[80px] resize-none"
                    />
                  </FormControl>
                  <FormMessage className="text-red-300" />
                </FormItem>
              )}
            />

            {/* File attachment */}
            <div className="space-y-1.5">
              <FormLabel className="text-white">
                Signed Authorization Document *
              </FormLabel>
              <p className="text-xs text-white/70">
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
              className="w-full h-11 bg-white/30 hover:bg-white/40 text-white border-white/40 font-medium"
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
      </CardContent>
    </Card>
  );
}
