"use client";

/**
 * Feeding Program Settings (migration 221) — super admin only.
 *
 * The switch turns the whole School-Based Feeding Program module on or off:
 * every menu link, the /sbfp page, and — in the database — every write.
 * Turning it off deletes nothing; programmes, beneficiaries, weighings and
 * feeding records are there again when it is turned back on.
 */

import { SuperAdminOnlyGuard } from "@/components/SuperAdminOnlyGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { refreshSbfpEnabled, setSbfpEnabled } from "@/hooks/useSbfpEnabled";
import { supabase } from "@/lib/supabase/client";
import { Loader2, Soup } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

export default function Page() {
  return (
    <SuperAdminOnlyGuard>
      <SbfpSettingsPage />
    </SuperAdminOnlyGuard>
  );
}

function SbfpSettingsPage() {
  const [enabled, setEnabled] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("sms_sbfp_settings")
      .select("is_enabled, updated_at")
      .maybeSingle();
    if (error) toast.error("Could not load the Feeding Program setting.");
    else {
      setEnabled(data?.is_enabled !== false);
      setUpdatedAt(data?.updated_at ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (on: boolean) => {
    setSaving(true);
    const result = await setSbfpEnabled(on);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setEnabled(on);
    setUpdatedAt(new Date().toISOString());
    refreshSbfpEnabled();
    toast.success(on ? "Feeding Program turned on" : "Feeding Program turned off");
  };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <Soup className="h-5 w-5" aria-hidden="true" />
          Feeding Program Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Turn the School-Based Feeding Program module on or off for the whole division.
        </p>
      </div>

      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle>Feeding Program</CardTitle>
            <CardDescription>
              When on, school staff, teachers and the division office see Feeding Program in the
              menu. When off, it is hidden for everyone and nothing can be added or changed.
              Records already encoded are kept either way.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <label htmlFor="sbfp-enabled" className="text-sm font-medium text-gray-900">
                  {loading ? "Loading…" : enabled ? "On" : "Off"}
                </label>
                {updatedAt && !loading && (
                  <p className="text-xs text-gray-500">Last changed {new Date(updatedAt).toLocaleString()}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin text-gray-500" aria-label="Saving" />}
                <Switch
                  id="sbfp-enabled"
                  checked={enabled}
                  disabled={loading || saving}
                  onCheckedChange={(on) => void toggle(on)}
                />
              </div>
            </div>
            {enabled && (
              <Link href="/sbfp">
                <Button variant="outline" size="sm">
                  <Soup className="h-4 w-4" aria-hidden="true" /> Open the Feeding Program
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
