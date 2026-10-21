"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppSelector } from "@/lib/redux/hook";
import { LifeBuoy } from "lucide-react";
import Link from "next/link";

/** Shown in place of a Help Desk page while a super admin has it switched off. */
export function HelpdeskOff() {
  const isSuperAdmin = useAppSelector((state) => state.user.user?.type) === "super admin";
  return (
    <div className="p-6">
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5" aria-hidden="true" />
            The Help Desk is turned off
          </CardTitle>
          <CardDescription>
            {isSuperAdmin
              ? "Turn it on in Help Desk Settings to let users send concerns."
              : "The division office has not opened the Help Desk. Please contact them directly for now."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={isSuperAdmin ? "/division/helpdesk" : "/home"}>
            <Button variant="outline" size="sm">
              {isSuperAdmin ? "Open Help Desk Settings" : "Back to Home"}
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
