"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDesignations } from "@/hooks/useDesignations";
import { useNavSections } from "@/hooks/useNavSections";
import {
  DESIGNATION_LABELS,
  STAFF_DESIGNATIONS,
} from "@/lib/constants/designations";
import {
  DESIGNATION_CAPABILITIES,
  roleCapability,
} from "@/lib/constants/roleCapabilities";
import { useAppSelector } from "@/lib/redux/hook";
import { formatUserType } from "@/lib/utils/userProfile";
import { Award, Check, ShieldCheck } from "lucide-react";
import Link from "next/link";

/**
 * What the signed-in user's active role can do, and every module it opens.
 * The modules come from `useNavSections()`, the same list the sidebar renders,
 * so the dialog can never offer a page the menu does not.
 */
export function RoleAccessDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const type = useAppSelector((state) => state.user.user?.type);
  const sections = useNavSections();
  const { has } = useDesignations();
  const capability = roleCapability(type);
  const designations = STAFF_DESIGNATIONS.filter((d) => has(d));
  const moduleCount = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl gap-0 p-0">
        <DialogHeader className="flex-row items-start gap-4 space-y-0 border-b px-6 py-5 text-left">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
            <ShieldCheck className="size-6" aria-hidden="true" />
          </div>
          <div className="min-w-0 pr-6">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Your role
            </p>
            <DialogTitle className="text-lg leading-tight">
              {formatUserType(type) || "No role"}
            </DialogTitle>
            <DialogDescription className="mt-1">
              {capability.summary}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-6 px-6 py-5">
          {designations.length > 0 && (
            <section aria-labelledby="role-designations">
              <h3
                id="role-designations"
                className="mb-2 text-sm font-semibold text-foreground"
              >
                Designations at this school
              </h3>
              <ul className="space-y-2">
                {designations.map((d) => (
                  <li
                    key={d}
                    className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/60 dark:bg-amber-950/30"
                  >
                    <Award
                      className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {DESIGNATION_LABELS[d]}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {DESIGNATION_CAPABILITIES[d]}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {capability.can.length > 0 && (
            <section aria-labelledby="role-can">
              <h3
                id="role-can"
                className="mb-2 text-sm font-semibold text-foreground"
              >
                What you can do
              </h3>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {capability.can.map((line) => (
                  <li key={line} className="flex gap-2 text-sm text-foreground/90">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="role-modules">
            <h3
              id="role-modules"
              className="mb-3 flex items-baseline gap-2 text-sm font-semibold text-foreground"
            >
              Modules you can open
              <span className="text-xs font-normal text-muted-foreground">
                {moduleCount}
              </span>
            </h3>
            <div className="space-y-4">
              {sections.map((section, i) => (
                <div key={section.label ?? i}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {section.label ?? "General"}
                  </p>
                  <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {section.items.map((item) => (
                      <li key={item.url}>
                        <Link
                          href={item.url}
                          onClick={() => onOpenChange(false)}
                          className="flex min-h-11 items-center gap-2.5 rounded-md border px-3 py-2 text-sm text-foreground transition-colors hover:border-emerald-300 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-emerald-800 dark:hover:bg-emerald-950/40"
                        >
                          <item.icon
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span className="truncate">{item.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
