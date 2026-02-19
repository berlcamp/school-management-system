"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getGradeLevelLabel } from "@/lib/constants";
import { Section } from "@/types";
import { Users } from "lucide-react";
import Link from "next/link";

interface SectionCardProps {
  section: Section & { student_count?: number };
  schoolYear: string;
}

export function SectionCard({ section, schoolYear }: SectionCardProps) {
  return (
    <Link href={`/teacher/sections/${section.id}`}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {section.name}
          </CardTitle>
          <CardDescription>
            {getGradeLevelLabel(section.grade_level)} • {schoolYear}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {section.student_count !== undefined && (
            <p className="text-sm text-muted-foreground">
              {section.student_count} student
              {section.student_count !== 1 ? "s" : ""}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
