import { Skeleton } from "@/components/ui/skeleton";

interface TableSkeletonProps {
  /**
   * Number of skeleton rows to display
   * @default 5
   */
  rows?: number;
  /**
   * Column configuration for the skeleton
   * Each column can specify width and content type
   */
  columns?: Array<{
    label: string;
    width?: string;
    align?: "left" | "right" | "center";
    type?: "text" | "avatar" | "badge" | "button";
  }>;
}

const defaultColumns = [
  {
    label: "...",
    align: "left" as const,
    type: "avatar" as const,
  },
  {
    label: "...",
    align: "left" as const,
    type: "badge" as const,
  },
  {
    label: "...",
    align: "right" as const,
    type: "button" as const,
  },
];

export function TableSkeleton({
  rows = 5,
  columns = defaultColumns,
}: TableSkeletonProps) {
  const renderSkeletonCell = (column: (typeof columns)[0]) => {
    const alignClass =
      column.align === "right"
        ? "justify-end"
        : column.align === "center"
        ? "justify-center"
        : "justify-start";

    switch (column.type) {
      case "avatar":
        return (
          <div className={`flex items-center gap-3 ${alignClass}`}>
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        );
      case "badge":
        return (
          <div className={`flex items-center ${alignClass}`}>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        );
      case "button":
        return (
          <div className={`flex items-center ${alignClass}`}>
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        );
      default:
        return (
          <div className={`flex items-center ${alignClass}`}>
            <Skeleton className="h-4 w-32" />
          </div>
        );
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              {columns.map((column, index) => {
                const alignClass =
                  column.align === "right"
                    ? "text-right"
                    : column.align === "center"
                    ? "text-center"
                    : "text-left";
                return (
                  <th
                    key={index}
                    className={`px-6 py-4 ${alignClass} text-xs font-semibold uppercase tracking-wider text-muted-foreground`}
                    style={column.width ? { width: column.width } : undefined}
                  >
                    {column.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background">
            {Array.from({ length: rows }).map((_, index) => (
              <tr key={index} className="transition-colors">
                {columns.map((column, colIndex) => (
                  <td key={colIndex} className="px-6 py-4">
                    {renderSkeletonCell(column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
