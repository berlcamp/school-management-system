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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateForm137Print } from "@/lib/pdf/generateForm137";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { Download, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const [requests, setRequests] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    fetchRequests();
  }, [statusFilter]);

  const fetchRequests = async () => {
    let query = supabase
      .from("sms_form137_requests")
      .select("*, student:sms_students(*)")
      .order("created_at", { ascending: false });

    if (statusFilter && statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data } = await query;
    if (data) {
      setRequests(data);
    }
  };

  const handleApprove = async (requestId: string) => {
    if (!user?.system_user_id) return;

    try {
      const { error } = await supabase
        .from("sms_form137_requests")
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
        .from("sms_form137_requests")
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

  const handleDownload = async (request: any) => {
    if (!request.student_id) {
      toast.error("Student ID not found. Cannot generate Form 137.");
      return;
    }

    try {
      toast.loading("Generating Form 137...", { id: "form137" });
      await generateForm137Print(request.student_id);

      // Mark request as completed
      await supabase
        .from("sms_form137_requests")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", request.id);

      toast.success("Form 137 generated successfully!", { id: "form137" });
      fetchRequests();
    } catch (err) {
      console.error("Error downloading Form 137:", err);
      toast.error("Failed to generate Form 137", { id: "form137" });
    }
  };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Form 137 Requests
        </h1>
        <div className="app__title_actions">
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
        <div className="grid gap-4">
          {requests.map((request) => (
            <Card key={request.id}>
              <CardHeader>
                <CardTitle className="text-lg">
                  {request.student
                    ? `${request.student.last_name}, ${request.student.first_name}`
                    : `LRN: ${request.student_lrn}`}
                </CardTitle>
                <CardDescription>
                  Requested by: {request.requestor_name} (
                  {request.requestor_relationship})
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  <div>
                    <span className="text-sm font-medium">Purpose: </span>
                    <span className="text-sm">{request.purpose}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium">Contact: </span>
                    <span className="text-sm">{request.requestor_contact}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium">Status: </span>
                    <span
                      className={`text-sm font-medium ${
                        request.status === "approved"
                          ? "text-green-600"
                          : request.status === "rejected"
                            ? "text-red-600"
                            : request.status === "completed"
                              ? "text-blue-600"
                              : "text-yellow-600"
                      }`}
                    >
                      {request.status.charAt(0).toUpperCase() +
                        request.status.slice(1)}
                    </span>
                  </div>
                </div>
                {request.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(request.id)}
                      variant="default"
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleReject(request.id)}
                      variant="outline"
                    >
                      Reject
                    </Button>
                  </div>
                )}
                {request.status === "approved" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleDownload(request)}
                      variant="default"
                      className="flex items-center gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Download Form 137
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {requests.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No Form 137 requests found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
