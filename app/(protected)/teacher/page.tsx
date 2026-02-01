"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { BookOpen, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const user = useAppSelector((state) => state.user.user);
  const [sections, setSections] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);

  useEffect(() => {
    if (user?.system_user_id) {
      fetchSections();
      fetchSubjects();
    }
  }, [user]);

  const fetchSections = async () => {
    if (!user?.system_user_id) return;
    const { data } = await supabase
      .from("sms_sections")
      .select("*")
      .eq("section_adviser_id", user.system_user_id)
      .eq("is_active", true)
      .is("deleted_at", null);

    if (data) {
      setSections(data);
    }
  };

  const fetchSubjects = async () => {
    if (!user?.system_user_id) return;
    const { data } = await supabase
      .from("sms_subjects")
      .select("*")
      .eq("subject_teacher_id", user.system_user_id)
      .eq("is_active", true)
      .is("deleted_at", null);

    if (data) {
      setSubjects(data);
    }
  };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text">Teacher Portal</h1>
      </div>
      <div className="app__content">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                My Sections
              </CardTitle>
              <CardDescription>
                Sections where you are the adviser
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sections.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  You are not assigned as an adviser to any section.
                </p>
              ) : (
                <div className="space-y-2">
                  {sections.map((section) => (
                    <Link
                      key={section.id}
                      href={`/teacher/sections/${section.id}`}
                      className="block p-3 border rounded-md hover:bg-muted transition-colors"
                    >
                      <div className="font-medium">{section.name}</div>
                      <div className="text-sm text-muted-foreground">
                        Grade {section.grade_level} • {section.school_year}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                My Subjects
              </CardTitle>
              <CardDescription>Subjects assigned to you</CardDescription>
            </CardHeader>
            <CardContent>
              {subjects.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No subjects assigned to you.
                </p>
              ) : (
                <div className="space-y-2">
                  {subjects.map((subject) => (
                    <Link
                      key={subject.id}
                      href={`/teacher/subjects/${subject.id}`}
                      className="block p-3 border rounded-md hover:bg-muted transition-colors"
                    >
                      <div className="font-medium">{subject.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {subject.code} • Grade {subject.grade_level}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
