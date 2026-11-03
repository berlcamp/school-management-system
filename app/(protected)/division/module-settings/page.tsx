"use client";

/**
 * Module Settings — super admin only. Every division-wide module on/off switch
 * on one page, so a new switch adds a section here instead of another menu
 * item: Feeding Program (221), Needs Review (227) and Help Desk (218, with its
 * staff list). The old /division/sbfp-settings, /division/needs-review-settings
 * and /division/helpdesk URLs redirect to their section.
 */

import { HelpdeskSettings } from "@/components/module-settings/HelpdeskSettings";
import { NeedsReviewSettings } from "@/components/module-settings/NeedsReviewSettings";
import { SbfpSettings } from "@/components/module-settings/SbfpSettings";
import { SuperAdminOnlyGuard } from "@/components/SuperAdminOnlyGuard";
import { SlidersHorizontal } from "lucide-react";

const SECTIONS = [
  { id: "feeding-program", label: "Feeding Program" },
  { id: "needs-review", label: "Needs Review" },
  { id: "helpdesk", label: "Help Desk" },
] as const;

export default function Page() {
  return (
    <SuperAdminOnlyGuard>
      <div>
        <div className="app__title">
          <h1 className="app__title_text flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
            Module Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Turn modules on or off for the whole division.
          </p>
        </div>

        <div className="mx-auto max-w-3xl space-y-8 p-4">
          <nav aria-label="Settings on this page" className="flex flex-wrap gap-2">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded-full border px-3 py-1 text-sm text-gray-700 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {s.label}
              </a>
            ))}
          </nav>
          <SbfpSettings />
          <NeedsReviewSettings />
          <HelpdeskSettings />
        </div>
      </div>
    </SuperAdminOnlyGuard>
  );
}
