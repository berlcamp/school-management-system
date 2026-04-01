"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LayoutGrid } from "lucide-react";
import Link from "next/link";

export function DefaultDashboard() {
  return (
    <div className="space-y-8">

      {/* Quick Links */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Getting Started</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link href="/enrollment">
            <Card className="group overflow-hidden border transition-all duration-300 hover:border-primary/50 hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <LayoutGrid className="h-5 w-5" />
                  Enrollment
                </CardTitle>
                <CardDescription>Manage student enrollments</CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/sections">
            <Card className="group overflow-hidden border transition-all duration-300 hover:border-primary/50 hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <LayoutGrid className="h-5 w-5" />
                  Sections
                </CardTitle>
                <CardDescription>View class sections</CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/students">
            <Card className="group overflow-hidden border transition-all duration-300 hover:border-primary/50 hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <LayoutGrid className="h-5 w-5" />
                  Students
                </CardTitle>
                <CardDescription>Browse student records</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
