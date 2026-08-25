"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

export interface SchoolOption {
  id: string;
  name: string;
}

interface SchoolFilterProps {
  /** "" while no school has been picked yet. */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  /** Receives the loaded options, for pages that need the school's name. */
  onLoaded?: (schools: SchoolOption[]) => void;
}

/**
 * Picks one school of the division. Unlike SchoolTypeFilter this offers no
 * "all" option: the reports that use it are per-school by nature.
 */
export function SchoolFilter({
  value,
  onChange,
  label = "School",
  placeholder = "Select a school",
  onLoaded,
}: SchoolFilterProps) {
  const [schools, setSchools] = useState<SchoolOption[]>([]);

  useEffect(() => {
    let isMounted = true;

    supabase
      .from("sms_schools")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .then(({ data, error }) => {
        if (!isMounted || error) return;
        const options = (data ?? []).map((s) => ({
          id: String(s.id),
          name: s.name as string,
        }));
        setSchools(options);
        onLoaded?.(options);
      });

    return () => {
      isMounted = false;
    };
    // onLoaded is intentionally not a dependency — callers pass a fresh
    // closure each render and the list is fetched once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-[260px]">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {schools.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
