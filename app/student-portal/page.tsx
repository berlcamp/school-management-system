"use client";

import { LrnBoxInput } from "@/components/LrnBoxInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStudentSession } from "@/lib/student-portal/context";
import { verifyStudent } from "@/lib/student-portal/actions";
import { GraduationCap, Loader2, UserCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

export default function StudentPortalLoginPage() {
  const [lrn, setLrn] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const { refresh } = useStudentSession();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const lrnDigits = lrn.replace(/\D/g, "");
    if (!lrnDigits) {
      toast.error("LRN is required");
      return;
    }
    if (lrnDigits.length !== 12) {
      toast.error("LRN must be 12 digits");
      return;
    }
    if (!code.trim()) {
      toast.error("Code is required");
      return;
    }

    setLoading(true);
    try {
      const result = await verifyStudent(lrnDigits, code.trim());
      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        await refresh();
        router.push("/student-portal/dashboard");
      }
    } catch {
      toast.error("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Hero Section — matches landing page */}
      <div className="relative pt-28 sm:pt-32 pb-20 sm:pb-28">
        <div className="absolute inset-0" aria-hidden>
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
            style={{ backgroundImage: "url(/home.jpg)" }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/80 via-slate-900/70 to-slate-900/90" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-slate-50 to-transparent z-[1]" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl animate-fade-up">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 backdrop-blur-sm mb-6">
              <UserCircle className="h-3.5 w-3.5 text-white/80" />
              <span className="text-xs font-medium text-white/80">
                Schools Division of Bayugan City
              </span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white leading-[1.1]">
              Student Portal
            </h1>
            <p className="mt-6 text-lg text-white/70 max-w-xl leading-relaxed">
              Sign in with your Learner Reference Number and the code from your
              section adviser to access your academic records and grades.
            </p>
          </div>
        </div>
      </div>

      {/* Form Section — white card on slate-50 (matches landing) */}
      <div className="bg-slate-50 -mt-24 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div
            className="max-w-2xl mx-auto rounded-2xl bg-white border border-gray-100 shadow-sm p-6 sm:p-10 animate-fade-up"
            style={{ animationDelay: "0.15s" }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-violet-50">
                <GraduationCap className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Sign In</h2>
                <p className="text-sm text-gray-500">
                  Enter your LRN and code
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="lrn"
                  className="text-sm font-medium text-gray-700 mb-2 block"
                >
                  Learner Reference Number (LRN)
                </label>
                <LrnBoxInput
                  id="lrn"
                  variant="light"
                  singleLine
                  value={lrn}
                  onChange={setLrn}
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-2">
                  Enter all 12 digits (format: 4-4-4).
                </p>
              </div>
              <div>
                <label
                  htmlFor="code"
                  className="text-sm font-medium text-gray-700 mb-2 block"
                >
                  Code
                </label>
                <Input
                  id="code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter the code from your section adviser"
                  className="bg-white border-gray-200 text-gray-900 h-11"
                  disabled={loading}
                  autoComplete="off"
                  autoCapitalize="characters"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Your section adviser provides this code.
                </p>
              </div>
              <Button
                type="submit"
                className="w-full bg-slate-900 hover:bg-slate-800 text-white h-11 font-semibold rounded-xl"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-500">
              <Link href="/" className="text-gray-700 hover:text-gray-900 font-medium">
                ← Back to Home
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
