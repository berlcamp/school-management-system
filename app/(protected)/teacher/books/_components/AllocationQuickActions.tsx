"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BookOpen,
  ClipboardCheck,
  RotateCcw,
  UserPlus,
} from "lucide-react";
import Link from "next/link";

interface AllocationQuickActionsProps {
  heldCount: number;
}

export function AllocationQuickActions({ heldCount }: AllocationQuickActionsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card className="transition-colors hover:bg-muted/50">
        <Link href="/teacher/books/issue">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4" />
              Issue to Students
            </CardTitle>
            <CardDescription>
              Issue allocated books to learners in your sections.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm">
              <BookOpen className="h-4 w-4 mr-1.5" />
              Go to Issue
            </Button>
          </CardContent>
        </Link>
      </Card>

      <Card className="transition-colors hover:bg-muted/50">
        <Link href="/teacher/books/issuances">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-4 w-4" />
              Record Student Returns
            </CardTitle>
            <CardDescription>
              Record when students return books to you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm">
              Record Returns
            </Button>
          </CardContent>
        </Link>
      </Card>

      <Card className="transition-colors hover:bg-muted/50">
        <Link href="/teacher/books/return-to-manager">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RotateCcw className="h-4 w-4" />
              Return to Book Manager
            </CardTitle>
            <CardDescription>
              Submit books returned by students back to the book manager.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm">
              {heldCount > 0 ? (
                <>Return {heldCount} books</>
              ) : (
                "Go to Return"
              )}
            </Button>
          </CardContent>
        </Link>
      </Card>
    </div>
  );
}
