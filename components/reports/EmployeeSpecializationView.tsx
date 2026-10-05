"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  SPECIALIZATION_PARTS,
  SpecializationStaff,
  buildSpecializationCounts,
  isIncomplete,
  partLabel,
} from "@/lib/utils/employeeSpecialization";
import { useMemo, useState } from "react";

const sexLetter = (g: string | null) => (g === "male" ? "M" : g === "female" ? "F" : "—");

export function EmployeeSpecializationView({
  staff,
  divisionWide,
}: {
  staff: SpecializationStaff[];
  divisionWide: boolean;
}) {
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);

  const counts = useMemo(
    () => SPECIALIZATION_PARTS.map((p) => ({ ...p, rows: buildSpecializationCounts(staff, p.key) })),
    [staff],
  );
  const missing = useMemo(() => staff.filter(isIncomplete).length, [staff]);
  const roster = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter(
      (p) =>
        (!onlyMissing || isIncomplete(p)) &&
        (!q || p.name.toLowerCase().includes(q) || p.school_name.toLowerCase().includes(q)),
    );
  }, [staff, search, onlyMissing]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {staff.length} employee{staff.length === 1 ? "" : "s"} · {missing} not yet fully updated.
      </p>

      <div className="grid gap-4 xl:grid-cols-3">
        {counts.map((part) => (
          <div key={part.key} className="space-y-2">
            <h3 className="text-sm font-semibold">{part.title}</h3>
            <div className="app__table_shell">
              <div className="app__table_wrapper">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left font-medium">Major / Specialization</th>
                      <th className="text-right font-medium w-10">M</th>
                      <th className="text-right font-medium w-10">F</th>
                      <th className="text-right font-medium w-12">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {part.rows.map((r) => (
                      <tr key={r.code}>
                        <td>{r.label}</td>
                        <td className="text-right">{r.male}</td>
                        <td className="text-right">{r.female}</td>
                        <td className="text-right font-medium">{r.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Totals include employees whose sex is not recorded, so M + F may be less than Total.
      </p>

      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-sm font-semibold">Employees</h3>
          <div className="flex flex-wrap items-center gap-4">
            <Input
              placeholder={divisionWide ? "Search name or school" : "Search name"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-64"
            />
            <div className="flex items-center gap-2">
              <Switch id="only-missing" checked={onlyMissing} onCheckedChange={setOnlyMissing} />
              <Label htmlFor="only-missing" className="text-sm">Not yet updated</Label>
            </div>
          </div>
        </div>
        <div className="app__table_shell">
          <div className="app__table_wrapper">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left font-medium w-8">#</th>
                  {divisionWide && <th className="text-left font-medium">School</th>}
                  <th className="text-left font-medium">Name</th>
                  <th className="text-center font-medium w-12">Sex</th>
                  <th className="text-left font-medium">College Major</th>
                  <th className="text-left font-medium">Graduate Major</th>
                  <th className="text-left font-medium">DepEd Specialization</th>
                </tr>
              </thead>
              <tbody>
                {roster.length === 0 ? (
                  <tr>
                    <td colSpan={divisionWide ? 7 : 6} className="py-6 text-center text-muted-foreground">
                      No employees match.
                    </td>
                  </tr>
                ) : (
                  roster.map((p, i) => (
                    <tr key={p.id}>
                      <td className="text-muted-foreground">{i + 1}</td>
                      {divisionWide && <td>{p.school_name}</td>}
                      <td className="font-medium">{p.name}</td>
                      <td className="text-center">{sexLetter(p.gender)}</td>
                      <td>{partLabel("undergrad", p)}</td>
                      <td>{partLabel("graduate", p)}</td>
                      <td>{partLabel("work", p)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
