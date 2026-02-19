"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Home, LayoutGrid } from "lucide-react";
import Link from "next/link";

interface DefaultDashboardProps {
  userName: string;
}

export function DefaultDashboard({ userName }: DefaultDashboardProps) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 p-6 sm:p-8 shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-400/10 via-transparent to-transparent" />
        <div className="relative">
          <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
            <div className="rounded-xl bg-white/10 p-2.5 backdrop-blur-sm">
              <Home className="h-6 w-6" />
            </div>
            Welcome
          </h1>
          <p className="mt-2 text-slate-300 text-sm sm:text-base max-w-2xl">
            {userName ? `Hello, ${userName}.` : "Hello."} Use the sidebar to navigate.
          </p>
        </div>
      </div>

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
