import { supabase } from "@/lib/supabase/client";
import { RmaItem, RmaMaterial } from "@/types";
import {
  buildDepEdHeaderWithLogos,
  DEPED_BASE_STYLES,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "./utils";

export interface RmaItemSheetParams {
  schoolId: number | null;
  material: RmaMaterial;
  items: RmaItem[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function generateRmaItemSheet(
  params: RmaItemSheetParams,
): Promise<void> {
  const { schoolId, material, items } = params;

  let schoolName = "";
  if (schoolId) {
    const { data } = await supabase
      .from("sms_schools")
      .select("name")
      .eq("id", schoolId)
      .single();
    schoolName = data?.name ?? "";
  }

  const rows = items
    .map(
      (it, i) =>
        `<tr>
          <td class="c">${i + 1}</td>
          <td class="c">${escapeHtml(it.domain ?? "")}</td>
          <td>${escapeHtml(it.question_text ?? "")}</td>
          <td class="c">${Number(it.max_score)}</td>
        </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${DEPED_BASE_STYLES}
${DEPED_HEADER_LOGOS_STYLES}
.sub-title { text-align:center; font-weight:bold; font-size:12pt; margin: 4px 0 12px; }
.instructions { font-size:10pt; font-style:italic; margin-bottom: 12px; }
table.sheet { width:100%; border-collapse:collapse; }
table.sheet th, table.sheet td { border:1px solid #000; padding:6px 8px; font-size:11pt; }
table.sheet th { background:#eee; text-align:center; }
td.c { text-align:center; }
</style></head><body>
${buildDepEdHeaderWithLogos(
  `<div class="school-name">${escapeHtml(schoolName || "Department of Education")}</div>
   <div class="form-title">RMA — Item Sheet</div>`,
)}
<div class="sub-title">${escapeHtml(material.title)}</div>
${material.instructions ? `<div class="instructions">${escapeHtml(material.instructions)}</div>` : ""}
<table class="sheet">
  <thead>
    <tr><th>#</th><th>Domain</th><th>Item</th><th>Points</th></tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;

  printHTMLContent(html);
}
