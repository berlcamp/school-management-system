"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDeliverySignedUrl, trackRequest } from "@/lib/requests/actions";
import { formatLrnInput } from "@/lib/utils";
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
  // Releasing the document takes the learner's LRN as well — see
  // getDeliverySignedUrl. A tracking number on its own is not proof of anything.
  const [lrnInput, setLrnInput] = useState("");

  const handleTrack = async () => {
    const val = trackingInput.trim().toUpperCase();
    if (!val) return;

    setLoading(true);
    setResult(null);
    setNotFound(false);
    setLrnInput("");

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
    const lrn = lrnInput.replace(/\D/g, "");
    if (lrn.length !== 12) {
      toast.error("Enter the learner's 12-digit LRN to download the document.");
      return;
    }
    setDownloading(true);
    const res = await getDeliverySignedUrl(result.tracking_number, lrn);
    if ("error" in res) {
      toast.error(res.error);
    } else {
      window.open(res.url, "_blank");
    }
    setDownloading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="e.g. REQ-20260101-AB1CD"
          value={trackingInput}
          onChange={(e) => setTrackingInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && handleTrack()}
          className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 h-11 font-mono uppercase"
        />
        <Button
          type="button"
          onClick={handleTrack}
          disabled={loading || !trackingInput.trim()}
          className="shrink-0 bg-slate-900 hover:bg-slate-800 text-white h-11 px-5 font-semibold rounded-xl"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </Button>
      </div>

      {notFound && (
        <p className="text-sm text-red-500 font-medium">
          No request found with that tracking number.
        </p>
      )}

      {result && (
        <div className="space-y-4 pt-2">
          {/* Summary */}
          <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                {result.request_type === "form137" ? (
                  <FileText className="h-5 w-5 text-gray-500" />
                ) : (
                  <GraduationCap className="h-5 w-5 text-gray-500" />
                )}
                <span className="font-semibold text-gray-900">
                  {result.request_type === "form137" ? "School Form 10" : "Diploma"}
                </span>
              </div>
              <Badge variant={statusVariant(result.status)}>
                {statusLabel[result.status] ?? result.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <span className="text-gray-500">Tracking #</span>
                <p className="text-gray-900 font-mono font-medium">
                  {result.tracking_number}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Student</span>
                <p className="text-gray-900 font-medium">
                  {result.student_name_masked}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Submitted</span>
                <p className="text-gray-700">
                  {new Date(result.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Requester Type</span>
                <p className="text-gray-700 capitalize">{result.requester_type}</p>
              </div>
            </div>

            {result.rejection_reason && (
              <div className="mt-1 p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-xs text-red-600 font-medium">Rejection reason:</p>
                <p className="text-sm text-red-700 mt-0.5">{result.rejection_reason}</p>
              </div>
            )}

            {result.has_delivery && result.status === "completed" && (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-gray-500">
                  Enter the learner&apos;s LRN to confirm your identity before
                  downloading.
                </p>
                <Input
                  placeholder="000000-000-000"
                  value={lrnInput}
                  onChange={(e) => setLrnInput(formatLrnInput(e.target.value))}
                  onKeyDown={(e) => e.key === "Enter" && handleDownload()}
                  inputMode="numeric"
                  className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 h-10 font-mono"
                />
                <Button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                >
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Download Document
                </Button>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Status History</p>
            <StatusTimeline logs={result.logs} />
          </div>
        </div>
      )}
    </div>
  );
}
