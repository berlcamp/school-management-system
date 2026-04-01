"use client";

import { FileText, ScrollText, Search } from "lucide-react";
import { useState } from "react";
import { SubmitRequestForm } from "./components/SubmitRequestForm";
import { TrackingLookup } from "./components/TrackingLookup";

type Tab = "submit" | "track";

export default function RequestsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("submit");

  const tabClass = (active: boolean) =>
    `text-sm font-medium flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
      active
        ? "bg-white/15 text-white"
        : "text-white/80 hover:text-white hover:bg-white/10"
    }`;

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Hero Section — exact match with student portal layout */}
      <div className="relative pt-28 sm:pt-32 pb-28 sm:pb-36">
        <div className="absolute inset-0" aria-hidden>
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
            style={{ backgroundImage: "url(/home.jpg)" }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/80 via-slate-900/70 to-slate-900/90" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-slate-50 to-transparent z-[1]" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 animate-fade-up">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 backdrop-blur-sm mb-4">
                <ScrollText className="h-3.5 w-3.5 text-white/80" />
                <span className="text-xs font-medium text-white/80">
                  Schools Division of Bayugan City
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
                Document Requests
              </h1>
              <p className="mt-2 text-white/70">
                Request official school documents or track an existing request
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setActiveTab("submit")}
                className={tabClass(activeTab === "submit")}
              >
                <FileText className="h-4 w-4" />
                Submit Request
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("track")}
                className={tabClass(activeTab === "track")}
              >
                <Search className="h-4 w-4" />
                Track Request
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content Section — exact match with student portal layout */}
      <div className="bg-slate-50 -mt-24 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="space-y-6">
            {/* Page header — matches grades page pattern */}
            <div
              className="flex items-center gap-3 animate-fade-up"
              style={{ animationDelay: "0.1s" }}
            >
              <div className="p-2 rounded-lg bg-white border border-gray-200 shadow-sm">
                {activeTab === "submit" ? (
                  <FileText className="h-5 w-5 text-gray-600" />
                ) : (
                  <Search className="h-5 w-5 text-gray-600" />
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {activeTab === "submit" ? "Submit a Request" : "Track a Request"}
                </h2>
                <p className="text-sm text-gray-500">
                  {activeTab === "submit"
                    ? "Fill in the form below to request your school documents"
                    : "Enter your tracking number to check your request status"}
                </p>
              </div>
            </div>

            {/* Content card — matches grades page white card */}
            <div
              className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6 sm:p-8 animate-fade-up"
              style={{ animationDelay: "0.2s" }}
            >
              {activeTab === "submit" ? <SubmitRequestForm /> : <TrackingLookup />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
