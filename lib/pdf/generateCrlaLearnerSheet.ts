import { supabase } from "@/lib/supabase/client";
import { CrlaMaterial, CrlaMaterialTask } from "@/types";
import {
  buildDepEdHeaderWithLogos,
  DEPED_BASE_STYLES,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "./utils";

export interface CrlaLearnerSheetParams {
  schoolId: number | null;
  material: CrlaMaterial;
  tasks: CrlaMaterialTask[];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function splitItems(items: string | null): string[] {
  if (!items) return [];
  return items
    .split(/[\n,]/)
    .map((i) => i.trim())
    .filter(Boolean);
}

export async function generateCrlaLearnerSheet(
  params: CrlaLearnerSheetParams,
): Promise<void> {
  const { schoolId, material, tasks } = params;

  let schoolName = "";
  if (schoolId) {
    const { data } = await supabase
      .from("sms_schools")
      .select("name")
      .eq("id", schoolId)
      .single();
    schoolName = data?.name ?? "";
  }

  const tasksHtml = tasks
    .map((t) => {
      const words = splitItems(t.items);
      const cells =
        words.length > 0
          ? `<div class="word-grid">${words
              .map((w) => `<span class="word">${escapeHtml(w)}</span>`)
              .join("")}</div>`
          : `<div class="empty-note">— content not provided —</div>`;
      return `
      <div class="task-block">
        <div class="task-badge">${escapeHtml(t.label.toUpperCase())}</div>
        ${cells}
      </div>`;
    })
    .join("");

  const passageHtml =
    material.passage_text && material.passage_text.trim()
      ? `<div class="passage">
           ${material.passage_title ? `<h3>${escapeHtml(material.passage_title)}</h3>` : ""}
           <p>${escapeHtml(material.passage_text).replace(/\n/g, "<br>")}</p>
         </div>`
      : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${DEPED_BASE_STYLES}
${DEPED_HEADER_LOGOS_STYLES}
.sub-title { text-align:center; font-weight:bold; font-size:12pt; margin: 4px 0 16px; }
.task-block { border:1px solid #999; border-radius:6px; padding: 24px 16px; margin-bottom: 26px; position: relative; }
.task-badge { position:absolute; top:-14px; left:50%; transform:translateX(-50%); background:#5a5a5a; color:#fff; padding:4px 18px; border-radius:14px; font-weight:bold; font-size:11pt; }
.word-grid { display:flex; flex-wrap:wrap; justify-content:center; gap: 14px 42px; }
.word { font-size: 22pt; }
.empty-note { text-align:center; color:#999; font-style:italic; }
.passage { margin-top: 20px; }
.passage h3 { text-align:center; margin-bottom:8px; }
.passage p { font-size: 15pt; line-height: 1.9; text-align: justify; }
.instructions { font-size:10pt; font-style:italic; margin-bottom: 14px; }
</style></head><body>
${buildDepEdHeaderWithLogos(
  `<div class="school-name">${escapeHtml(schoolName || "Department of Education")}</div>
   <div class="form-title">CRLA — Learner Sheet</div>`,
)}
<div class="sub-title">${escapeHtml(material.title)}</div>
${material.instructions ? `<div class="instructions">${escapeHtml(material.instructions)}</div>` : ""}
${tasksHtml}
${passageHtml}
</body></html>`;

  printHTMLContent(html);
}
