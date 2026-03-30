"use client";

import { PublicPageBackground } from "@/components/PublicPageBackground";
import { FileText, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SubmitRequestForm } from "./components/SubmitRequestForm";
import { TrackingLookup } from "./components/TrackingLookup";

type Tab = "submit" | "track";

export default function RequestsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("submit");

  return (
    <div className="min-h-screen flex items-center justify-center p-4 py-12 relative">
      <PublicPageBackground />
      <div className="w-full max-w-2xl relative z-10 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <FileText className="h-6 w-6 text-blue-300" />
              Document Requests
            </h1>
            <p className="mt-1 text-sm text-white/80">
              Request School Form 10 or Diploma, or track an existing request.
            </p>
          </div>
          <Link
            href="/"
            className="shrink-0 text-sm font-medium text-white/80 hover:text-white transition-colors"
          >
            ← Back
          </Link>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-xl bg-white/10 border border-white/20 p-1 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("submit")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "submit"
                ? "bg-white/25 text-white shadow-sm"
                : "text-white/60 hover:text-white/90"
            }`}
          >
            <FileText className="h-4 w-4" />
            Submit Request
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("track")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "track"
                ? "bg-white/25 text-white shadow-sm"
                : "text-white/60 hover:text-white/90"
            }`}
          >
            <Search className="h-4 w-4" />
            Track Request
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "submit" ? <SubmitRequestForm /> : <TrackingLookup />}
      </div>
    </div>
  );
}
