"use client";

/**
 * Custom Report Builder — the escape hatch beside the fixed SDO reports.
 *
 * The user picks a dataset, the columns and the filters; migration 166's RPC
 * validates all three against its own catalogue and returns a JSONB object per
 * row. Nothing runs until Run is pressed: a twelve-column pick over every
 * school in the division is not a keystroke preview.
 */

import {
  DivisionReportShell,
  EmptyReportState,
  ReportTableCard,
} from "@/components/division-reports/DivisionReportShell";
import {
  ALL_SCHOOLS,
  SchoolFilter,
} from "@/components/division-reports/SchoolFilter";
import { SchoolYearFilter } from "@/components/division-reports/SchoolYearFilter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { generateCustomReportPrint } from "@/lib/pdf";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import {
  countReport,
  describeFilters,
  exportHeaders,
  fetchReportDatasets,
  formatReportValue,
  isCompleteFilter,
  orderedFields,
  ReportDataset,
  ReportFilter,
  ReportRow,
  REPORT_PAGE_SIZE,
  runReport,
  runReportAll,
  toExportRows,
} from "@/lib/utils/reportBuilder";
import { exportCsv } from "@/lib/utils/exportCsv";
import { exportExcel } from "@/lib/utils/exportExcel";
import { getCurrentSchoolYear } from "@/lib/utils/schoolYear";
import { ArrowDown, ArrowUp, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ColumnPicker } from "./components/ColumnPicker";
import { FilterBuilder } from "./components/FilterBuilder";

/**
 * The report the table on screen actually is, frozen when Run was pressed.
 * Paging and sorting refetch against this, never against edits made since —
 * otherwise page 2 would answer a different question from page 1.
 */
interface RunSpec {
  datasetKey: string;
  columns: string[];
  filters: ReportFilter[];
  schoolId: number | null;
  schoolYear: string | null;
}

interface SchoolHead {
  name: string;
  position: string | null;
}

