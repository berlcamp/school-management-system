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
import { USER_TYPE_LABELS, canSwitchToRole } from "@/lib/constants";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { setActiveSchoolOverride } from "@/lib/utils/activeSchool";
import { Check, ChevronsUpDown, School } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

type SchoolOption = { id: string; name: string; depedCode: string };

/**
 * Header school switcher, serving two different mechanisms:
 *
 * - **Super admin** reaches every school, and switches via the localStorage
 *   override (`lib/utils/activeSchool.ts`). That works only because migrations
 *   094/113/115 put super admin in the full-access branch of every policy.
 * - **Everyone else** switches only between the schools they are assigned to
 *   in `sms_user_schools` (migration 134), and the switch is a real write to
 *   `sms_users.school_id` through the `sms_switch_active_school` RPC — RLS
 *   binds to that column, so the database has to agree about where they are.
 *
 * Both paths end in a full page load so every school-scoped page re-fetches.
 *
 * Since migration 163 a user may hold different roles at each of their schools,
 * so `sms_switch_active_school` refuses a move that would leave them in a role
 * they do not hold at the destination rather than silently promoting or
 * demoting them. That refusal is caught here and turned into a second step:
 * pick the role to work in there, then switch both in one write via
 * `sms_switch_active_context`.
 */
export function SchoolSwitcher() {
  const user = useAppSelector((state) => state.user.user);
  const isSuperAdmin = user?.type === "super admin";
  const systemUserId = user?.system_user_id;

  const [open, setOpen] = useState(false);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  // Second step: the destination needs a role chosen because the one they are
  // working in now is not held there.
  const [pendingSchool, setPendingSchool] = useState<SchoolOption | null>(null);
  const [pendingRoles, setPendingRoles] = useState<string[]>([]);

  useEffect(() => {
    // Super admin picks from every active school; assigned staff pick from
    // their own list, so nothing is fetched until we know which they are.
    if (!isSuperAdmin && systemUserId == null) return;

    let isMounted = true;
    setLoading(true);

    const load = async () => {
      let rows: { id: number; name: string; school_id: string }[] = [];

      if (isSuperAdmin) {
        const { data } = await supabase
          .from("sms_schools")
          .select("id, name, school_id")
          .eq("is_active", true)
          .order("name", { ascending: true });
        rows = data ?? [];
      } else {
        const { data: assigned } = await supabase
          .from("sms_user_schools")
          .select("school_id")
          .eq("user_id", systemUserId);

        const ids = (assigned ?? []).map((r) => String(r.school_id));
        if (ids.length > 0) {
          const { data } = await supabase
            .from("sms_schools")
            .select("id, name, school_id")
            .in("id", ids)
            .eq("is_active", true)
            .order("name", { ascending: true });
          rows = data ?? [];
        }
      }

      if (!isMounted) return;
      setSchools(
        rows.map((s) => ({
          id: String(s.id),
          name: s.name,
          depedCode: s.school_id,
        })),
      );
      setLoading(false);
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [isSuperAdmin, systemUserId]);

  // A single assigned school is not a choice — don't clutter the header with it.
  if (!isSuperAdmin && schools.length < 2) return null;

  const currentId = user?.school_id != null ? String(user.school_id) : null;
  const currentSchool = schools.find((s) => s.id === currentId);

  /** The roles this user may work in at a given school (migration 163). */
  const loadRolesAt = async (schoolId: string): Promise<string[]> => {
    if (systemUserId == null) return [];
    const { data } = await supabase
      .from("sms_user_roles")
      .select("role")
      .eq("user_id", systemUserId)
      .eq("school_id", Number(schoolId));

    return Array.from(new Set((data ?? []).map((r) => String(r.role))))
      .filter(canSwitchToRole)
      .sort((a, b) => a.localeCompare(b));
  };

  /** Step two: move school and role together, so the pair is never invalid. */
  const handlePendingRole = async (role: string) => {
    if (!pendingSchool || switching) return;
    setSwitching(true);

    const { error } = await supabase.rpc("sms_switch_active_context", {
      p_school_id: Number(pendingSchool.id),
      p_type: role,
    });
    if (error) {
      setSwitching(false);
      setPendingSchool(null);
      setOpen(false);
      toast.error(error.message || "Could not switch school.");
      return;
    }

    window.location.assign("/home");
  };

  const handleSelect = async (schoolId: string) => {
    if (switching || schoolId === currentId) {
      setOpen(false);
      return;
    }
    setSwitching(true);

    if (!isSuperAdmin) {
      // RLS reads sms_users.school_id, so the move has to be persisted before
      // the reload — a client-only override would 403 on the next query.
      const { error } = await supabase.rpc("sms_switch_active_school", {
        p_school_id: Number(schoolId),
      });
      if (error) {
        setSwitching(false);

        // The one refusal that is not a dead end: the user holds a role there,
        // just not the one they are working in. Ask which, rather than picking
        // for them — the RPC will not promote or demote anybody silently.
        if ((error.message || "").includes("Choose the role")) {
          const roles = await loadRolesAt(schoolId);
          if (roles.length > 0) {
            setPendingSchool(schools.find((s) => s.id === schoolId) ?? null);
            setPendingRoles(roles);
            return;
          }
        }

        setOpen(false);
        toast.error(error.message || "Could not switch school.");
        return;
      }
    } else {
      setActiveSchoolOverride(schoolId);
    }

    // Full navigation to home so every school-scoped page re-fetches under the
    // new school; AuthGuard reloads the user row on load.
    window.location.assign("/home");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setPendingSchool(null);
          setPendingRoles([]);
        }
      }}
    >
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
        {pendingSchool ? (
          <Command>
            <CommandList>
              <CommandGroup
                heading={`Work at ${pendingSchool.name} as`}
              >
                {pendingRoles.map((role) => (
                  <CommandItem
                    key={role}
                    value={USER_TYPE_LABELS[role] ?? role}
                    onSelect={() => handlePendingRole(role)}
                    className="cursor-pointer"
                  >
                    <span className="text-sm">
                      {USER_TYPE_LABELS[role] ?? role}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        ) : (
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
        )}
      </PopoverContent>
    </Popover>
  );
}
