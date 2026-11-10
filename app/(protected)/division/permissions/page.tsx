"use client";

/**
 * Role Permissions (migration 232) — super admin only. One checkbox per
 * (staff type, menu page): ticked adds the page to that staff type's menu,
 * unticked removes it and blocks the page. The starting ticks are each type's
 * built-in menu, so nothing changes until a box is changed.
 *
 * Menu and page access only: what a role may read or write in the database is
 * still decided by the RLS policies.
 */

import { SuperAdminOnlyGuard } from "@/components/SuperAdminOnlyGuard";
import { ShieldCheck } from "lucide-react";
import { RolePermissionsMatrix } from "./components/RolePermissionsMatrix";

export default function Page() {
  return (
    <SuperAdminOnlyGuard>
      <div>
        <div className="app__title">
          <h1 className="app__title_text flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            Role Permissions
          </h1>
          <p className="text-sm text-muted-foreground">
            Choose which menu pages each staff type can open. The starting ticks are
            the built-in menus; a Super Admin always sees everything.
          </p>
        </div>
        <div className="p-4">
          <RolePermissionsMatrix />
        </div>
      </div>
    </SuperAdminOnlyGuard>
  );
}
