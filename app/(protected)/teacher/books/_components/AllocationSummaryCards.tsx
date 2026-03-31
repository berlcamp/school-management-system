"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BookAvailabilitySummary } from "@/lib/utils/books";

interface AllocationSummaryCardsProps {
  summary: BookAvailabilitySummary;
}

export function AllocationSummaryCards({ summary }: AllocationSummaryCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Allocated
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{summary.totalAllocated}</div>
          <p className="text-xs text-muted-foreground">
            Books from book manager
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            With Students
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {summary.withStudents}
          </div>
          <p className="text-xs text-muted-foreground">
            Currently issued to learners
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Held (to return)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {summary.held}
          </div>
          <p className="text-xs text-muted-foreground">
            Returned by students, ready to return to manager
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Available to Issue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {summary.available}
          </div>
          <p className="text-xs text-muted-foreground">
            Can issue to students
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
