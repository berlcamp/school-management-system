"use client";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { exportExcel } from "@/lib/utils/exportExcel";
import {
  formatCount,
  formatRate,
  openConcerns,
  rehabilitationPercent,
  schoolAttendancePercent,
  schoolDistrict,
  OTHER_DISTRICT,
  type SbfpOverviewSchool,
} from "@/lib/utils/sbfpOverview";
import { ArrowDown, ArrowUp, ChevronRight, Download, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type SortKey = "name" | "beneficiaries" | "attendance" | "rehab" | "concerns";

const districtLabel = (d: string | null) => {
  const k = schoolDistrict(d);
  return k === OTHER_DISTRICT ? d || "—" : k;
};

function status(r: SbfpOverviewSchool): { label: string; tone: "outline" | "secondary" | "default" } {
  if (!r.program_id) return { label: "Not started", tone: "outline" };
  if (r.beneficiaries === 0) return { label: "Opened", tone: "secondary" };
  return { label: "Feeding", tone: "default" };
}

const sortValue = (r: SbfpOverviewSchool, key: SortKey): number | string => {
  switch (key) {
    case "name":
      return r.school_name.toLowerCase();
    case "beneficiaries":
      return r.beneficiaries;
    case "attendance":
      return schoolAttendancePercent(r) ?? -1;
    case "rehab":
      return rehabilitationPercent(r) ?? -1;
    case "concerns":
      return openConcerns(r);
  }
};

export function SchoolsTable({
  rows,
  schoolYear,
}: {
  rows: readonly SbfpOverviewSchool[];
  schoolYear: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "beneficiaries", desc: true });

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? rows.filter((r) => r.school_name.toLowerCase().includes(q)) : [...rows];
    return list.sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      const cmp = x < y ? -1 : x > y ? 1 : a.school_name.localeCompare(b.school_name);
      return sort.desc ? -cmp : cmp;
    });
  }, [rows, query, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "name" }));

  const handleExport = () =>
    exportExcel(
      shown.map((r) => ({
        School: r.school_name,
        District: districtLabel(r.district),
        Status: status(r).label,
        Beneficiaries: r.beneficiaries,
        Male: r.male,
        Female: r.female,
        Primary: r.primary_count,
        Secondary: r.secondary_count,
        "Weighed (baseline)": r.baseline_weighed,
        "Weighed (midline)": r.midline_weighed,
        "Weighed (endline)": r.endline_weighed,
        "Feeding days": r.feeding_days,
        "Attendance %": schoolAttendancePercent(r)?.toFixed(2) ?? "",
        "Wasted at baseline": r.wasted_at_baseline,
        Rehabilitated: r.rehabilitated,
        "Open concerns": openConcerns(r),
      })),
      `SBFP Schools ${schoolYear}`,
      "Schools",
    );

  const sortHeader = (k: SortKey, label: string, align: "left" | "right" = "right") => {
    const active = sort.key === k;
    const Arrow = sort.desc ? ArrowDown : ArrowUp;
    return (
      <th
        key={k}
        scope="col"
        aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
        className={`px-3 py-2.5 font-medium ${align === "right" ? "text-right" : "text-left"}`}
      >
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className={`inline-flex cursor-pointer items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 ${
            active ? "text-slate-900" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          {label}
          {active && <Arrow className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
      </th>
    );
  };

  return (
    <section aria-labelledby="schools-heading" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3 p-5 sm:p-6">
        <div>
          <h2 id="schools-heading" className="text-base font-semibold text-slate-900">
            Schools
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Open a school to view and print its SBFP forms and logs.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <label className="relative flex-1 sm:w-64 sm:flex-none">
            <span className="sr-only">Search schools</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search schools"
              className="h-11 pl-9"
            />
          </label>
          <button
            type="button"
            onClick={handleExport}
            disabled={shown.length === 0}
            className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export Excel
          </button>
        </div>
      </div>

      <div className="relative overflow-x-auto border-t border-slate-200">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {sortHeader("name", "School", "left")}
              <th scope="col" className="px-3 py-2.5 text-left font-medium">Status</th>
              {sortHeader("beneficiaries", "Beneficiaries")}
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Weighed <span className="font-normal text-slate-500">B · M · E</span>
              </th>
              {sortHeader("attendance", "Attendance")}
              {sortHeader("rehab", "Rehabilitated")}
              {sortHeader("concerns", "Open concerns")}
              <th scope="col" className="px-3 py-2.5">
                <span className="sr-only">Reports</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-slate-600">
                  No school matches “{query}”.
                </td>
              </tr>
            ) : (
              shown.map((r) => {
                const s = status(r);
                const concerns = openConcerns(r);
                return (
                  <tr key={r.school_id} className="transition-colors duration-150 hover:bg-slate-50">
                    <td className="max-w-[280px] px-3 py-3">
                      <p className="truncate font-medium text-slate-900">{r.school_name}</p>
                      <p className="text-xs text-slate-500">
                        {districtLabel(r.district)}
                        {r.is_last_mile_school && " · Last mile school"}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={s.tone}>{s.label}</Badge>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-900">
                      {formatCount(r.beneficiaries)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                      {r.baseline_weighed} · {r.midline_weighed} · {r.endline_weighed}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                      {formatRate(schoolAttendancePercent(r))}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                      {r.wasted_at_baseline === 0
                        ? "—"
                        : `${r.rehabilitated} / ${r.wasted_at_baseline}`}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <span className={concerns > 0 ? "font-semibold text-amber-800" : "text-slate-500"}>
                        {concerns}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {r.program_id ? (
                        <Link
                          href={`/sbfp-viewer/reports?school=${r.school_id}&sy=${encodeURIComponent(schoolYear)}`}
                          className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-sky-800 transition-colors duration-150 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700"
                          aria-label={`Reports for ${r.school_name}`}
                        >
                          Reports
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">No programme</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500 sm:px-6">
        Showing {formatCount(shown.length)} of {formatCount(rows.length)} schools. Attendance is days
        present over beneficiaries × feeding days, as on Form 1B.
      </p>
    </section>
  );
}
