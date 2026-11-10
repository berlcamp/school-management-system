"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { refreshMenuAccess } from "@/hooks/useMenuAccess";
import { USER_TYPE_LABELS } from "@/lib/constants/userTypes";
import {
  defaultMenuUrls,
  MENU_ACCESS_USER_TYPES,
  menuCatalogue,
} from "@/lib/nav/buildNavSections";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  cellKey,
  diffCells,
  effectiveCells,
  type MenuAccessRow,
} from "@/lib/utils/rolePermissions";
import { RotateCcw, Search } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

const TYPES: readonly string[] = MENU_ACCESS_USER_TYPES;

export function RolePermissionsMatrix() {
  const catalogue = useMemo(() => menuCatalogue(), []);
  const urls = useMemo(() => catalogue.map((i) => i.url), [catalogue]);
  const defaults = useMemo(
    () => new Map(TYPES.map((t) => [t, defaultMenuUrls(t)])),
    [],
  );

  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("sms_role_menu_access")
      .select("user_type, item_key, is_enabled");
    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    const cells = effectiveCells(TYPES, urls, defaults, (data ?? []) as MenuAccessRow[]);
    setSaved(cells);
    setDraft(new Set(cells));
    setLoading(false);
  }, [urls, defaults]);

  useEffect(() => {
    void load();
  }, [load]);

  const changes = useMemo(
    () => diffCells(TYPES, urls, defaults, saved, draft),
    [urls, defaults, saved, draft],
  );
  const dirty = changes.length > 0;

  // Leaving with unsaved ticks loses them; the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = catalogue.filter(
      (i) => !q || i.title.toLowerCase().includes(q) || i.url.toLowerCase().includes(q),
    );
    const bySection = new Map<string, typeof visible>();
    for (const item of visible) {
      const list = bySection.get(item.section) ?? [];
      list.push(item);
      bySection.set(item.section, list);
    }
    return [...bySection.entries()];
  }, [catalogue, query]);

  const toggle = (type: string, url: string, on: boolean) => {
    setDraft((prev) => {
      const next = new Set(prev);
      const key = cellKey(type, url);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const resetToDefaults = () => {
    const next = new Set<string>();
    for (const type of TYPES) {
      for (const url of defaults.get(type) ?? []) next.add(cellKey(type, url));
    }
    setDraft(next);
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("role_menu_access_save", {
      p_changes: changes,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      `Saved ${changes.length} ${changes.length === 1 ? "change" : "changes"}. Staff see it on their next page load.`,
    );
    setSaved(new Set(draft));
    refreshMenuAccess();
  };

  if (loading) return <Skeleton className="h-96 w-full" />;
  if (loadError) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Could not load role permissions: {loadError}
      </div>
    );
  }

  const countFor = (type: string) =>
    urls.filter((url) => draft.has(cellKey(type, url))).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search pages"
            placeholder="Search pages"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm border border-sky-300 bg-sky-50" aria-hidden="true" />
              Differs from built-in
            </li>
            <li className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm border border-amber-300 bg-amber-100" aria-hidden="true" />
              Unsaved change
            </li>
          </ul>
          <Button variant="outline" size="sm" onClick={resetToDefaults} disabled={saving}>
            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
            All to built-in
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDraft(new Set(saved))} disabled={!dirty || saving}>
            Discard
          </Button>
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving…" : dirty ? `Save ${changes.length} ${changes.length === 1 ? "change" : "changes"}` : "Saved"}
          </Button>
        </div>
      </div>

      <div
        className="max-h-[calc(100dvh-16rem)] min-h-80 overflow-auto rounded-lg border bg-white"
        role="region"
        aria-label="Role permissions"
        tabIndex={0}
      >
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-30 w-44 min-w-44 border-b border-r bg-muted px-4 py-3 text-left align-bottom text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:w-64 sm:min-w-64"
              >
                Page
              </th>
              {TYPES.map((type) => (
                <th
                  key={type}
                  scope="col"
                  className="sticky top-0 z-20 w-24 min-w-24 border-b bg-muted px-2 py-3 text-center align-bottom font-medium"
                >
                  <span className="flex flex-col items-center gap-1">
                    <span className="text-xs leading-tight text-balance">
                      {USER_TYPE_LABELS[type] ?? type}
                    </span>
                    <span className="text-[11px] font-normal tabular-nums text-muted-foreground">
                      {countFor(type)}/{urls.length}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(([section, items]) => (
              <Fragment key={section}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={TYPES.length + 1}
                    className="border-b bg-slate-50 p-0 text-left"
                  >
                    <span className="sticky left-0 inline-block px-4 pb-1.5 pt-4 text-xs font-semibold uppercase tracking-wide text-primary">
                      {section || "General"}
                    </span>
                  </th>
                </tr>
                {items.map((item) => (
                  <tr key={item.url} className="group/row">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 w-44 min-w-44 border-b border-r bg-white px-4 py-2 text-left font-normal group-hover/row:bg-muted sm:w-64 sm:min-w-64"
                    >
                      <span className="flex items-center gap-2 leading-snug">
                        <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        {item.title}
                      </span>
                      <code className="block font-mono text-xs text-muted-foreground">{item.url}</code>
                    </th>
                    {TYPES.map((type) => {
                      const key = cellKey(type, item.url);
                      const checked = draft.has(key);
                      const changed = checked !== saved.has(key);
                      const differs = checked !== (defaults.get(type)?.has(item.url) ?? false);
                      return (
                        <td
                          key={type}
                          className={cn(
                            "border-b p-0 text-center group-hover/row:bg-muted/60",
                            differs && "bg-sky-50",
                            changed && "bg-amber-100 group-hover/row:bg-amber-100",
                          )}
                        >
                          <label className="flex min-h-11 w-full cursor-pointer items-center justify-center">
                            <Checkbox
                              checked={checked}
                              disabled={saving}
                              onChange={(e) => toggle(type, item.url, e.target.checked)}
                              aria-label={`${USER_TYPE_LABELS[type] ?? type}: ${item.title}`}
                            />
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Unticking a page hides its link and blocks the page for that staff type. Ticking a
        page adds the link, but the page&apos;s own rules still apply, and so do the database
        rules — a page built for another role may show nothing. Users, Schools, Module
        Settings and this page stay with the Super Admin.
      </p>
    </div>
  );
}
