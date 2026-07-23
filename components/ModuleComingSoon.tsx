"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, Hammer } from "lucide-react";
import Link from "next/link";

interface ModuleComingSoonProps {
  title: string;
  description?: string;
  /** Where the "back" link points — usually the module landing page. */
  backHref: string;
  backLabel: string;
}

/**
 * Placeholder for menu entries that are already visible in the sidebar but
 * whose functionality is deferred. Keeps the navigation shape stable so the
 * feature can be dropped in later without touching the menus again.
 */
export function ModuleComingSoon({
  title,
  description,
  backHref,
  backLabel,
}: ModuleComingSoonProps) {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <Link
        href={backHref}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        {backLabel}
      </Link>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Hammer className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-base font-medium">
              This feature is currently not available.
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              It is still under development and will be enabled in a future
              update.
            </p>
            <Link href={backHref}>
              <Button variant="outline" size="sm" className="mt-2">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {backLabel}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
