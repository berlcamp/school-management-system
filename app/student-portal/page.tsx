"use client";

import { PublicPageBackground } from "@/components/PublicPageBackground";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useStudentSession } from "@/lib/student-portal/context";
import { verifyStudent } from "@/lib/student-portal/actions";
import { GraduationCap, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

export default function StudentPortalLoginPage() {
  const [lrn, setLrn] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [loading, setLoading] = useState(false);
  const { refresh } = useStudentSession();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lrn.trim()) {
      toast.error("LRN is required");
      return;
    }
    if (!dateOfBirth.trim()) {
      toast.error("Date of birth is required");
      return;
    }

    setLoading(true);
    try {
      const result = await verifyStudent(lrn.trim(), dateOfBirth.trim());
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
    <div className="min-h-screen flex items-center justify-center p-4 py-10 relative">
      <PublicPageBackground />
      <div className="w-full max-w-md relative z-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-blue-300" />
            Student Portal
          </h1>
          <Link
            href="/"
            className="text-sm font-medium text-white/90 hover:text-white transition-colors shrink-0"
          >
            ← Back
          </Link>
        </div>

        <Card className="rounded-2xl bg-white/20 backdrop-blur-xl border-white/30 shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-white flex items-center gap-2 text-lg">
              Sign In
            </CardTitle>
            <CardDescription className="text-white/90">
              Enter your Learner Reference Number and date of birth to access
              your records
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="lrn"
                  className="text-sm font-medium text-white mb-2 block"
                >
                  Learner Reference Number (LRN)
                </label>
                <Input
                  id="lrn"
                  type="text"
                  placeholder="Enter your LRN"
                  value={lrn}
                  onChange={(e) => setLrn(e.target.value)}
                  className="bg-white/25 border-white/35 text-white placeholder:text-white/60 h-11"
                  disabled={loading}
                  autoComplete="off"
                />
              </div>
              <div>
                <label
                  htmlFor="dateOfBirth"
                  className="text-sm font-medium text-white mb-2 block"
                >
                  Date of Birth
                </label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="bg-white/25 border-white/35 text-white placeholder:text-white/60 h-11 [color-scheme:dark]"
                  disabled={loading}
                  autoComplete="bday"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-white/30 hover:bg-white/40 text-white border-white/40 h-11 font-medium"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
