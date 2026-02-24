"use client";

import { PublicPageBackground } from "@/components/PublicPageBackground";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { generateForm137Print } from "@/lib/pdf/generateForm137";
import { getDiplomaSignedUrl } from "@/lib/requests/actions";
import { supabase } from "@/lib/supabase/client";
import { DocumentRequestType } from "@/types/database";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  FileText,
  GraduationCap,
  Loader2,
  Printer,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";

const FormSchema = z
  .object({
    student_lrn: z.string().min(1, "LRN is required"),
    request_form137: z.boolean(),
    request_diploma: z.boolean(),
    requestor_name: z.string().min(1, "Requestor name is required"),
    requestor_contact: z.string().min(1, "Requestor contact is required"),
    requestor_relationship: z.string().min(1, "Relationship is required"),
    purpose: z.string().min(1, "Purpose is required"),
  })
  .refine((d) => d.request_form137 || d.request_diploma, {
    message: "Select at least one document (Form 137 or Diploma)",
    path: ["request_form137"],
  });

type FormType = z.infer<typeof FormSchema>;

interface RequestRow {
  id: string;
  student_lrn: string;
  student_id: string | null;
  request_type: DocumentRequestType;
  requestor_name: string;
  status: string;
  created_at: string;
  student?: { diploma_file_path?: string | null };
}

