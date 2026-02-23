"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppSelector } from "@/lib/redux/hook";
import { Building2 } from "lucide-react";

/**
 * Guard for non-division_admin users: ensures school_id is present.
 * division_admin users can have null school_id (division-level).
 * Other roles (school_head, teacher, registrar, admin, etc.) must have school_id.
 */
export function SchoolIdGuard({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((state) => state.user.user);

  if (!user) {
    return null;
  }

  // division_admin operates at division level; school_id can be null
  if (user.type === "division_admin") {
    return <>{children}</>;
  }

  // Non-division users must have school_id assigned
  if (user.school_id != null) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="max-w-md border-amber-500/50 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
            <Building2 className="h-6 w-6" />
            No School Assigned
          </CardTitle>
          <CardDescription>
            Your account is not assigned to a school. Please contact your
            administrator to assign you to a school before accessing this area.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            If you believe this is an error, please reach out to your division
            administrator.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
