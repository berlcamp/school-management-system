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
  BookOpen,
  Calculator,
  NotebookPen,
  ScrollText,
} from "lucide-react";
import Link from "next/link";

const ASSESSMENTS = [
  {
    title: "CRLA",
    subtitle: "Comprehensive Rapid Literacy Assessment",
    description:
      "Grades 1–3 · per language (English / Filipino / Mother Tongue). Author learner sheets, reading passages, and reading-profile bands.",
    url: "/division/assessments/crla",
    icon: BookOpen,
  },
  {
    title: "Phil-IRI",
    subtitle: "Philippine Informal Reading Inventory",
    description:
      "Grades 3–10 · per language. Author graded passages and comprehension questions; reading levels are computed from miscues + comprehension.",
    url: "/division/assessments/philiri",
    icon: ScrollText,
  },
  {
    title: "RMA",
    subtitle: "Rapid Mathematics Assessment",
    description:
      "Grades 1–10. Author math items by domain and mastery bands; section advisers record per-student results.",
    url: "/division/assessments/rma",
    icon: Calculator,
  },
  {
    title: "Reports",
    subtitle: "Division-wide summary",
    description:
      "Reading-profile / reading-level / mastery distribution per school, filterable by school year, phase, grade, and language. Printable.",
    url: "/division/assessments/reports",
    icon: BarChart3,
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
          Author the materials for the division&apos;s diagnostic assessments.
          Section advisers use these to assess and record per-student results.
        </p>
      </div>

      <div className="app__content">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ASSESSMENTS.map((a) => (
            <Link key={a.title} href={a.url} className="block">
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <a.icon className="h-5 w-5" />
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
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
