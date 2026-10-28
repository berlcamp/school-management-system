"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SBFP_DISTRICTS } from "@/lib/constants/sbfp";
import { getSchoolYearOptions } from "@/lib/utils/schoolYear";
import { ALL_DISTRICTS, OTHER_DISTRICT } from "@/lib/utils/sbfpOverview";

/** School year picker, shared by both SBFP Viewer pages. */
export function SchoolYearSelect({
  value,
  onChange,
  id = "sbfp-sy",
}: {
  value: string;
  onChange: (sy: string) => void;
  id?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        School year
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="h-11 w-[150px] bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {getSchoolYearOptions().map((sy) => (
            <SelectItem key={sy} value={sy}>
              {sy}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DistrictSelect({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="sbfp-district" className="text-sm font-medium text-slate-700">
        District
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="sbfp-district" className="h-11 w-[170px] bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_DISTRICTS}>All districts</SelectItem>
          {SBFP_DISTRICTS.map((d) => (
            <SelectItem key={d} value={d}>
              {d}
            </SelectItem>
          ))}
          <SelectItem value={OTHER_DISTRICT}>Other</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
