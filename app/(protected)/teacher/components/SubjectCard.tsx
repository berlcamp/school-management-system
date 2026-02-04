"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Subject } from "@/types";
import { ArrowRight, BookOpen } from "lucide-react";
import Link from "next/link";

interface SubjectCardProps {
  subject: Subject & { section_name?: string; section_id?: string };
  schoolYear: string;
}

export function SubjectCard({ subject, schoolYear }: SubjectCardProps) {
  // Build URL for grade entry with pre-selected values
  const gradeEntryUrl = subject.section_id
    ? `/teacher/grades?section=${subject.section_id}&subject=${subject.id}&schoolYear=${schoolYear}`
    : `/teacher/grades?subject=${subject.id}&schoolYear=${schoolYear}`;

  return (
    <Link href={gradeEntryUrl}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {subject.name}
          </CardTitle>
          <CardDescription>
            {subject.code} • Grade {subject.grade_level}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subject.section_name && (
            <p className="text-sm text-muted-foreground mb-2">
              Section: {subject.section_name}
            </p>
          )}
          <div className="flex items-center gap-2 text-sm text-primary mt-2">
            <span>Enter Grades</span>
            <ArrowRight className="h-4 w-4" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
