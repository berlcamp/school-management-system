"use client";

/**
 * Custom Report Builder, one school.
 *
 * The same component the division office uses, pinned to this school. A
 * school-level user is pinned to their active school by `ReportSchoolContext`
 * (134/164) and is never offered "All Schools"; a division user reaching it
 * here has already picked one from the bar.
 *
 * The pinning is convenience, not the gate: `can_run_division_report` (166)
 * refuses a school user any scope but their own school, and refuses the
 * division-wide NULL scope outright — so a hand-crafted request gets no
 * further than the picker would have.
 */

import { useReportSchool } from "@/components/reports/ReportSchoolContext";
import { ReportBuilder } from "@/components/reports/report-builder/ReportBuilder";
import { SCHOOL_IDENTITY_FIELDS } from "@/lib/utils/reportBuilder";
import Link from "next/link";
import {
  ReportAccessDenied,
  ReportNeedsSchool,
  useCanViewReports,
} from "../components/ReportShell";

export default function Page() {
  const canView = useCanViewReports();
  const { schoolId, schoolName } = useReportSchool();

  if (!canView) return <ReportAccessDenied />;
  if (!schoolId) return <ReportNeedsSchool />;

  return (
    <div>
      <div className="app__title">
        <div className="flex items-center gap-3">
          <Link
            href="/school-reports"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← School Reports
          </Link>
        </div>
        <h1 className="app__title_text">Custom Report Builder</h1>
        <p className="text-sm text-muted-foreground">
          Choose a dataset, the columns you need and the filters that narrow it.
          Everything the fixed reports do not already answer — for this school.
        </p>
      </div>

      <div className="app__content">
        <ReportBuilder
          schoolId={Number(schoolId)}
          scopeLabel={schoolName ?? "This school"}
          // No scope control: the school is settled before this page renders.
          // A saved report is private to its author here — `is_division_shared`
          // is the division office's tier and 170 restricts reading one to
          // them, so offering the checkbox would file a report out of sight.
          allowDivisionSharing={false}
          // School, District and School Type are the same value on every row
          // here, so as filters they can only match all of it or none of it.
          hiddenFilterFields={SCHOOL_IDENTITY_FIELDS}
        />
      </div>
    </div>
  );
}