export default function Page() {
  const user = useAppSelector((state) => state.user.user);

  const [datasets, setDatasets] = useState<ReportDataset[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(true);

  const [datasetKey, setDatasetKey] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<ReportFilter[]>([]);
  const [schoolId, setSchoolId] = useState<string>(ALL_SCHOOLS);
  const [schoolYear, setSchoolYear] = useState(getCurrentSchoolYear());

  const [spec, setSpec] = useState<RunSpec | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [schoolHead, setSchoolHead] = useState<SchoolHead | null>(null);

  const dataset = useMemo(
    () => datasets.find((d) => d.key === datasetKey) ?? null,
    [datasets, datasetKey],
  );

  // The dataset the results belong to, which is not necessarily the one now
  // selected in the picker.
  const ranDataset = useMemo(
    () => datasets.find((d) => d.key === spec?.datasetKey) ?? null,
    [datasets, spec],
  );

  useEffect(() => {
    let isMounted = true;

    fetchReportDatasets()
      .then((data) => {
        if (!isMounted) return;
        setDatasets(data);
        if (data.length > 0) setDatasetKey((current) => current || data[0].key);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        toast.error(
          err instanceof Error ? err.message : "Failed to load the datasets",
        );
      })
      .finally(() => {
        if (isMounted) setCatalogueLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Signatory for the printable. One school is noted by its own head; the
  // division-wide cut has no such record, so it prints a blank line under the
  // SDO title instead.
  useEffect(() => {
    let isMounted = true;

    if (schoolId === ALL_SCHOOLS) {
      setSchoolHead(null);
      return;
    }

    supabase
      .from("sms_users")
      .select("name, position")
      .eq("school_id", Number(schoolId))
      .eq("type", "school_head")
      .eq("is_active", true)
      .limit(1)
      .then(({ data, error }) => {
        if (!isMounted || error) return;
        const head = data?.[0];
        setSchoolHead(
          head
            ? { name: head.name as string, position: head.position as string }
            : null,
        );
      });

    return () => {
      isMounted = false;
    };
  }, [schoolId]);

  // A new dataset means new columns, new filters and results that no longer
  // describe anything.
  useEffect(() => {
    if (!dataset) return;
    setColumns(
      dataset.fields.filter((f) => f.default_selected).map((f) => f.field_key),
    );
    setFilters([]);
    setSpec(null);
    setRows([]);
    setTotal(0);
    setPage(0);
    setSortField(null);
    setSortDir("asc");
  }, [dataset]);

  const load = useCallback(async () => {
    if (!spec) return;

    setLoading(true);
    try {
      const [pageRows, count] = await Promise.all([
        runReport({
          dataset: spec.datasetKey,
          columns: spec.columns,
          filters: spec.filters,
          schoolId: spec.schoolId,
          schoolYear: spec.schoolYear,
          sortField,
          sortDir,
          limit: REPORT_PAGE_SIZE,
          offset: page * REPORT_PAGE_SIZE,
        }),
        countReport({
          dataset: spec.datasetKey,
          filters: spec.filters,
          schoolId: spec.schoolId,
          schoolYear: spec.schoolYear,
        }),
      ]);
      setRows(pageRows);
      setTotal(count);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "The report failed");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [spec, page, sortField, sortDir]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRun = () => {
    if (!dataset) return;

    const incomplete = filters.filter((f) => !isCompleteFilter(f));
    if (incomplete.length > 0) {
      toast.error("Every filter needs a value before the report can run.");
      return;
    }

    setPage(0);
    setSortField(null);
    setSortDir("asc");
    setSpec({
      datasetKey: dataset.key,
      columns,
      filters,
      schoolId: schoolId === ALL_SCHOOLS ? null : Number(schoolId),
      schoolYear: dataset.school_year_column ? schoolYear : null,
    });
  };

  const toggleSort = (fieldKey: string) => {
    if (sortField === fieldKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(fieldKey);
      setSortDir("asc");
    }
    setPage(0);
  };

  // The columns actually on screen: the RPC falls back to the dataset's
  // defaults when nothing was picked, so read them off the first row rather
  // than assuming the picker's list.
  const shownFields = useMemo(() => {
    if (!ranDataset || !spec) return [];
    if (spec.columns.length > 0) return orderedFields(ranDataset, spec.columns);
    const first = rows[0];
    if (!first) {
      return ranDataset.fields.filter((f) => f.default_selected);
    }
    return ranDataset.fields.filter((f) =>
      Object.prototype.hasOwnProperty.call(first, f.field_key),
    );
  }, [ranDataset, spec, rows]);

  /** Every row the report matches, up to the server's own cap. */
  const fetchAllRows = useCallback(async (): Promise<ReportRow[]> => {
    if (!spec) return [];
    return runReportAll({
      dataset: spec.datasetKey,
      columns: spec.columns,
      filters: spec.filters,
      schoolId: spec.schoolId,
      schoolYear: spec.schoolYear,
      sortField,
      sortDir,
    });
  }, [spec, sortField, sortDir]);

  const exportAll = async (
    kind: "csv" | "excel",
  ): Promise<void> => {
    if (!spec || !ranDataset) return;

    setExporting(true);
    try {
      const all = await fetchAllRows();
      const exportRows = toExportRows(shownFields, all);
      const name = `${ranDataset.key}-report${
        spec.schoolYear ? `-${spec.schoolYear}` : ""
      }`;

      if (kind === "csv") {
        exportCsv(exportRows, exportHeaders(shownFields), name);
      } else {
        exportExcel(exportRows, name, ranDataset.label);
      }

      if (all.length < total) {
        toast.success(
          `Exported the first ${all.length} of ${total} rows — narrow the filters for the rest.`,
        );
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "The export failed");
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = async (): Promise<void> => {
    if (!spec || !ranDataset) return;

    setExporting(true);
    try {
      const all = await fetchAllRows();
      await generateCustomReportPrint({
        schoolId: spec.schoolId,
        datasetLabel: ranDataset.label,
        schoolYear: spec.schoolYear,
        filterSummary: describeFilters(ranDataset, spec.filters),
        fields: shownFields,
        rows: all,
        preparedBy: user?.name ?? "",
        notedByName: schoolHead?.name ?? null,
        notedByTitle:
          spec.schoolId === null
            ? "Schools Division Superintendent"
            : (schoolHead?.position ?? "School Head"),
      });
      if (all.length < total) {
        toast.success(
          `Printing the first ${all.length} of ${total} rows — narrow the filters for the rest.`,
        );
      }
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate the printout",
      );
    } finally {
      setExporting(false);
    }
  };

  const summary = useMemo(() => {
    if (!spec || !ranDataset) return [];
    const parts = [ranDataset.label];
    parts.push(spec.schoolId === null ? "All Schools" : "One school");
    if (spec.schoolYear) parts.push(spec.schoolYear);
    return [...parts, ...describeFilters(ranDataset, spec.filters)];
  }, [spec, ranDataset]);

  const lastPage = Math.max(0, Math.ceil(total / REPORT_PAGE_SIZE) - 1);

  const filterBar = (
    <>
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Dataset</Label>
        <Select value={datasetKey} onValueChange={setDatasetKey}>
          <SelectTrigger className="h-9 w-[220px]">
            <SelectValue placeholder="Choose a dataset" />
          </SelectTrigger>
          <SelectContent>
            {datasets.map((d) => (
              <SelectItem key={d.key} value={d.key}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <SchoolFilter value={schoolId} onChange={setSchoolId} allowAll />

      {dataset?.school_year_column && (
        <SchoolYearFilter value={schoolYear} onChange={setSchoolYear} />
      )}
    </>
  );

  return (
    <DivisionReportShell
      title="Custom Report Builder"
      description="Choose a dataset, the columns you need and the filters that narrow it. Everything the fixed reports do not already answer."
      filterBar={filterBar}
      onExportCsv={() => exportAll("csv")}
      onExportExcel={() => exportAll("excel")}
      onPrint={handlePrint}
      exportDisabled={!spec || total === 0 || exporting}
      recordCount={spec ? total : undefined}
    >
      <Card>
        <CardContent className="space-y-4 p-4">
          {catalogueLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : !dataset ? (
            <p className="text-sm text-muted-foreground">
              No datasets are available.
            </p>
          ) : (
            <>
              {dataset.description && (
                <p className="text-xs text-muted-foreground">
                  {dataset.description}
                </p>
              )}
              <ColumnPicker
                fields={dataset.fields}
                value={columns}
                onChange={setColumns}
              />
              <Separator />
              <FilterBuilder
                fields={dataset.fields}
                filters={filters}
                onChange={setFilters}
              />
              <Separator />
              <div className="flex items-center gap-3">
                <Button onClick={handleRun} disabled={loading}>
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  Run report
                </Button>
                {spec && (
                  <span className="text-xs text-muted-foreground">
                    {summary.join(" · ")}
                  </span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {!spec ? (
        <EmptyReportState message="Choose your columns and filters, then run the report." />
      ) : loading ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyReportState message="No rows match this report." />
      ) : (
        <>
          <ReportTableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  {shownFields.map((field) => (
                    <TableHead key={field.field_key}>
                      <button
                        type="button"
                        onClick={() => toggleSort(field.field_key)}
                        className="flex items-center gap-1 hover:text-foreground"
                      >
                        {field.label}
                        {sortField === field.field_key &&
                          (sortDir === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          ))}
                      </button>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={index}>
                    {shownFields.map((field) => (
                      <TableCell key={field.field_key}>
                        {formatReportValue(field, row[field.field_key])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ReportTableCard>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {page * REPORT_PAGE_SIZE + 1}–
              {page * REPORT_PAGE_SIZE + rows.length} of {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                disabled={page >= lastPage}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </DivisionReportShell>
  );
}
