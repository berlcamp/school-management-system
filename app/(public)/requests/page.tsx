"use client";

import { PublicPageBackground } from "@/components/PublicPageBackground";
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
import { Textarea } from "@/components/ui/textarea";
import { generateForm137Print } from "@/lib/pdf/generateForm137";
import { getDiplomaSignedUrl } from "@/lib/requests/actions";
import { supabase } from "@/lib/supabase/client";
import { DocumentRequestType } from "@/types/database";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, GraduationCap, Loader2, Printer } from "lucide-react";
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

type TabMode = "submit" | "check";

export default function Page() {
  const [lrn, setLrn] = useState("");
  const [studentFound, setStudentFound] = useState(false);
  const [tabMode, setTabMode] = useState<TabMode>("check");
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
      toast.success(`Student found: ${data.last_name}, ${data.first_name}`);
    } else {
      setStudentFound(false);
      setLrn("");
      setRequests([]);
      toast.error("Student not found. Please check the LRN.");
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <PublicPageBackground />
      <div className="w-full max-w-2xl relative z-10 rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 p-6 sm:p-8 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-300" />
              Document Requests
            </h1>
            <p className="mt-1 text-sm text-white/70">
              Request Form 137 or Diploma. Enter your LRN to get started.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-white/80 hover:text-white transition-colors"
          >
            ← Back
          </Link>
        </div>
        <div className="space-y-6">
          <Form {...form}>
            {/* LRN Input */}
            <FormField
              control={form.control}
              name="student_lrn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/90">
                    Learner Reference Number (LRN)
                  </FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input
                        placeholder="Enter LRN"
                        className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          if (tabMode === "check" && !e.target.value.trim()) {
                            setStudentFound(false);
                            setLrn("");
                            setRequests([]);
                          }
                        }}
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleLRNCheck(field.value)}
                      className="border-white/30 hover:bg-white/10"
                    >
                      Verify
                    </Button>
                  </div>
                  {studentFound && (
                    <p className="text-sm text-emerald-300">
                      ✓ Student verified
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Tabs */}
            <div className="flex gap-2 border-b border-white/20">
              <button
                type="button"
                onClick={() => setTabMode("check")}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tabMode === "check"
                    ? "border-blue-300 text-blue-300"
                    : "border-transparent text-white/60 hover:text-white"
                }`}
              >
                Check Status
              </button>
              <button
                type="button"
                onClick={() => {
                  setTabMode("submit");
                  if (studentFound) form.setValue("student_lrn", lrn);
                }}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tabMode === "submit"
                    ? "border-blue-300 text-blue-300"
                    : "border-transparent text-white/60 hover:text-white"
                }`}
              >
                Submit Request
              </button>
            </div>

            {tabMode === "check" && (
              <div>
                {!studentFound ? (
                  <p className="text-sm text-white/60">
                    Enter and verify your LRN to see your requests.
                  </p>
                ) : loadingRequests ? (
                  <div className="flex items-center gap-2 text-sm text-white/60">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </div>
                ) : requests.length === 0 ? (
                  <p className="text-sm text-white/60">
                    No requests found for this LRN.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {requests.map((req) => (
                      <div
                        key={req.id}
                        className="flex items-center justify-between p-3 border border-white/20 rounded-lg bg-white/5"
                      >
                        <div className="flex items-center gap-3">
                          {req.request_type === "form137" ? (
                            <FileText className="h-5 w-5 text-white/60" />
                          ) : (
                            <GraduationCap className="h-5 w-5 text-white/60" />
                          )}
                          <div>
                            <p className="font-medium capitalize text-white">
                              {req.request_type === "form137"
                                ? "Form 137"
                                : "Diploma"}
                            </p>
                            <p className="text-xs text-white/60">
                              {new Date(req.created_at).toLocaleDateString()} •{" "}
                              <span
                                className={
                                  req.status === "approved" ||
                                  req.status === "completed"
                                    ? "text-emerald-300"
                                    : req.status === "rejected"
                                      ? "text-red-300"
                                      : "text-amber-300"
                                }
                              >
                                {req.status}
                              </span>
                            </p>
                          </div>
                        </div>
                        {canPrint(req) && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={printingId === req.id}
                            onClick={() => handlePrint(req)}
                            className="border-white/30 hover:bg-white/10"
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
              </div>
            )}

            {tabMode === "submit" && (
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <div>
                  <FormLabel className="text-white/90">Request for *</FormLabel>
                  <div className="flex gap-6 mt-2">
                    <FormField
                      control={form.control}
                      name="request_form137"
                      render={({ field }) => {
                        const hasPending = hasPendingForType("form137");
                        return (
                          <FormItem className="flex items-center gap-2 space-y-0">
                            <FormControl>
                              <input
                                type="checkbox"
                                checked={field.value}
                                onChange={field.onChange}
                                disabled={hasPending}
                                className="h-4 w-4"
                              />
                            </FormControl>
                            <FormLabel
                              className={`font-normal ${hasPending ? "cursor-not-allowed text-white/50" : "cursor-pointer text-white/90"}`}
                            >
                              Form 137
                              {hasPending && (
                                <span className="text-xs ml-1">(pending)</span>
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
                          <FormItem className="flex items-center gap-2 space-y-0">
                            <FormControl>
                              <input
                                type="checkbox"
                                checked={field.value}
                                onChange={field.onChange}
                                disabled={hasPending}
                                className="h-4 w-4"
                              />
                            </FormControl>
                            <FormLabel
                              className={`font-normal ${hasPending ? "cursor-not-allowed text-white/50" : "cursor-pointer text-white/90"}`}
                            >
                              Diploma
                              {hasPending && (
                                <span className="text-xs ml-1">(pending)</span>
                              )}
                            </FormLabel>
                          </FormItem>
                        );
                      }}
                    />
                  </div>
                  {form.formState.errors.request_form137 && (
                    <p className="text-sm text-red-300 mt-1">
                      {form.formState.errors.request_form137.message}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
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
                            className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                          />
                        </FormControl>
                        <FormMessage />
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
                            placeholder="Contact number"
                            {...field}
                            className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                          />
                        </FormControl>
                        <FormMessage />
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
                          className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="purpose"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white/90">Purpose *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="State the purpose of the request..."
                          {...field}
                          className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={submitting || !studentFound}
                  className="w-full bg-white/20 hover:bg-white/30 text-white border-white/30"
                >
                  {submitting ? "Submitting..." : "Submit Request"}
                </Button>
              </form>
            )}
          </Form>
        </div>
      </div>
    </div>
  );
}
