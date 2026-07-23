"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowRight, Home } from "lucide-react";
import Link from "next/link";

export interface ModuleLandingEntry {
  title: string;
  description: string;
  href: string;
  icon: typeof Home;
}

interface ModuleLandingProps {
  title: string;
  description: string;
  icon: typeof Home;
  entries: ModuleLandingEntry[];
  /** Call-to-action shown on each card. */
  actionLabel?: string;
}

/** Card grid landing page shared by the school-level modules. */
export function ModuleLanding({
  title,
  description,
  icon: HeaderIcon,
  entries,
  actionLabel = "Open",
}: ModuleLandingProps) {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-2">
        <HeaderIcon className="h-6 w-6" />
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => {
          const Icon = entry.icon;
          return (
            <Link key={entry.href} href={entry.href} className="group">
              <Card className="h-full border-0 shadow-lg transition-shadow hover:shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-5 w-5 shrink-0" />
                    {entry.title}
                  </CardTitle>
                  <CardDescription>{entry.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="inline-flex items-center text-sm font-medium text-primary">
                    {actionLabel}
                    <ArrowRight className="h-4 w-4 ml-1 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
