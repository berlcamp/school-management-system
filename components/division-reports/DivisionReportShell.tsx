"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import Link from "next/link";
import { ReactNode } from "react";

interface DivisionReportShellProps {
  title: string;
  description?: string;
  filterBar?: ReactNode;
  onExportCsv?: () => void;
  onExportExcel?: () => void;
  exportDisabled?: boolean;
  loading?: boolean;
  children: ReactNode;
}

export function DivisionReportShell({
  title,
  description,
  filterBar,
  onExportCsv,
  onExportExcel,
  exportDisabled,
  loading,
  children,
}: DivisionReportShellProps) {
  return (
    <div>
      <div className="app__title">
        <div className="flex items-center gap-3">
          <Link
            href="/division/reports"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← SDO Reports
          </Link>
        </div>
        <h1 className="app__title_text">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      <div className="app__content space-y-4">
        {(filterBar || onExportCsv || onExportExcel) && (
          <Card>
            <CardContent className="flex flex-wrap items-end gap-3 pt-6">
              <div className="flex flex-1 flex-wrap items-end gap-3">
                {filterBar}
              </div>
              <div className="flex gap-2">
                {onExportCsv && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onExportCsv}
                    disabled={exportDisabled || loading}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    CSV
                  </Button>
                )}
                {onExportExcel && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onExportExcel}
                    disabled={exportDisabled || loading}
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Excel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export function EmptyReportState({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <Download className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{message}</p>
        {action}
      </CardContent>
    </Card>
  );
}
