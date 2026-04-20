export function exportCsv(
  rows: readonly Record<string, unknown>[],
  headers: readonly string[],
  filename: string,
) {
  const headerRow = headers.join(",");
  const body = rows.map((row) =>
    headers
      .map((h) => {
        const value = row[h];
        const str = value === null || value === undefined ? "" : String(value);
        const escaped = str.replace(/"/g, '""');
        return `"${escaped}"`;
      })
      .join(","),
  );
  const csv = [headerRow, ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