export default function Page() {
  const [lrn, setLrn] = useState("");
  const [studentFound, setStudentFound] = useState(false);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [printingId, setPrintingId] = useState<string | null>(null);

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      student_lrn: "",
      request_form137: false,
      request_diploma: false,
      requestor_name: "",
      requestor_contact: "",
      requestor_relationship: "",
      purpose: "",
    },
  });

  const handleLRNCheck = async (value: string) => {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) {
      setStudentFound(false);
      setRequests([]);
      return;
    }

    const { data, error } = await supabase
      .from("sms_students")
      .select("id, first_name, last_name")
      .eq("lrn", trimmed)
      .maybeSingle();

    if (error) {
      setStudentFound(false);
      toast.error("Error checking LRN. Please try again.");
      return;
    }

    if (data) {
      setStudentFound(true);
      setLrn(trimmed);
      form.setValue("student_lrn", trimmed);
      form.clearErrors("student_lrn");
      toast.success(`Student found: ${data.last_name}, ${data.first_name}`);
    } else {
      setStudentFound(false);
      setLrn("");
      setRequests([]);
      form.setError("student_lrn", { message: "Student not found. Please check the LRN." });
    }
  };

  const fetchRequests = async () => {
    if (!lrn.trim()) return;
    setLoadingRequests(true);
    try {
      const { data } = await supabase
        .from("sms_form_requests")
        .select("*, student:sms_students(diploma_file_path)")
        .eq("student_lrn", lrn.trim())
        .order("created_at", { ascending: false });
      setRequests((data as RequestRow[]) ?? []);
    } catch {
      toast.error("Failed to load requests");
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    if (studentFound && lrn) {
      fetchRequests();
    } else {
      setRequests([]);
    }
  }, [studentFound, lrn]);

  const hasPendingForType = (requestType: DocumentRequestType) =>
    requests.some(
      (r) =>
        r.request_type === requestType &&
        (r.status === "pending" || r.status === "approved"),
    );

  const onSubmit = async (data: FormType) => {
    if (!studentFound) {
      toast.error("Please verify the LRN first");
      return;
    }

    const types: DocumentRequestType[] = [];
    if (data.request_form137) types.push("form137");
    if (data.request_diploma) types.push("diploma");
    if (types.length === 0) {
      toast.error("Select at least one document");
      return;
    }

    const typesToSubmit = types.filter((t) => !hasPendingForType(t));
    if (typesToSubmit.length === 0) {
      const dupes = types.map((t) =>
        t === "form137" ? "Form 137" : "Diploma",
      );
      toast.error(
        `You already have a pending request for ${dupes.join(" and ")}. Please wait for it to be processed.`,
      );
      return;
    }
    if (typesToSubmit.length < types.length) {
      const skipped = types
        .filter((t) => !typesToSubmit.includes(t))
        .map((t) => (t === "form137" ? "Form 137" : "Diploma"));
      toast(
        `Skipped ${skipped.join(" and ")}: you already have a pending request.`,
      );
    }

    setSubmitting(true);
    try {
      const { data: student } = await supabase
        .from("sms_students")
        .select("id, school_id")
        .eq("lrn", data.student_lrn.trim())
        .maybeSingle();

      if (!student) {
        toast.error("Student not found. Please verify the LRN again.");
        setSubmitting(false);
        return;
      }

      const baseRequest = {
        student_lrn: data.student_lrn.trim(),
        student_id: student.id,
        requestor_name: data.requestor_name.trim(),
        requestor_contact: data.requestor_contact.trim(),
        requestor_relationship: data.requestor_relationship.trim(),
        purpose: data.purpose.trim(),
        status: "pending" as const,
        requested_at: new Date().toISOString(),
        ...(student.school_id != null && { school_id: student.school_id }),
      };

      const inserts = typesToSubmit.map((request_type) => ({
        ...baseRequest,
        request_type,
      }));

      const { error } = await supabase
        .from("sms_form_requests")
        .insert(inserts);

      if (error) throw error;

      toast.success("Request(s) submitted successfully!");
      form.reset({
        ...form.getValues(),
        request_form137: false,
        request_diploma: false,
        requestor_name: "",
        requestor_contact: "",
        requestor_relationship: "",
        purpose: "",
      });
      fetchRequests();
    } catch (err) {
      console.error("Submission error:", err);
      toast.error("Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = async (req: RequestRow) => {
    if (req.status !== "approved" && req.status !== "completed") return;

    setPrintingId(req.id);

    try {
      if (req.request_type === "form137") {
        if (!req.student_id) {
          toast.error("Student record not found");
          return;
        }
        await generateForm137Print(req.student_id);
        toast.success("Form 137 ready to print");
      } else {
        const result = await getDiplomaSignedUrl(req.id, req.student_lrn);
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        const w = window.open(result.url, "_blank");
        if (w) {
          w.onload = () => w.print();
        }
        toast.success("Diploma ready to print");
      }
    } catch (err) {
      toast.error("Failed to print");
    } finally {
      setPrintingId(null);
    }
  };

  const canPrint = (req: RequestRow) =>
    req.status === "approved" || req.status === "completed";

  const getStatusVariant = (
    status: string,
  ): "green" | "red" | "orange" | "outline" => {
    if (status === "approved" || status === "completed") return "green";
    if (status === "rejected") return "red";
    return "orange";
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 py-10 relative">
      <PublicPageBackground />
      <div className="w-full max-w-2xl relative z-10 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <FileText className="h-6 w-6 text-blue-300" />
              Document Requests
            </h1>
            <p className="mt-1.5 text-sm text-white/85">
              Request Form 137 or Diploma. Verify your LRN to view status and
              submit new requests.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-white/80 hover:text-white transition-colors shrink-0"
          >
            ← Back
          </Link>
        </div>

        {/* LRN Verification Card */}
        <Card className="rounded-2xl bg-white/25 backdrop-blur-xl border-white/30 shadow-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-white flex items-center gap-2 text-lg">
              <Search className="h-5 w-5 text-blue-300" />
              Verify Your Identity
            </CardTitle>
            <CardDescription className="text-white/85">
              Enter your Learner Reference Number (LRN) to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <FormField
                control={form.control}
                name="student_lrn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/90 sr-only">
                      Learner Reference Number
                    </FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          placeholder="Enter your LRN"
                          className="bg-white/20 border-white/30 text-white placeholder:text-white/60 h-11"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            if (!e.target.value.trim()) {
                              setStudentFound(false);
                              setLrn("");
                              setRequests([]);
                            }
                          }}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        onClick={() => handleLRNCheck(field.value)}
                        className="shrink-0 bg-white/25 hover:bg-white/35 text-white border-white/40 h-11 px-5"
                      >
                        Verify
                      </Button>
                    </div>
                    {studentFound && (
                      <p className="text-sm text-emerald-400 flex items-center gap-1.5 mt-2">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium">
                          ✓
                        </span>
                        Student verified
                      </p>
                    )}
                    <FormMessage className="mt-1.5 text-red-300 font-medium" />
                  </FormItem>
                )}
              />
            </Form>
          </CardContent>
        </Card>

        {studentFound && (
          <>
            {/* Your Requests Section */}
            <Card className="rounded-2xl bg-white/25 backdrop-blur-xl border-white/30 shadow-xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-white flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5 text-blue-300" />
                  Your Requests
                </CardTitle>
                <CardDescription className="text-white/85">
                  Track the status of your document requests
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingRequests ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-white/80">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading requests...
                  </div>
                ) : requests.length === 0 ? (
                  <div className="py-8 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-white/70 mb-3">
                      <GraduationCap className="h-6 w-6" />
                    </div>
                    <p className="text-sm text-white/85">
                      No requests yet. Submit a new request below.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {requests.map((req) => (
                      <div
                        key={req.id}
                        className="flex items-center justify-between gap-4 p-4 rounded-xl bg-white/15 border border-white/20 hover:bg-white/20 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/20 text-white/90">
                            {req.request_type === "form137" ? (
                              <FileText className="h-5 w-5" />
                            ) : (
                              <GraduationCap className="h-5 w-5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-white truncate">
                              {req.request_type === "form137"
                                ? "Form 137"
                                : "Diploma"}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <Badge
                                variant={getStatusVariant(req.status)}
                                className="text-xs capitalize border-0"
                              >
                                {req.status}
                              </Badge>
                              <span className="text-xs text-white/70">
                                {new Date(req.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        {canPrint(req) && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={printingId === req.id}
                            onClick={() => handlePrint(req)}
                            className="shrink-0 border-white/40 hover:bg-white/25 text-white"
                          >
                            {printingId === req.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Printer className="h-4 w-4" />
                            )}
                            Print
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Separator className="bg-white/20" />

            {/* Submit New Request Section */}
            <Card className="rounded-2xl bg-white/25 backdrop-blur-xl border-white/30 shadow-xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-white text-lg">
                  Submit New Request
                </CardTitle>
                <CardDescription className="text-white/85">
                  Request Form 137 or Diploma. Fill in your details below.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-5"
                  >
                    <div className="space-y-3">
                      <FormLabel className="text-white/90">
                        Documents *
                      </FormLabel>
                      <div className="flex gap-6">
                        <FormField
                          control={form.control}
                          name="request_form137"
                          render={({ field }) => {
                            const hasPending = hasPendingForType("form137");
                            return (
                              <FormItem className="flex items-center gap-2.5 space-y-0">
                                <FormControl>
                                  <input
                                    type="checkbox"
                                    checked={field.value}
                                    onChange={field.onChange}
                                    disabled={hasPending}
                                    className="h-4 w-4 rounded border-white/30 bg-white/10 text-blue-400 focus:ring-blue-400/50"
                                  />
                                </FormControl>
                                <FormLabel
                                  className={`font-normal cursor-pointer flex items-center gap-1.5 ${
                                    hasPending
                                      ? "text-white/50 cursor-not-allowed"
                                      : "text-white/90"
                                  }`}
                                >
                                  Form 137
                                  {hasPending && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] px-1.5 py-0 border-white/20 text-white/60"
                                    >
                                      Pending
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
                            const hasPending = hasPendingForType("diploma");
                            return (
                              <FormItem className="flex items-center gap-2.5 space-y-0">
                                <FormControl>
                                  <input
                                    type="checkbox"
                                    checked={field.value}
                                    onChange={field.onChange}
                                    disabled={hasPending}
                                    className="h-4 w-4 rounded border-white/30 bg-white/10 text-blue-400 focus:ring-blue-400/50"
                                  />
                                </FormControl>
                                <FormLabel
                                  className={`font-normal cursor-pointer flex items-center gap-1.5 ${
                                    hasPending
                                      ? "text-white/50 cursor-not-allowed"
                                      : "text-white/90"
                                  }`}
                                >
                                  Diploma
                                  {hasPending && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] px-1.5 py-0 border-white/20 text-white/60"
                                    >
                                      Pending
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

                    <div className="grid sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="requestor_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white/90">
                              Requestor Name *
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Full name"
                                {...field}
                                className="bg-white/20 border-white/30 text-white placeholder:text-white/60"
                              />
                            </FormControl>
                            <FormMessage className="mt-1.5 text-red-300 font-medium" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="requestor_contact"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white/90">
                              Contact Number *
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder="09XX XXX XXXX"
                                {...field}
                                className="bg-white/20 border-white/30 text-white placeholder:text-white/60"
                              />
                            </FormControl>
                            <FormMessage className="mt-1.5 text-red-300 font-medium" />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="requestor_relationship"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/90">
                            Relationship to Student *
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., Parent, Guardian, Self"
                              {...field}
                              className="bg-white/20 border-white/30 text-white placeholder:text-white/60"
                            />
                          </FormControl>
                          <FormMessage className="mt-1.5 text-red-300 font-medium" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="purpose"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/90">
                            Purpose *
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="State the purpose of the request (e.g., college application, employment requirements...)"
                              {...field}
                              className="bg-white/20 border-white/30 text-white placeholder:text-white/60 min-h-[80px] resize-none"
                            />
                          </FormControl>
                          <FormMessage className="mt-1.5 text-red-300 font-medium" />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      disabled={submitting || !studentFound}
                      className="w-full h-11 bg-white/25 hover:bg-white/35 text-white border-white/40 font-medium"
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
          </>
        )}
      </div>
    </div>
  );
}
