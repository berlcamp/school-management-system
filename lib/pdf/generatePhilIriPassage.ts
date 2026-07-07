import { supabase } from "@/lib/supabase/client";
import { PhilIriMaterial, PhilIriQuestion } from "@/types";
import {
  buildDepEdHeaderWithLogos,
  DEPED_BASE_STYLES,
  DEPED_HEADER_LOGOS_STYLES,
  printHTMLContent,
} from "./utils";

export interface PhilIriPassageParams {
  schoolId: number | null;
  material: PhilIriMaterial;
  questions: PhilIriQuestion[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function generatePhilIriPassage(
  params: PhilIriPassageParams,
): Promise<void> {
  const { schoolId, material, questions } = params;

  let schoolName = "";
  if (schoolId) {
    const { data } = await supabase
      .from("sms_schools")
      .select("name")
      .eq("id", schoolId)
      .single();
    schoolName = data?.name ?? "";
  }

  const questionsHtml = questions
    .map(
      (q) =>
        `<li><span class="qtype">[${escapeHtml(q.question_type)}]</span> ${escapeHtml(
          q.question_text,
        )}${q.correct_answer ? `<div class="ans">Answer: ${escapeHtml(q.correct_answer)}</div>` : ""}</li>`,
    )
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${DEPED_BASE_STYLES}
${DEPED_HEADER_LOGOS_STYLES}
.sub-title { text-align:center; font-weight:bold; font-size:12pt; margin: 4px 0 12px; }
.passage p { font-size: 14pt; line-height: 1.9; text-align: justify; }
.passage h3 { text-align:center; margin-bottom:8px; }
.wc { text-align:right; font-size:9pt; color:#555; margin-top:6px; }
.questions { margin-top:18px; }
.questions h4 { margin-bottom:8px; text-transform:uppercase; }
.questions ol { padding-left:22px; }
.questions li { margin-bottom:8px; font-size:11pt; }
.qtype { font-style:italic; color:#555; font-size:9pt; }
.ans { font-size:9pt; color:#0a7; }
</style></head><body>
${buildDepEdHeaderWithLogos(
  `<div class="school-name">${escapeHtml(schoolName || "Department of Education")}</div>
   <div class="form-title">Phil-IRI — Reading Passage</div>`,
)}
<div class="sub-title">${escapeHtml(material.title)}</div>
<div class="passage">
  ${material.passage_title ? `<h3>${escapeHtml(material.passage_title)}</h3>` : ""}
  <p>${material.passage_text ? escapeHtml(material.passage_text).replace(/\n/g, "<br>") : ""}</p>
  <div class="wc">Word count: ${material.word_count}</div>
</div>
<div class="questions">
  <h4>Comprehension Questions</h4>
  <ol>${questionsHtml}</ol>
</div>
</body></html>`;

  printHTMLContent(html);
}
