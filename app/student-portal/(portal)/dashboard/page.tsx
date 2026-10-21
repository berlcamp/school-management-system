"use client";

import { QuickLink, StatTile } from "@/components/dashboards/DashboardKit";
import { useStudentSession } from "@/lib/student-portal/context";
import { formatLrn } from "@/lib/utils";
import { Award, IdCard } from "lucide-react";

export default function StudentDashboardPage() {
  const { session } = useStudentSession();

  return (
    <div className="space-y-6">
      <section aria-labelledby="student-quick-access" className="space-y-3">
        <div>
          <h2
            id="student-quick-access"
            className="text-xl font-semibold tracking-tight text-foreground"
          >
            Quick access
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your records at a glance.
          </p>
        </div>

        <div className="grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2">
          <StatTile
            label="LRN"
            value={formatLrn(session?.lrn)}
            hint="Your Learner Reference Number"
            icon={IdCard}
            tone="emerald"
          />
          <div className="flex flex-col justify-center">
            <QuickLink
              href="/student-portal/grades"
              title="Grade Records"
              description="View your grades by school year and subject (Q1–Q4)"
              icon={Award}
              tone="violet"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
