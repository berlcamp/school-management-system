"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateForm137Print } from "@/lib/pdf/generateForm137";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { DocumentRequestType, Form137Request, Student } from "@/types/database";
import {
  CheckCircle2,
  Download,
  FileText,
  GraduationCap,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface RequestRow extends Form137Request {
  student: Student | null;
}

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const fetchRequests = useCallback(async () => {
    let query = supabase
      .from("sms_form_requests")
      .select("*, student:sms_students(*)")
      .order("created_at", { ascending: false });

    if (user?.school_id != null) {
      query = query.eq("school_id", user.school_id);
    }
    if (statusFilter && statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }
    if (typeFilter && typeFilter !== "all") {
      query = query.eq("request_type", typeFilter as DocumentRequestType);
    }

    const { data } = await query;
    if (data) {
      setRequests(data as RequestRow[]);
    }
  }, [statusFilter, typeFilter, user?.school_id]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApprove = async (requestId: string) => {
    if (!user?.system_user_id) return;

    try {
      const { error } = await supabase
        .from("sms_form_requests")
        .update({
          status: "approved",
          approved_by: user.system_user_id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (error) throw error;

      toast.success("Request approved!");
      fetchRequests();
    } catch (err) {
      toast.error("Failed to approve request");
    }
  };

  const handleReject = async (requestId: string) => {
    if (!user?.system_user_id) return;

    try {
      const { error } = await supabase
        .from("sms_form_requests")
        .update({
          status: "rejected",
          approved_by: user.system_user_id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (error) throw error;

      toast.success("Request rejected!");
      fetchRequests();
    } catch (err) {
      toast.error("Failed to reject request");
    }
  };

  const handleDownload = async (request: RequestRow) => {
    const requestType = (request.request_type ??
      "form137") as DocumentRequestType;

    if (requestType === "form137") {
      if (!request.student_id) {
        toast.error("Student ID not found. Cannot generate Form 137.");
        return;
      }
      try {
        toast.loading("Generating Form 137...", { id: "dl" });
        await generateForm137Print(request.student_id);
        await supabase
          .from("sms_form_requests")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", request.id);
        toast.success("Form 137 generated successfully!", { id: "dl" });
        fetchRequests();
      } catch (err) {
        console.error("Error downloading Form 137:", err);
        toast.error("Failed to generate Form 137", { id: "dl" });
      }
      return;
    }

    // Diploma
    const diplomaPath = request.student?.diploma_file_path;
    if (!diplomaPath) {
      toast.error("Upload diploma first in the student profile.");
      return;
    }
    try {
      toast.loading("Opening diploma...", { id: "dl" });
      const { data, error } = await supabase.storage
        .from("diplomas")
        .createSignedUrl(diplomaPath, 3600);
      if (error || !data?.signedUrl) {
        throw new Error("Failed to generate link");
      }
      window.open(data.signedUrl, "_blank");
      await supabase
        .from("sms_form_requests")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", request.id);
      toast.success("Diploma opened successfully!", { id: "dl" });
      fetchRequests();
    } catch (err) {
      toast.error("Failed to open diploma", { id: "dl" });
    }
  };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Requests
        </h1>
        <div className="app__title_actions flex gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="form137">Form 137</SelectItem>
              <SelectItem value="diploma">Diploma</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="app__content">
        <div className="app__table_container">
          <div className="app__table_wrapper">
            <table className="app__table">
              <thead className="app__table_thead">
                <tr>
                  <th className="app__table_th">Type</th>
                  <th className="app__table_th">Student</th>
                  <th className="app__table_th">Requestor</th>
                  <th className="app__table_th">Purpose</th>
                  <th className="app__table_th">Contact</th>
                  <th className="app__table_th">Status</th>
                  <th className="app__table_th_right">Actions</th>
                </tr>
              </thead>
              <tbody className="app__table_tbody">
                {requests.map((request) => {
                  const studentName = request.student
                    ? `${request.student.last_name}, ${request.student.first_name}`
                    : `LRN: ${request.student_lrn}`;
                  return (
                    <tr key={request.id} className="app__table_tr">
                      <td className="app__table_td">
                        <div className="flex items-center gap-2">
                          {(request.request_type ?? "form137") === "form137" ? (
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <GraduationCap className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="capitalize">
                            {request.request_type === "diploma"
                              ? "Diploma"
                              : "Form 137"}
                          </span>
                        </div>
                      </td>
                      <td className="app__table_td">
                        <div className="app__table_cell_text">
                          <div className="app__table_cell_title">
                            {studentName}
                          </div>
                          {request.student && (
                            <div className="app__table_cell_subtitle">
                              LRN: {request.student.lrn}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="app__table_td">
                        <div className="app__table_cell_text">
                          <div className="app__table_cell_title">
                            {request.requestor_name}
                          </div>
                          <div className="app__table_cell_subtitle">
                            {request.requestor_relationship}
                          </div>
                        </div>
                      </td>
                      <td className="app__table_td">
                        <div className="app__table_cell_text">
                          <div className="app__table_cell_title">
                            {request.purpose}
                          </div>
                        </div>
                      </td>
                      <td className="app__table_td">
                        <div className="app__table_cell_text">
                          <div className="app__table_cell_title">
                            {request.requestor_contact}
                          </div>
                        </div>
                      </td>
                      <td className="app__table_td">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            request.status === "approved"
                              ? "bg-green-100 text-green-800"
                              : request.status === "rejected"
                                ? "bg-red-100 text-red-800"
                                : request.status === "completed"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {request.status.charAt(0).toUpperCase() +
                            request.status.slice(1)}
                        </span>
                      </td>
                      <td className="app__table_td_actions">
                        <div className="app__table_action_container">
                          {request.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleApprove(request.id)}
                                className="mr-2"
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleReject(request.id)}
                                className="mr-2"
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            onClick={() => handleDownload(request)}
                            variant="default"
                            className="flex items-center gap-2"
                          >
                            <Download className="h-4 w-4" />
                            Download
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {requests.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No requests found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
