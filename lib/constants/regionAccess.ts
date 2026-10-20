/**
 * What a Region Account (migration 214) may see, as switch keys.
 *
 * Each key is one row of `sms_region_account_access`, set by a super admin at
 * `/division/region-access`. A key with no row is OFF, so a section or report
 * added later stays hidden until somebody opts it in.
 *
 * Keys are free TEXT in the database (the 119/132 precedent) — this file is the
 * list. Four of them are also named in SQL, because there the database itself
 * decides access, and must be kept in step with migration 214:
 * `report:absenteeism`, `report:grade-level-teachers`, `report:builder` and
 * `dashboard:document-requests`.
 */

export interface RegionAccessItem {
  key: string;
  title: string;
  description: string;
}

/** The Division Dashboard's sections, in the order the dashboard draws them. */
export const REGION_DASHBOARD_ITEMS: RegionAccessItem[] = [
  {
    key: "dashboard:summary",
    title: "Summary tiles",
    description: "Schools, personnel, learners and sections counts.",
  },
  {
    key: "dashboard:enrollment-by-grade",
    title: "Enrollment by Grade Level",
    description: "Approved enrollments per grade level, by sex.",
  },
  {
    key: "dashboard:learners-by-school",
    title: "Learners by School",
    description: "Top 8 schools by enrolled learners.",
  },
  {
    key: "dashboard:personnel-by-role",
    title: "Personnel by Role",
    description: "Staff across the division, by role.",
  },
  {
    key: "dashboard:enrollment-status",
    title: "Enrollment Status",
    description: "Enrollment records by lifecycle status.",
  },
  {
    key: "dashboard:document-requests",
    title: "Document Requests",
    description: "Form 137 / record requests by status.",
  },
];

/** The switch key of an SDO Report, from its route. */
export function regionReportKey(href: string): string {
  return `report:${href.replace(/\/+$/, "").split("/").pop()}`;
}

/** `/division/reports/<slug>` — the SDO Report a path belongs to, if any. */
export function regionReportKeyForPath(pathname: string): string | null {
  const match = pathname.match(/^\/division\/reports\/([^/]+)/);
  return match ? `report:${match[1]}` : null;
}

/**
 * Report pages that are not cards on the SDO Reports index but are reached
 * from them. `/division/reports/schools/[id]` is the per-school profile most
 * reports link a school's name to.
 */
export const REGION_EXTRA_REPORT_ITEMS: RegionAccessItem[] = [
  {
    key: "report:schools",
    title: "School profile",
    description:
      "The per-school page a report opens when a school's name is clicked.",
  },
];
