"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getGradeLevelLabel } from "@/lib/constants";
import { Subject } from "@/types";
import { ArrowRight, BookOpen } from "lucide-react";
import Link from "next/link";

interface SubjectCardProps {
  subject: Subject & { section_name?: string; section_id?: string };
  schoolYear: string;
}

export function SubjectCard({ subject, schoolYear }: SubjectCardProps) {
  const isGraded = subject.is_graded !== false;
  // Build URL for grade entry with pre-selected values (only for graded subjects)
  const gradeEntryUrl = isGraded
    ? subject.section_id
      ? `/teacher/grades?section=${subject.section_id}&subject=${subject.id}&schoolYear=${schoolYear}`
      : `/teacher/grades?subject=${subject.id}&schoolYear=${schoolYear}`
    : null;

  const cardContent = (
    <>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          {subject.name}
        </CardTitle>
        <CardDescription>
          {subject.code} • {getGradeLevelLabel(subject.grade_level)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {subject.section_name && (
          <p className="text-sm text-muted-foreground mb-2">
            Section: {subject.section_name}
          </p>
        )}
        {isGraded ? (
          <div className="flex items-center gap-2 text-sm text-primary mt-2">
            <span>Enter Grades</span>
            <ArrowRight className="h-4 w-4" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mt-2">
            No grading required
          </p>
        )}
      </CardContent>
    </>
  );

  if (gradeEntryUrl) {
    return (
      <Link href={gradeEntryUrl}>
        <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
          {cardContent}
        </Card>
      </Link>
    );
  }

  return (
    <Card>
      {cardContent}
    </Card>
  );
}
