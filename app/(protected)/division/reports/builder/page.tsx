"use client";

/**
 * Custom Report Builder, division scope.
 *
 * The whole builder is `components/reports/report-builder/ReportBuilder`; this
 * page supplies only what is different about the division office's copy — a
 * school picker that also offers every school at once, and the ability to share
 * a saved report with the division.
 */

import { ReportBuilder } from "@/components/reports/report-builder/ReportBuilder";
import {
  ALL_SCHOOLS,
  SchoolFilter,
  SchoolOption,
} from "@/components/division-reports/SchoolFilter";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

export default function Page() {
  const [schoolId, setSchoolId] = useState<string>(ALL_SCHOOLS);
  const [schools, setSchools] = useState<SchoolOption[]>([]);

  const handleSchoolsLoaded = useCallback((options: SchoolOption[]) => {
    setSchools(options);
  }, []);

  const scopeLabel = useMemo(
    () =>
      schoolId === ALL_SCHOOLS
        ? "All Schools"
        : (schools.find((s) => s.id === schoolId)?.name ?? "One school"),
    [schoolId, schools],
  );

  return (
    <div>
      <div className="app__title">
        <div className="flex items-center gap-3">
          <Link
            href="/division/reports"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← SDO Reports
          </Link>
        </div>
        <h1 className="app__title_text">Custom Report Builder</h1>
        <p className="text-sm text-muted-foreground">
          Choose a dataset, the columns you need and the filters that narrow it.
          Everything the fixed reports do not already answer.
        </p>
      </div>

      <div className="app__content">
        <ReportBuilder
          schoolId={schoolId === ALL_SCHOOLS ? null : Number(schoolId)}
          scopeLabel={scopeLabel}
          scopeControl={
            <SchoolFilter
              value={schoolId}
              onChange={setSchoolId}
              allowAll
              onLoaded={handleSchoolsLoaded}
            />
          }
          allowDivisionSharing
        />
      </div>
    </div>
  );
}
