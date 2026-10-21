"use client";

import { QuickLink } from "@/components/dashboards/DashboardKit";
import { ClipboardList, LayoutGrid, Users } from "lucide-react";

export function DefaultDashboard() {
  return (
    <div className="space-y-6">
      <section aria-labelledby="getting-started-heading" className="space-y-3">
        <div>
          <h2
            id="getting-started-heading"
            className="text-base font-semibold text-foreground"
          >
            Getting started
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Jump into the modules you will use most.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <QuickLink
            href="/enrollment"
            title="Enrollment"
            description="Manage student enrollments"
            icon={ClipboardList}
            tone="emerald"
          />
          <QuickLink
            href="/sections"
            title="Sections"
            description="View class sections"
            icon={LayoutGrid}
            tone="sky"
          />
          <QuickLink
            href="/students"
            title="Students"
            description="Browse student records"
            icon={Users}
            tone="violet"
          />
        </div>
      </section>
    </div>
  );
}
