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
import { Input } from "@/components/ui/input";
import { getDeliverySignedUrl, trackRequest } from "@/lib/requests/actions";
import {
  Download,
  FileText,
  GraduationCap,
  Loader2,
  Search,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { StatusTimeline } from "./StatusTimeline";

type TrackResult = {
  tracking_number: string;
  request_type: string;
  requester_type: string;
  student_name_masked: string;
  status: string;
  rejection_reason: string | null;
  has_delivery: boolean;
  logs: { action: string; actor_name: string | null; notes: string | null; created_at: string }[];
  created_at: string;
};

const statusVariant = (
  s: string
): "green" | "red" | "orange" | "blue" | "outline" => {
  if (s === "completed" || s === "approved") return "green";
  if (s === "rejected") return "red";
  if (s === "under_review") return "blue";
  return "orange";
};

const statusLabel: Record<string, string> = {
  pending: "Pending",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
};

export function TrackingLookup() {
  const [trackingInput, setTrackingInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrackResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleTrack = async () => {
    const val = trackingInput.trim().toUpperCase();
    if (!val) return;

    setLoading(true);
    setResult(null);
    setNotFound(false);

    const res = await trackRequest(val);

    if ("error" in res) {
      setNotFound(true);
    } else {
      setResult(res);
    }
    setLoading(false);
  };

  const handleDownload = async () => {
    if (!result) return;
    setDownloading(true);
    const res = await getDeliverySignedUrl(result.tracking_number);
    if ("error" in res) {
      toast.error(res.error);
    } else {
      window.open(res.url, "_blank");
    }
    setDownloading(false);
  };

  return (
    <Card className="rounded-2xl bg-white/20 backdrop-blur-xl border-white/30 shadow-2xl">
      <CardHeader className="pb-4">
        <CardTitle className="text-white flex items-center gap-2 text-lg">
          <Search className="h-5 w-5 text-blue-300" />
          Track Your Request
        </CardTitle>
        <CardDescription className="text-white/90">
          Enter your tracking number to check the status of your request.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="e.g. REQ-20260101-AB1CD"
            value={trackingInput}
            onChange={(e) => setTrackingInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleTrack()}
            className="bg-white/25 border-white/35 text-white placeholder:text-white/60 h-11 font-mono uppercase"
          />
          <Button
            type="button"
            onClick={handleTrack}
            disabled={loading || !trackingInput.trim()}
            className="shrink-0 bg-white/30 hover:bg-white/40 text-white border-white/40 h-11 px-5"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Track"
            )}
          </Button>
        </div>

        {notFound && (
          <p className="text-sm text-red-300 font-medium">
            No request found with that tracking number.
          </p>
        )}

        {result && (
          <div className="space-y-4 pt-2">
            {/* Summary */}
            <div className="p-4 rounded-xl bg-white/15 border border-white/25 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  {result.request_type === "form137" ? (
                    <FileText className="h-5 w-5 text-blue-300" />
                  ) : (
                    <GraduationCap className="h-5 w-5 text-blue-300" />
                  )}
                  <span className="font-semibold text-white">
                    {result.request_type === "form137"
                      ? "School Form 10"
                      : "Diploma"}
                  </span>
                </div>
                <Badge variant={statusVariant(result.status)}>
                  {statusLabel[result.status] ?? result.status}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div>
                  <span className="text-white/60">Tracking #</span>
                  <p className="text-white font-mono font-medium">
                    {result.tracking_number}
                  </p>
                </div>
                <div>
                  <span className="text-white/60">Student</span>
                  <p className="text-white font-medium">
                    {result.student_name_masked}
                  </p>
                </div>
                <div>
                  <span className="text-white/60">Submitted</span>
                  <p className="text-white">
                    {new Date(result.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <span className="text-white/60">Requester Type</span>
                  <p className="text-white capitalize">{result.requester_type}</p>
                </div>
              </div>

              {result.rejection_reason && (
                <div className="mt-1 p-3 rounded-lg bg-red-500/15 border border-red-400/30">
                  <p className="text-xs text-red-300 font-medium">
                    Rejection reason:
                  </p>
                  <p className="text-sm text-red-200 mt-0.5">
                    {result.rejection_reason}
                  </p>
                </div>
              )}

              {result.has_delivery && result.status === "completed" && (
                <Button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="w-full bg-emerald-500/80 hover:bg-emerald-500 text-white gap-2"
                >
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Download Document
                </Button>
              )}
            </div>

            {/* Timeline */}
            <div>
              <p className="text-sm font-medium text-white/80 mb-3">
                Status History
              </p>
              <StatusTimeline logs={result.logs} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
