"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useStudentSession } from "@/lib/student-portal/context";
import { Award, GraduationCap } from "lucide-react";
import Link from "next/link";

export default function StudentDashboardPage() {
  const { session } = useStudentSession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">
          Welcome, {session?.studentName ?? "Student"}
        </h1>
        <p className="text-white/70 mt-1">
          Access your academic records and grade information
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/student-portal/grades">
          <Card className="rounded-2xl bg-white/15 backdrop-blur-xl border-white/25 hover:bg-white/20 transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Award className="h-5 w-5 text-blue-300" />
                Grade Records
              </CardTitle>
              <CardDescription className="text-white/80">
                View your grades by school year and subject
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-white/60">
                View all quarters (Q1–Q4) for each subject
              </p>
            </CardContent>
          </Card>
        </Link>

        <Card className="rounded-2xl bg-white/10 backdrop-blur-xl border-white/20">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-blue-300" />
              LRN
            </CardTitle>
            <CardDescription className="text-white/80">
              Your Learner Reference Number
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-lg text-white">
              {session?.lrn ?? "—"}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
