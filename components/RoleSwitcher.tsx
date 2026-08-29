"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
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
import { Check, ChevronsUpDown, IdCard } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

/**
 * Header role switcher, the twin of `SchoolSwitcher`.
 *
 * A person can hold several jobs at one school — the Grade 5 adviser who is
 * also the school nurse, the school head who kept a Science load. Migration 163
 * stores those in `sms_user_roles` as (role, school) pairs, while
 * `sms_users.type` holds whichever one they are acting as right now. Every
 * access decision in the system reads `type`, so the switch has to be a real
 * write: `sms_switch_active_role` rewrites that column and rejects any role the
 * user does not hold at their active school.
 *
 * Roles are sequential, not simultaneous — you see one menu at a time. That is
 * deliberate: Instructional Supervision (121) has the school head *rating* the
 * teacher, so a merged session would let an observer edit their own COT rating
 * sheet.
 *
 * Ends in a full page load so every role-scoped page re-fetches, and renders
 * nothing at all for the single-role user, which is almost everybody.
 */
export function RoleSwitcher() {
  const user = useAppSelector((state) => state.user.user);
  const systemUserId = user?.system_user_id;
  const schoolId = user?.school_id;

  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (systemUserId == null) return;

    let isMounted = true;
    setLoading(true);

    const load = async () => {
      // Only the roles held at the school they are currently switched to —
      // a teacher at the main school who heads the annex must not be offered
      // the annex's role while working here.
      let query = supabase
        .from("sms_user_roles")
        .select("role")
        .eq("user_id", systemUserId);

      query =
        schoolId == null
          ? query.is("school_id", null)
          : query.eq("school_id", Number(schoolId));

      const { data } = await query;
      if (!isMounted) return;

      const unique = Array.from(
        new Set((data ?? []).map((r) => String(r.role))),
      ).filter(canSwitchToRole);

      setRoles(unique.sort((a, b) => a.localeCompare(b)));
      setLoading(false);
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [systemUserId, schoolId]);

  // A single role is not a choice — don't clutter the header with it.
  if (roles.length < 2) return null;

  const currentRole = user?.type ?? null;

  const handleSelect = async (role: string) => {
    if (switching || role === currentRole) {
      setOpen(false);
      return;
    }
    setSwitching(true);

    // RLS reads sms_users.type, so the move has to be persisted before the
    // reload — a client-only override would 403 on the next query.
    const { error } = await supabase.rpc("sms_switch_active_role", {
      p_type: role,
    });
    if (error) {
      setSwitching(false);
      setOpen(false);
      toast.error(error.message || "Could not switch role.");
      return;
    }

    // Full navigation to home so every role-scoped page re-fetches under the
    // new role; AuthGuard reloads the user row on load.
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
          <IdCard className="h-4 w-4 shrink-0 text-gray-400" />
          <span className="hidden max-w-[160px] truncate text-xs font-medium md:inline">
            {switching
              ? "Switching…"
              : (currentRole && USER_TYPE_LABELS[currentRole]) ?? "Select role"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-0">
        <Command>
          <CommandList>
            <CommandEmpty>
              {loading ? "Loading roles…" : "No role found."}
            </CommandEmpty>
            <CommandGroup heading="Work as">
              {roles.map((role) => (
                <CommandItem
                  key={role}
                  value={USER_TYPE_LABELS[role] ?? role}
                  onSelect={() => handleSelect(role)}
                  className="cursor-pointer"
                >
                  <Check
                    className={
                      role === currentRole
                        ? "mr-2 h-4 w-4 opacity-100"
                        : "mr-2 h-4 w-4 opacity-0"
                    }
                  />
                  <span className="text-sm">
                    {USER_TYPE_LABELS[role] ?? role}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
