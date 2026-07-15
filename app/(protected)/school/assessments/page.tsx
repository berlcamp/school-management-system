"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BookOpen, Calculator, NotebookPen, ScrollText } from "lucide-react";
import Link from "next/link";

const ASSESSMENTS = [
  {
    title: "CRLA",
    subtitle: "Comprehensive Rapid Literacy Assessment",
    description:
      "Grades 1–3 · per language (English / Filipino / Mother Tongue). Author learner sheets, reading passages, and reading-profile bands.",
    url: "/school/assessments/crla",
    icon: BookOpen,
  },
  {
    title: "Phil-IRI",
    subtitle: "Philippine Informal Reading Inventory",
    description:
      "Grades 3–10 · per language. Author graded passages and comprehension questions; reading levels are computed from miscues + comprehension.",
    url: "/school/assessments/philiri",
    icon: ScrollText,
  },
  {
    title: "RMA",
    subtitle: "Rapid Mathematics Assessment",
    description:
      "Grades 1–10. Author math items by domain and mastery bands; section advisers record per-student results.",
    url: "/school/assessments/rma",
    icon: Calculator,
  },
];

export default function Page() {
  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <NotebookPen className="h-5 w-5" />
          School Assessments
        </h1>
        <p className="text-sm text-muted-foreground">
          Author diagnostic assessment materials for your own school. Only your
          school&apos;s advisers can use these; the division office&apos;s
          materials remain available to them alongside yours.
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
