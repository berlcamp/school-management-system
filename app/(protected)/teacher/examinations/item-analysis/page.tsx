"use client";

import { ItemAnalysisPanel } from "@/components/examinations/ItemAnalysisPanel";
import { BarChart3 } from "lucide-react";
import Link from "next/link";

export default function Page() {
  return (
    <div>
      <div className="app__title">
        <Link
          href="/teacher/examinations"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Examinations
        </Link>
        <h1 className="app__title_text flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Item Analysis
        </h1>
        <p className="text-sm text-muted-foreground">
          Record each learner&apos;s correct items per exam, then view the item
          analysis and Mean Percentage Score.
        </p>
      </div>
      <div className="app__content">
        <ItemAnalysisPanel />
      </div>
    </div>
  );
}
