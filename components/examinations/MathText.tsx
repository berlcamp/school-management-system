/**
 * Renders exam text with its `^{…}` / `_{…}` markup as real superscripts and
 * subscripts (see lib/utils/mathText.ts). Text without markup renders as-is.
 */

import { parseMathText, type MathNode } from "@/lib/utils/mathText";
import { Fragment } from "react";

function renderNodes(nodes: MathNode[]): React.ReactNode {
  return nodes.map((n, i) => {
    if (typeof n === "string") return <Fragment key={i}>{n}</Fragment>;
    const Tag = n.kind === "sup" ? "sup" : "sub";
    return (
      // leading-none keeps a sup/sub from pushing the line apart in print
      <Tag key={i} className="text-[0.75em] leading-none">
        {renderNodes(n.children)}
      </Tag>
    );
  });
}

export function MathText({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return <>{renderNodes(parseMathText(text))}</>;
}
