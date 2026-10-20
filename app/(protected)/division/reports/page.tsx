"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useRegionAccess } from "@/hooks/useRegionAccess";
import { FileBarChart } from "lucide-react";
import Link from "next/link";
import { DIVISION_REPORTS } from "./reportCatalog";

export default function Page() {
  // A Region Account sees only the reports a super admin switched on (214),
  // and none of the division office's configuration links.
  const { isRegion, loading, canView, reportKey } = useRegionAccess();
  const reports = isRegion
    ? DIVISION_REPORTS.filter((r) => canView(reportKey(r.href)))
    : DIVISION_REPORTS;

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <FileBarChart className="h-5 w-5" />
          SDO Reports
        </h1>
        <p className="text-sm text-muted-foreground">
          Division-wide reports aggregated across all schools. Select a report
          below.
        </p>
      </div>

      <div className="app__content">
        {!isRegion && (
          <div className="mb-4 flex flex-wrap items-center justify-end gap-4">
            <Link
              href="/division/reports/lock-sy"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Lock / unlock submissions →
            </Link>
            <Link
              href="/division/reports/class-size-standards"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Configure class size standards →
            </Link>
          </div>
        )}

        {isRegion && !loading && reports.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No reports have been made available to your account yet.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((r) => {
            const Icon = r.icon;
            const card = (
              <Card
                className={
                  r.available
                    ? "cursor-pointer transition-all hover:border-primary hover:shadow-md"
                    : "opacity-60"
                }
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">{r.title}</CardTitle>
                    </div>
                    {!r.available && (
                      <Badge variant="secondary" className="text-xs">
                        Coming soon
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs">
                    {r.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <span className="text-xs font-medium text-primary">
                    {r.available ? "View report →" : "Phase 2+"}
                  </span>
                </CardContent>
              </Card>
            );

            return r.available ? (
              <Link key={r.title} href={r.href}>
                {card}
              </Link>
            ) : (
              <div key={r.title}>{card}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
