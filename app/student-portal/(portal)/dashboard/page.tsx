"use client";

import { useStudentSession } from "@/lib/student-portal/context";
import { Award, ArrowRight, GraduationCap } from "lucide-react";
import Link from "next/link";

export default function StudentDashboardPage() {
  const { session } = useStudentSession();

  return (
    <div className="space-y-8">
      <h2
        className="text-xl font-bold text-gray-900 mb-6 animate-fade-up"
        style={{ animationDelay: "0.1s" }}
      >
        Quick Access
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/student-portal/grades"
          className="group rounded-2xl bg-white border border-gray-100 shadow-sm p-6 transition-all duration-300 hover:shadow-md hover:translate-y-[-2px] animate-fade-up"
          style={{ animationDelay: "0.2s" }}
        >
          <div className="inline-flex p-2.5 rounded-xl bg-violet-50 mb-4">
            <Award className="h-5 w-5 text-violet-600" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-0.5 flex items-center gap-2">
            Grade Records
            <ArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-1 transition-all duration-200" />
          </h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            View your grades by school year and subject (Q1–Q4)
          </p>
        </Link>

        <div
          className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6 animate-fade-up"
          style={{ animationDelay: "0.25s" }}
        >
          <div className="inline-flex p-2.5 rounded-xl bg-emerald-50 mb-4">
            <GraduationCap className="h-5 w-5 text-emerald-600" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-0.5">LRN</h3>
          <p className="text-xs text-gray-400 mb-4">Your Learner Reference Number</p>
          <p className="font-mono text-lg font-semibold text-gray-900">
            {session?.lrn ?? "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
