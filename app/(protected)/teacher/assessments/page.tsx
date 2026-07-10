"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BookOpen,
  BookText,
  Calculator,
  Link2,
  NotebookPen,
  ScrollText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

interface Assessment {
  title: string;
  subtitle: string;
  description: string;
  url?: string;
  icon: LucideIcon;
  comingSoon?: boolean;
}

const ASSESSMENTS: Assessment[] = [
  {
    title: "CRLA",
    subtitle: "Comprehensive Rapid Literacy Assessment",
    description:
      "Grades 1–3. Print the learner sheet & scoresheet, then record each learner's reading profile.",
    url: "/teacher/assessments/crla",
    icon: BookOpen,
  },
  {
    title: "Phil-IRI",
    subtitle: "Philippine Informal Reading Inventory",
    description:
      "Grades 3–10. Record miscues and comprehension; reading level is computed automatically.",
    url: "/teacher/assessments/philiri",
    icon: ScrollText,
  },
  {
    title: "RMA",
    subtitle: "Rapid Mathematics Assessment",
    description:
      "Grades 1–10. Record item results; mastery band is computed automatically.",
    url: "/teacher/assessments/rma",
    icon: Calculator,
  },
  {
    title: "PABASA",
    subtitle: "Pabasa Reading Program",
    description:
      "Grades 11–12 · Filipino & English. Mark each learner's reading readiness (Average / Fast / Spontaneous).",
    url: "/teacher/assessments/pabasa",
    icon: BookText,
  },
  {
    title: "LiNK",
    subtitle: "Literacy and Numeracy Knowledge",
    description:
      "Combined literacy and numeracy diagnostic for the learners in your advisory section.",
    icon: Link2,
    comingSoon: true,
  },
];

export default function Page() {
  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <NotebookPen className="h-5 w-5" />
          Assessments
        </h1>
        <p className="text-sm text-muted-foreground">
          Diagnostic assessments for the learners in your advisory section.
        </p>
      </div>

      <div className="app__content">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ASSESSMENTS.map((a) => {
            const card = (
              <Card
                className={`h-full ${
                  a.comingSoon
                    ? "opacity-70"
                    : "transition-shadow hover:shadow-md"
                }`}
              >
                <CardHeader>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <a.icon className="h-5 w-5" />
                    </div>
                    {a.comingSoon && (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        Available soon
                      </span>
                    )}
                  </div>
                  <CardTitle className="text-lg">{a.title}</CardTitle>
                  <CardDescription className="font-medium">
                    {a.subtitle}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {a.description}
                  </p>
                </CardContent>
              </Card>
            );

            return a.comingSoon || !a.url ? (
              <div
                key={a.title}
                className="block cursor-not-allowed"
                aria-disabled
              >
                {card}
              </div>
            ) : (
              <Link key={a.title} href={a.url} className="block">
                {card}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
