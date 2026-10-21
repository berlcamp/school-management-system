"use client";

/**
 * Help Desk Settings (migration 218) — super admin only.
 *
 * The switch turns the whole Help Desk on or off: the menu links, the pages,
 * the public form at /contact, and — in the database — every write. Turning
 * it off deletes nothing; concerns already filed are there again when it is
 * turned back on.
 *
 * The staff list adds people to the inbox beyond super admins and division
 * admins, who answer automatically.
 */

import { SuperAdminOnlyGuard } from "@/components/SuperAdminOnlyGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { refreshHelpdeskAccess } from "@/hooks/useHelpdesk";
import { HELPDESK_STAFF_TYPES } from "@/lib/constants/helpdesk";
import { isLoginDisabledUserType, USER_TYPE_LABELS } from "@/lib/constants/userTypes";
import { fetchHelpdeskStaff, setHelpdeskEnabled, setHelpdeskStaff } from "@/lib/helpdesk/api";
import { supabase } from "@/lib/supabase/client";
import { escapeIlikePattern } from "@/lib/utils";
import { ExternalLink, Inbox, LifeBuoy, Loader2, Search, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface StaffRow {
  id: number;
  name: string;
  type: string;
}

interface Candidate {
  id: number;
  name: string;
  email: string;
  type: string | null;
}

export default function Page() {
  return (
    <SuperAdminOnlyGuard>
      <HelpdeskSettingsPage />
    </SuperAdminOnlyGuard>
  );
}

function HelpdeskSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSwitch, setSavingSwitch] = useState(false);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [listed, setListed] = useState<Set<number>>(new Set());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    const [settings, list, extra] = await Promise.all([
      supabase.from("sms_helpdesk_settings").select("is_enabled, updated_at").maybeSingle(),
      fetchHelpdeskStaff(),
      supabase.from("sms_helpdesk_staff").select("user_id"),
    ]);
    if (settings.error) toast.error("Could not load the Help Desk settings.");
    else {
      setEnabled(settings.data?.is_enabled === true);
      setUpdatedAt(settings.data?.updated_at ?? null);
    }
    if (list.ok) setStaff(list.data);
    setListed(new Set((extra.data ?? []).map((r) => r.user_id as number)));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Search people to add, as you type.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setCandidates([]);
      return;
    }
    let isMounted = true;
    const t = setTimeout(async () => {
      setSearching(true);
      const pattern = escapeIlikePattern(q.replace(/[,()]/g, " "));
      const { data } = await supabase
        .from("sms_users")
        .select("id, name, email, type")
        .eq("is_active", true)
        .is("deleted_at", null)
        .not("user_id", "is", null)
        .or(`name.ilike.%${pattern}%,email.ilike.%${pattern}%`)
        .order("name")
        .limit(10);
      if (!isMounted) return;
      setCandidates(((data ?? []) as Candidate[]).filter((c) => !isLoginDisabledUserType(c.type)));
      setSearching(false);
    }, 300);
    return () => {
      isMounted = false;
      clearTimeout(t);
    };
  }, [query]);

  const toggle = async (on: boolean) => {
    setSavingSwitch(true);
    const result = await setHelpdeskEnabled(on);
    setSavingSwitch(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setEnabled(on);
    setUpdatedAt(new Date().toISOString());
    refreshHelpdeskAccess();
    toast.success(on ? "Help Desk turned on" : "Help Desk turned off");
  };

  const changeStaff = async (userId: number, on: boolean) => {
    setBusyId(userId);
    const result = await setHelpdeskStaff(userId, on);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(on ? "Added to the Help Desk" : "Removed from the Help Desk");
    if (on) setQuery("");
    refreshHelpdeskAccess();
    await load();
  };

  const automatic = staff.filter((s) => HELPDESK_STAFF_TYPES.includes(s.type) && !listed.has(s.id));
  const extra = staff.filter((s) => listed.has(s.id));

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <LifeBuoy className="h-5 w-5" aria-hidden="true" />
          Help Desk Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Turn the Help Desk on or off, and choose who answers it.
        </p>
      </div>

      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle>Help Desk</CardTitle>
            <CardDescription>
              When on, every signed-in user sees Help Desk in the menu and can send a concern, and
              anyone can use the public form. When off, all of it is hidden and nothing new can be
              sent or answered. Concerns already sent are kept either way.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <label htmlFor="helpdesk-enabled" className="text-sm font-medium text-gray-900">
                  {loading ? "Loading…" : enabled ? "On" : "Off"}
                </label>
                {updatedAt && !loading && (
                  <p className="text-xs text-gray-500">Last changed {new Date(updatedAt).toLocaleString()}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {savingSwitch && <Loader2 className="h-4 w-4 animate-spin text-gray-500" aria-label="Saving" />}
                <Switch
                  id="helpdesk-enabled"
                  checked={enabled}
                  disabled={loading || savingSwitch}
                  onCheckedChange={(on) => void toggle(on)}
                />
              </div>
            </div>
            {enabled && (
              <div className="flex flex-wrap gap-2">
                <Link href="/helpdesk/inbox">
                  <Button variant="outline" size="sm">
                    <Inbox className="h-4 w-4" aria-hidden="true" /> Open the inbox
                  </Button>
                </Link>
                <a href="/contact" target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-4 w-4" aria-hidden="true" /> Public form
                    <span className="sr-only">(opens in a new tab)</span>
                  </Button>
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Who answers</CardTitle>
            <CardDescription>
              Super admins and division admins answer automatically. Add anyone else who should see
              the inbox, reply and be assigned concerns.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <label htmlFor="helpdesk-add" className="text-sm font-medium text-gray-800">
                Add a person
              </label>
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
                <Input
                  id="helpdesk-add"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or email"
                  className="pl-8"
                />
              </div>
              {query.trim().length >= 2 && (
                <ul className="mt-2 divide-y rounded-md border">
                  {searching && candidates.length === 0 ? (
                    <li className="p-3 text-sm text-gray-600">Searching…</li>
                  ) : candidates.length === 0 ? (
                    <li className="p-3 text-sm text-gray-600">No one matches.</li>
                  ) : (
                    candidates.map((c) => {
                      const already = staff.some((s) => s.id === c.id);
                      return (
                        <li key={c.id} className="flex items-center justify-between gap-2 p-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-gray-900">{c.name}</div>
                            <div className="truncate text-xs text-gray-600">
                              {c.email} · {USER_TYPE_LABELS[c.type ?? ""] ?? c.type}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={already || busyId === c.id}
                            onClick={() => void changeStaff(c.id, true)}
                          >
                            <UserPlus className="h-4 w-4" aria-hidden="true" />
                            {already ? "Already answers" : "Add"}
                          </Button>
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-800">Added by a super admin</h3>
              {extra.length === 0 ? (
                <p className="mt-1 text-sm text-gray-600">No one yet.</p>
              ) : (
                <ul className="mt-2 divide-y rounded-md border">
                  {extra.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-gray-900">{s.name}</div>
                        <div className="text-xs text-gray-600">{USER_TYPE_LABELS[s.type] ?? s.type}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === s.id}
                        onClick={() => void changeStaff(s.id, false)}
                      >
                        <UserMinus className="h-4 w-4" aria-hidden="true" /> Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-800">Automatically (by role)</h3>
              <ul className="mt-2 divide-y rounded-md border">
                {automatic.map((s) => (
                  <li key={s.id} className="p-3">
                    <div className="truncate text-sm font-medium text-gray-900">{s.name}</div>
                    <div className="text-xs text-gray-600">{USER_TYPE_LABELS[s.type] ?? s.type}</div>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
