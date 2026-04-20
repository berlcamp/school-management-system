import * as XLSX from "xlsx";

export function exportExcel<T extends Record<string, unknown>>(
  rows: T[],
  filename: string,
  sheetName: string = "Report",
) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const outName = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, outName);
}
