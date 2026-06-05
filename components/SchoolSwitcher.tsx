"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { setActiveSchoolOverride } from "@/lib/utils/activeSchool";
import { Check, ChevronsUpDown, School } from "lucide-react";
import { useEffect, useState } from "react";

type SchoolOption = { id: string; name: string; depedCode: string };

export function SchoolSwitcher() {
  const user = useAppSelector((state) => state.user.user);
  const isSuperAdmin = user?.type === "super admin";

  const [open, setOpen] = useState(false);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    let isMounted = true;
    setLoading(true);
    supabase
      .from("sms_schools")
      .select("id, name, school_id")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .then(({ data }) => {
        if (!isMounted) return;
        setSchools(
          (data ?? []).map((s) => ({
            id: String(s.id),
            name: s.name,
            depedCode: s.school_id,
          })),
        );
        setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [isSuperAdmin]);

  if (!isSuperAdmin) return null;

  const currentId = user?.school_id != null ? String(user.school_id) : null;
  const currentSchool = schools.find((s) => s.id === currentId);

  const handleSelect = (schoolId: string) => {
    if (switching || schoolId === currentId) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    setActiveSchoolOverride(schoolId);
    // Full navigation to home so every school-scoped page re-fetches under the
    // new school; AuthGuard re-applies the persisted override on load.
    window.location.assign("/home");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={switching}
          className="flex items-center gap-2 rounded-md border border-[#424244] bg-[#3a3a3c] px-2.5 py-1.5 text-left text-gray-200 hover:bg-[#444446] disabled:opacity-60"
        >
          <School className="h-4 w-4 shrink-0 text-gray-400" />
          <span className="hidden max-w-[160px] truncate text-xs font-medium md:inline">
            {switching
              ? "Switching…"
              : currentSchool?.name ?? "Select school"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search school…" />
          <CommandList>
            <CommandEmpty>
              {loading ? "Loading schools…" : "No school found."}
            </CommandEmpty>
            <CommandGroup>
              {schools.map((school) => (
                <CommandItem
                  key={school.id}
                  value={`${school.name} ${school.depedCode}`}
                  onSelect={() => handleSelect(school.id)}
                  className="cursor-pointer"
                >
                  <Check
                    className={
                      school.id === currentId
                        ? "mr-2 h-4 w-4 opacity-100"
                        : "mr-2 h-4 w-4 opacity-0"
                    }
                  />
                  <div className="flex flex-col">
                    <span className="text-sm">{school.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {school.depedCode}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
