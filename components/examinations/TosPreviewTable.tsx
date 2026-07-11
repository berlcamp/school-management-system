"use client";

/**
 * Printable Table of Specification grid (mirrors the DepEd format):
 *   MELC rows × [No. of Days | No. of Items] + six Bloom cognitive columns
 *   grouped under LOTS / MOTS / HOTS, with item numbers placed in each cell,
 *   a Total row, a legend, and a "Prepared by" signatory.
 *
 * Reused for on-screen preview (live, from builder state) and view/print
 * (from persisted rows). Pure render — no data fetching.
 */

import {
  BLOOM_LEVELS,
  THINKING_SKILL_TIERS,
  TOS_DEFAULT_LEGEND,
  type CognitiveLevel,
} from "@/lib/constants/examinations";
import { getGradeLevelLabel } from "@/lib/constants";
import {
  buildPlacementGrid,
  formatItemNumbers,
  generateTosTitle,
} from "@/lib/utils/tos";

export interface TosPreviewHeader {
  title?: string | null;
  subject_name: string;
  grade_level: number;
  exam_type: string;
  school_year: string;
  grading_period: number;
  total_items: number;
  total_days: number;
  prepared_by_name?: string | null;
  prepared_by_position?: string | null;
  legend?: string | null;
}

export interface TosPreviewCompetency {
  id: string | number;
  competency_text: string;
  lc_code?: string | null;
  no_of_days: number;
  no_of_items: number;
}

export interface TosPreviewItem {
  competency_id: string | number;
  item_number: number;
  cognitive_level: CognitiveLevel;
}

interface TosPreviewTableProps {
  header: TosPreviewHeader;
  competencies: TosPreviewCompetency[];
  items: TosPreviewItem[];
}

export function TosPreviewTable({
  header,
  competencies,
  items,
}: TosPreviewTableProps) {
  const grid = buildPlacementGrid(competencies, items);
  const totalItemsPlaced = grid.grandTotal;
  const totalNoOfItems = competencies.reduce(
    (s, c) => s + (Number(c.no_of_items) || 0),
    0,
  );

  const title = header.title?.trim() || generateTosTitle(header);
  const legend = header.legend?.trim() || TOS_DEFAULT_LEGEND;

  return (
    <div className="tos-preview text-[11px] leading-tight text-black">
      {/* Heading */}
      <div className="mb-3 text-center">
        <h2 className="text-sm font-bold uppercase">{title}</h2>
        <p className="text-xs font-semibold">SY {header.school_year}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-black">
          <thead>
            <tr>
              <th
                rowSpan={3}
                className="border border-black px-2 py-1 text-left align-middle"
              >
                MOST ESSENTIAL LEARNING COMPETENCIES
              </th>
              <th
                rowSpan={3}
                className="border border-black px-1 py-1 align-middle"
              >
                No. of Days
              </th>
              <th
                rowSpan={3}
                className="border border-black px-1 py-1 align-middle"
              >
                No. of Items
              </th>
              {THINKING_SKILL_TIERS.map((tier) => (
                <th
                  key={tier.key}
                  colSpan={tier.levels.length}
                  className="border border-black px-1 py-1 text-center"
                >
                  {tier.label}
                </th>
              ))}
            </tr>
            <tr>
              {BLOOM_LEVELS.map((lvl) => (
                <th
                  key={lvl.value}
                  className="border border-black px-1 py-1 text-center font-normal"
                >
                  {lvl.label}
                </th>
              ))}
            </tr>
            <tr>
              <th
                colSpan={BLOOM_LEVELS.length}
                className="border border-black px-1 py-0.5 text-center text-[10px] font-normal italic"
              >
                ITEM PLACEMENT
              </th>
            </tr>
          </thead>
          <tbody>
            {grid.rows.map(({ competency, placement }, idx) => (
              <tr key={competency.id}>
                <td className="border border-black px-2 py-1 align-top">
                  <span className="mr-1 font-medium">{idx + 1}.</span>
                  {competency.competency_text}
                </td>
                <td className="border border-black px-1 py-1 text-center align-top">
                  {Number(competency.no_of_days) || 0}
                </td>
                <td className="border border-black px-1 py-1 text-center align-top">
                  {Number(competency.no_of_items) || 0}
                </td>
                {BLOOM_LEVELS.map((lvl) => (
                  <td
                    key={lvl.value}
                    className="border border-black px-1 py-1 text-center align-top"
                  >
                    {formatItemNumbers(placement.cells[lvl.value].items)}
                  </td>
                ))}
              </tr>
            ))}

            {/* Total row */}
            <tr className="font-bold">
              <td className="border border-black px-2 py-1 text-center">
                Total
              </td>
              <td className="border border-black px-1 py-1 text-center">
                {header.total_days}
              </td>
              <td className="border border-black px-1 py-1 text-center">
                {totalNoOfItems}
              </td>
              {BLOOM_LEVELS.map((lvl) => (
                <td
                  key={lvl.value}
                  className="border border-black px-1 py-1 text-center"
                >
                  {grid.columnTotals[lvl.value] || ""}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {totalItemsPlaced !== header.total_items && (
        <p className="mt-1 text-[10px] italic text-red-600 print:hidden">
          {totalItemsPlaced} of {header.total_items} items placed.
        </p>
      )}

      {/* Legend */}
      <p className="mt-2 text-[10px] italic">Legend: {legend}</p>

      {/* Prepared by */}
      {(header.prepared_by_name || header.prepared_by_position) && (
        <div className="mt-8 text-xs">
          <p>Prepared by:</p>
          <div className="mt-6">
            <p className="font-bold uppercase">
              {header.prepared_by_name || " "}
            </p>
            <p>{header.prepared_by_position}</p>
          </div>
        </div>
      )}

      <p className="mt-3 text-[10px] text-neutral-500 print:hidden">
        Subject: {header.subject_name} · {getGradeLevelLabel(header.grade_level)}{" "}
        · {header.exam_type}
      </p>
    </div>
  );
}
