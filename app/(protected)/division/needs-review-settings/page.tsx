"use client";

/**
 * Needs Review Settings (migration 227) — super admin only.
 *
 * The switch turns Needs Review on or off for the division office and for
 * school heads and admins: every menu link, both pages and — in the database —
 * `division_needs_review` itself. A super admin can still open the page while
 * it is off. The module only reads other modules' records, so nothing is lost.
 */

import { SuperAdminOnlyGuard } from "@/components/SuperAdminOnlyGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { refreshNeedsReviewEnabled, setNeedsReviewEnabled } from "@/hooks/useNeedsReviewEnabled";
import { supabase } from "@/lib/supabase/client";
import { ClipboardCheck, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

export default function Page() {
  return (
    <SuperAdminOnlyGuard>
      <NeedsReviewSettingsPage />
    </SuperAdminOnlyGuard>
  );
}

function NeedsReviewSettingsPage() {
  const [enabled, setEnabled] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("sms_needs_review_settings")
      .select("is_enabled, updated_at")
      .maybeSingle();
    if (error) toast.error("Could not load the Needs Review setting.");
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
    const result = await setNeedsReviewEnabled(on);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setEnabled(on);
    setUpdatedAt(new Date().toISOString());
    refreshNeedsReviewEnabled();
    toast.success(on ? "Needs Review turned on" : "Needs Review turned off");
  };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
          Needs Review Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Turn Needs Review on or off for the division office and for school heads and admins.
        </p>
      </div>

      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle>Needs Review</CardTitle>
            <CardDescription>
              When on, the division office sees every school, and each school head and school
              admin sees their own school, under Needs Review in the menu. When off, it is hidden
              for everyone; as super admin you can still open it below. It only reads records, so
              nothing is changed or lost either way.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <label htmlFor="needs-review-enabled" className="text-sm font-medium text-gray-900">
                  {loading ? "Loading…" : enabled ? "On" : "Off"}
                </label>
                {updatedAt && !loading && (
                  <p className="text-xs text-gray-500">Last changed {new Date(updatedAt).toLocaleString()}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin text-gray-500" aria-label="Saving" />}
                <Switch
                  id="needs-review-enabled"
                  checked={enabled}
                  disabled={loading || saving}
                  onCheckedChange={(on) => void toggle(on)}
                />
              </div>
            </div>
            {!loading && (
              <Link href="/division/needs-review">
                <Button variant="outline" size="sm">
                  <ClipboardCheck className="h-4 w-4" aria-hidden="true" /> Open Needs Review
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
