"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { Award } from "lucide-react";
import { useEffect, useState } from "react";
import { GradeEntryTable } from "./GradeEntryTable";

export default function Page() {
  const [sections, setSections] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedGradingPeriod, setSelectedGradingPeriod] =
    useState<string>("1");
  const [schoolYear, setSchoolYear] = useState<string>("");
  const user = useAppSelector((state) => state.user.user);

  useEffect(() => {
    const getCurrentSchoolYear = () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      if (month >= 5) {
        return `${year}-${year + 1}`;
      } else {
        return `${year - 1}-${year}`;
      }
    };
    setSchoolYear(getCurrentSchoolYear());
  }, []);

  useEffect(() => {
    const fetchSections = async () => {
      const { data } = await supabase
        .from("sms_sections")
        .select("id, name")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name");

      if (data) {
        setSections(data);
      }
    };

    fetchSections();
  }, []);

  useEffect(() => {
    const fetchSubjects = async () => {
      if (!selectedSection) {
        setSubjects([]);
        return;
      }

      const { data: sectionData } = await supabase
        .from("sms_sections")
        .select("grade_level")
        .eq("id", selectedSection)
        .single();

      if (sectionData) {
        const { data } = await supabase
          .from("sms_subjects")
          .select("id, name")
          .eq("grade_level", sectionData.grade_level)
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("name");

        if (data) {
          setSubjects(data);
        }
      }
    };

    fetchSubjects();
  }, [selectedSection]);

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <Award className="h-5 w-5" />
          Grades
        </h1>
      </div>
      <div className="app__content">
        <Card>
          <CardHeader>
            <CardTitle>Grade Entry</CardTitle>
            <CardDescription>
              Select section, subject, and grading period to enter grades
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Section
                </label>
                <Select
                  value={selectedSection}
                  onValueChange={setSelectedSection}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((section) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Subject
                </label>
                <Select
                  value={selectedSubject}
                  onValueChange={setSelectedSubject}
                  disabled={!selectedSection}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((subject) => (
                      <SelectItem key={subject.id} value={subject.id}>
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Grading Period
                </label>
                <Select
                  value={selectedGradingPeriod}
                  onValueChange={setSelectedGradingPeriod}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1st Quarter</SelectItem>
                    <SelectItem value="2">2nd Quarter</SelectItem>
                    <SelectItem value="3">3rd Quarter</SelectItem>
                    <SelectItem value="4">4th Quarter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  School Year
                </label>
                <input
                  type="text"
                  value={schoolYear}
                  onChange={(e) => setSchoolYear(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background"
                  placeholder="2024-2025"
                />
              </div>
            </div>

            {selectedSection &&
              selectedSubject &&
              selectedGradingPeriod &&
              schoolYear && (
                <GradeEntryTable
                  sectionId={selectedSection}
                  subjectId={selectedSubject}
                  gradingPeriod={parseInt(selectedGradingPeriod)}
                  schoolYear={schoolYear}
                />
              )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
