"use client";

import { getMasteryBarColor, getMasteryLevel } from "@/lib/utils/mps";

export interface MpsBarItem {
  label: string;
  value: number;
}

interface MpsBarChartProps {
  title?: string;
  items: MpsBarItem[];
  emptyText?: string;
}

export function MpsBarChart({ title, items, emptyText }: MpsBarChartProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-4">
        {title && <div className="text-sm font-medium mb-2">{title}</div>}
        <div className="text-sm text-muted-foreground text-center py-4">
          {emptyText ?? "No data to display"}
        </div>
      </div>
    );
  }

  const maxLabelLen = Math.max(...items.map((i) => i.label.length));
  const labelWidthCh = Math.min(Math.max(maxLabelLen, 12), 28);

  return (
    <div className="rounded-lg border bg-background p-4">
      {title && <div className="text-sm font-medium mb-3">{title}</div>}
      <div className="space-y-2">
        {items.map((item, idx) => {
          const pct = Math.max(0, Math.min(100, item.value));
          const color = getMasteryBarColor(item.value);
          const mastery = getMasteryLevel(item.value);
          return (
            <div key={`${item.label}-${idx}`} className="flex items-center gap-3">
              <div
                className="text-xs text-muted-foreground truncate"
                style={{ width: `${labelWidthCh}ch` }}
                title={item.label}
              >
                {item.label}
              </div>
              <div className="flex-1 relative h-5 rounded bg-muted overflow-hidden">
                <div
                  className={`h-full ${color} transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-xs tabular-nums w-28 text-right">
                {item.value.toFixed(2)}{" "}
                <span className="text-muted-foreground">{mastery.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
