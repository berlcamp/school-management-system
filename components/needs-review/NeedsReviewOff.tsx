"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/** Shown on a Needs Review page while a super admin has it switched off (migration 227). */
export function NeedsReviewOff() {
  return (
    <div className="p-6">
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Needs Review is turned off</CardTitle>
          <CardDescription>
            The division office has turned this page off for now. Nothing has been lost; it will be
            back when it is turned on again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/home">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
