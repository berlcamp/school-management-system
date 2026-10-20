"use client";

/**
 * Region Account Access (migration 214) — which division dashboard sections
 * and SDO Reports a Region Account may view. Super admin only.
 *
 * One switch per item, saved together. A switch with no row is off, so a
 * report added to the catalogue later appears here unticked and stays hidden
 * from the Region Account until it is ticked. The same switches are read by
 * the database where it decides access itself (see the migration header), so
 * unticking a report closes it there too, not just in the menu.
 */

import { SuperAdminOnlyGuard } from "@/components/SuperAdminOnlyGuard";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { refreshRegionAccess } from "@/hooks/useRegionAccess";
import { REGION_ACCOUNT_USER_TYPE } from "@/lib/constants";
import {
  REGION_DASHBOARD_ITEMS,
  REGION_EXTRA_REPORT_ITEMS,
  RegionAccessItem,
  regionReportKey,
} from "@/lib/constants/regionAccess";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { Eye } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { DIVISION_REPORTS } from "../reports/reportCatalog";

const table = "sms_region_account_access";

const REPORT_ITEMS: RegionAccessItem[] = [
  ...DIVISION_REPORTS.filter((r) => r.available).map((r) => ({
    key: regionReportKey(r.href),
    title: r.title,
    description: r.description,
  })),
  ...REGION_EXTRA_REPORT_ITEMS,
];

const ALL_KEYS = [...REGION_DASHBOARD_ITEMS, ...REPORT_ITEMS].map((i) => i.key);

export default function Page() {
  return (
    <SuperAdminOnlyGuard>
      <RegionAccessPage />
    </SuperAdminOnlyGuard>
  );
}

function RegionAccessPage() {
  const user = useAppSelector((state) => state.user.user);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [accountCount, setAccountCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchAccess = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { count }] = await Promise.all([
      supabase.from(table).select("item_key").eq("is_enabled", true),
      supabase
        .from("sms_users")
        .select("*", { count: "exact", head: true })
        .eq("type", REGION_ACCOUNT_USER_TYPE)
        .eq("is_active", true),
    ]);
    if (error) {
      toast.error("Could not load Region Account access.");
    } else {
      const keys = new Set((data ?? []).map((row) => row.item_key as string));
      setSaved(keys);
      setEnabled(new Set(keys));
    }
    setAccountCount(count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAccess();
  }, [fetchAccess]);

  const isDirty = useMemo(
    () =>
      saved.size !== enabled.size ||
      [...enabled].some((key) => !saved.has(key)),
    [saved, enabled],
  );

  const toggle = (key: string, on: boolean) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const setGroup = (items: RegionAccessItem[], on: boolean) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      items.forEach((i) => (on ? next.add(i.key) : next.delete(i.key)));
      return next;
    });

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from(table).upsert(
      ALL_KEYS.map((key) => ({
        item_key: key,
        is_enabled: enabled.has(key),
        updated_by: user?.system_user_id ?? null,
        updated_at: now,
      })),
      { onConflict: "item_key" },
    );
    setSaving(false);
    if (error) {
      toast.error(error.message || "Could not save Region Account access.");
      return;
    }
    refreshRegionAccess();
    setSaved(new Set(enabled));
    toast.success("Region Account access saved.");
  };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Region Account Access
        </h1>
        <p className="text-sm text-muted-foreground">
          Choose what a Region Account may view. A Region Account can only look
          at the division dashboard and the SDO Reports; it never edits
          anything. Anything left unticked is hidden from it.
        </p>
      </div>

      <div className="app__content space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {accountCount !== null &&
              `${accountCount} active Region Account${accountCount === 1 ? "" : "s"}. `}
            <Link
              href="/division/users"
              className="text-primary hover:underline"
            >
              Add one from Users
            </Link>{" "}
            with User Type “Region Account”.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setEnabled(new Set(saved))}
              disabled={!isDirty || saving}
            >
              Discard changes
            </Button>
            <Button onClick={handleSave} disabled={!isDirty || saving || loading}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        <AccessGroup
          title="Dashboard"
          description="Sections of the division dashboard shown on the Region Account's home page."
          items={REGION_DASHBOARD_ITEMS}
          enabled={enabled}
          loading={loading}
          disabled={saving}
          onToggle={toggle}
          onSetAll={(on) => setGroup(REGION_DASHBOARD_ITEMS, on)}
        />

        <AccessGroup
          title="SDO Reports"
          description="Division reports listed under SDO Reports. Lock / unlock submissions and class size standards are division office tools and are never offered."
          items={REPORT_ITEMS}
          enabled={enabled}
          loading={loading}
          disabled={saving}
          onToggle={toggle}
          onSetAll={(on) => setGroup(REPORT_ITEMS, on)}
        />
      </div>
    </div>
  );
}

function AccessGroup({
  title,
  description,
  items,
  enabled,
  loading,
  disabled,
  onToggle,
  onSetAll,
}: {
  title: string;
  description: string;
  items: RegionAccessItem[];
  enabled: Set<string>;
  loading: boolean;
  disabled: boolean;
  onToggle: (key: string, on: boolean) => void;
  onSetAll: (on: boolean) => void;
}) {
  const onCount = items.filter((i) => enabled.has(i.key)).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {title}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({onCount} of {items.length} visible)
              </span>
            </CardTitle>
            <CardDescription className="text-xs">{description}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSetAll(true)}
              disabled={loading || disabled}
            >
              Select all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSetAll(false)}
              disabled={loading || disabled}
            >
              Clear
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {items.map((item) => (
              <label
                key={item.key}
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/50"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={enabled.has(item.key)}
                  disabled={disabled}
                  onChange={(e) => onToggle(item.key, e.target.checked)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {item.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
