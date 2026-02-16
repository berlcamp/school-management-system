"use client";

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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";

const FormSchema = z.object({
  student_lrn: z.string().min(1, "LRN is required"),
  requestor_name: z.string().min(1, "Requestor name is required"),
  requestor_contact: z.string().min(1, "Requestor contact is required"),
  requestor_relationship: z.string().min(1, "Relationship is required"),
  purpose: z.string().min(1, "Purpose is required"),
});

type FormType = z.infer<typeof FormSchema>;

export default function Page() {
  const [submitting, setSubmitting] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [studentFound, setStudentFound] = useState(false);

  const form = useForm<FormType>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      student_lrn: "",
      requestor_name: "",
      requestor_contact: "",
      requestor_relationship: "",
      purpose: "",
    },
  });

  const handleLRNCheck = async (lrn: string) => {
    if (!lrn) {
      setStudentFound(false);
      return;
    }

    const { data, error } = await supabase
      .from("sms_students")
      .select("id, first_name, last_name")
      .eq("lrn", lrn.trim())
      .maybeSingle();

    if (error) {
      console.error("LRN check error:", error);
      setStudentFound(false);
      toast.error("Error checking LRN. Please try again.");
      return;
    }

    if (data) {
      setStudentFound(true);
      toast.success(`Student found: ${data.last_name}, ${data.first_name}`);
    } else {
      setStudentFound(false);
      toast.error("Student not found. Please check the LRN.");
    }
  };

  const onSubmit = async (data: FormType) => {
    if (!studentFound) {
      toast.error("Please verify the LRN first");
      return;
    }

    setSubmitting(true);
    try {
      const { data: student, error: studentError } = await supabase
        .from("sms_students")
        .select("id, school_id")
        .eq("lrn", data.student_lrn.trim())
        .maybeSingle();

      if (studentError) {
        throw studentError;
      }

      if (!student) {
        toast.error("Student not found. Please verify the LRN again.");
        setSubmitting(false);
        return;
      }

      const requestData = {
        student_lrn: data.student_lrn.trim(),
        student_id: student.id,
        requestor_name: data.requestor_name.trim(),
        ...(student.school_id != null && { school_id: student.school_id }),
        requestor_contact: data.requestor_contact.trim(),
        requestor_relationship: data.requestor_relationship.trim(),
        purpose: data.purpose.trim(),
        status: "pending" as const,
        requested_at: new Date().toISOString(),
      };

      const { data: inserted, error } = await supabase
        .from("sms_form137_requests")
        .insert([requestData])
        .select()
        .single();

      if (error) throw error;

      if (!inserted) {
        throw new Error("Failed to create request");
      }

      setRequestId(inserted.id);
      toast.success("Request submitted successfully!");
      form.reset();
      setStudentFound(false);
    } catch (err) {
      console.error("Submission error:", err);
      toast.error("Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  if (requestId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Request Submitted
            </CardTitle>
            <CardDescription>
              Your Form 137 request has been submitted successfully
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Request ID:</p>
              <p className="font-mono font-medium">{requestId}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Please save this Request ID. You can use it to check the status of
              your request.
            </p>
            <Button
              onClick={() => {
                setRequestId(null);
                setStudentFound(false);
              }}
              className="w-full"
            >
              Submit Another Request
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Request Form 137 (Permanent Record)
          </CardTitle>
          <CardDescription>
            Fill out the form below to request your Form 137
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="student_lrn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Learner Reference Number (LRN) *</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          placeholder="Enter LRN"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            if (e.target.value) {
                              handleLRNCheck(e.target.value);
                            }
                          }}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        onClick={() => handleLRNCheck(field.value)}
                        variant="outline"
                      >
                        Verify
                      </Button>
                    </div>
                    {studentFound && (
                      <p className="text-sm text-green-600">
                        ✓ Student verified
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="requestor_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Requestor Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Full name" {...field} />
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
                      <FormLabel>Contact Number *</FormLabel>
                      <FormControl>
                        <Input placeholder="Contact number" {...field} />
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
                    <FormLabel>Relationship to Student *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Parent, Guardian, Self"
                        {...field}
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
                    <FormLabel>Purpose *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="State the purpose of the request..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={submitting || !studentFound}
                className="w-full"
              >
                {submitting ? "Submitting..." : "Submit Request"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
