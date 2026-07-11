"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BarChart3,
  FileSpreadsheet,
  FileText,
  ListChecks,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

interface ExamTool {
  title: string;
  subtitle: string;
  description: string;
  url?: string;
  icon: LucideIcon;
  comingSoon?: boolean;
}

const TOOLS: ExamTool[] = [
  {
    title: "Table of Specification",
    subtitle: "TOS · per subject per term",
    description:
      "Create your own TOS or use one shared by the division. Distributes exam items across competencies and Bloom's cognitive levels.",
    url: "/teacher/examinations/tos",
    icon: FileSpreadsheet,
  },
  {
    title: "Exam Creator",
    subtitle: "Build the test from a TOS",
    description:
      "Turn a TOS's item placement into an actual exam, item by item.",
    url: "/teacher/examinations/exam",
    icon: FileText,
  },
  {
    title: "Item Analysis",
    subtitle: "With MPS · from exam results",
    description:
      "Record per-item exam results and compute the Mean Percentage Score with mastery-level and difficulty / discrimination reporting.",
    url: "/teacher/examinations/item-analysis",
    icon: BarChart3,
  },
];

export default function Page() {
  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <ListChecks className="h-5 w-5" />
          Examinations
        </h1>
        <p className="text-sm text-muted-foreground">
          Build your examination tools, or use the ones shared by the division.
        </p>
      </div>

      <div className="app__content">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => {
            const card = (
              <Card
                className={`h-full ${
                  t.comingSoon
                    ? "opacity-70"
                    : "transition-shadow hover:shadow-md"
                }`}
              >
                <CardHeader>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <t.icon className="h-5 w-5" />
                    </div>
                    {t.comingSoon && (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        Available soon
                      </span>
                    )}
                  </div>
                  <CardTitle className="text-lg">{t.title}</CardTitle>
                  <CardDescription className="font-medium">
                    {t.subtitle}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t.description}
                  </p>
                </CardContent>
              </Card>
            );

            return t.comingSoon || !t.url ? (
              <div
                key={t.title}
                className="block cursor-not-allowed"
                aria-disabled
              >
                {card}
              </div>
            ) : (
              <Link key={t.title} href={t.url} className="block">
                {card}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
