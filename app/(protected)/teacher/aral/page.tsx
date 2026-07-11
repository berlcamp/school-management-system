"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ARAL_PROGRAMS } from "@/lib/constants";
import type { AralProgram } from "@/types";
import { BookOpen, Calculator, FlaskConical, Sprout, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

const PROGRAM_ICONS: Record<AralProgram, LucideIcon> = {
  reading: BookOpen,
  mathematics: Calculator,
  science: FlaskConical,
  summer: Sun,
};

export default function Page() {
  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <Sprout className="h-5 w-5" />
          ARAL
        </h1>
        <p className="text-sm text-muted-foreground">
          Intervention program for learners below grade level. Eligible learners
          are drawn from your CRLA, Phil-IRI, RMA and PABASA results.
        </p>
      </div>

      <div className="app__content">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ARAL_PROGRAMS.map((p) => {
            const Icon = PROGRAM_ICONS[p.value];
            return (
              <Link
                key={p.value}
                href={`/teacher/aral/${p.value}`}
                className="block"
              >
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardHeader>
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-lg">{p.label}</CardTitle>
                    <CardDescription className="font-medium">
                      {p.subtitle}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {p.description}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
