"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { getSchoolYearOptions } from "@/lib/utils/schoolYear";
import { Filter as FilterIcon, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

export const Filter = ({
  filter,
  setFilter,
}: {
  filter: {
    keyword: string;
    section_id?: string;
    teacher_id?: string;
    room_id?: string;
    school_year?: string;
  };
  setFilter: (filter: {
    keyword: string;
    section_id?: string;
    teacher_id?: string;
    room_id?: string;
    school_year?: string;
  }) => void;
}) => {
  const [keyword, setKeyword] = useState(filter.keyword || "");
  const [sectionId, setSectionId] = useState(filter.section_id || "all");
  const [teacherId, setTeacherId] = useState(filter.teacher_id || "all");
  const [roomId, setRoomId] = useState(filter.room_id || "all");
  const [schoolYear, setSchoolYear] = useState(filter.school_year || "");
  const [isOpen, setIsOpen] = useState(false);
  const [sections, setSections] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [teachers, setTeachers] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([]);
  const user = useAppSelector((state) => state.user.user);

  // Fetch dropdown options
  useEffect(() => {
    const fetchOptions = async () => {
      // Fetch sections
      let sectionsQuery = supabase
        .from("sms_sections")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (user?.school_id != null) {
        sectionsQuery = sectionsQuery.eq("school_id", user.school_id);
      }
      const { data: sectionsData } = await sectionsQuery;

      if (sectionsData) {
        setSections(sectionsData);
      }

      // Fetch teachers (all users except division_admin)
      let teachersQuery = supabase
        .from("sms_users")
        .select("id, name")
        .neq("type", "division_admin")
        .eq("is_active", true)
        .order("name");
      if (user?.school_id != null) {
        teachersQuery = teachersQuery.eq("school_id", user.school_id);
      }
      const { data: teachersData } = await teachersQuery;

      if (teachersData) {
        setTeachers(teachersData);
      }

      // Fetch rooms
      let roomsQuery = supabase
        .from("sms_rooms")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (user?.school_id != null) {
        roomsQuery = roomsQuery.eq("school_id", user.school_id);
      }
      const { data: roomsData } = await roomsQuery;

      if (roomsData) {
        setRooms(roomsData);
      }
    };

    fetchOptions();
  }, [user?.school_id]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilter({
        keyword,
        section_id: sectionId && sectionId !== "all" ? sectionId : undefined,
        teacher_id: teacherId && teacherId !== "all" ? teacherId : undefined,
        room_id: roomId && roomId !== "all" ? roomId : undefined,
        school_year: schoolYear || undefined,
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [keyword, sectionId, teacherId, roomId, schoolYear, setFilter]);

  const handleReset = () => {
    setKeyword("");
    setSectionId("all");
    setTeacherId("all");
    setRoomId("all");
    setSchoolYear("");
    setFilter({
      keyword: "",
      section_id: undefined,
      teacher_id: undefined,
      room_id: undefined,
      school_year: undefined,
    });
  };

  const filterCount = [
    keyword,
    sectionId && sectionId !== "all",
    teacherId && teacherId !== "all",
    roomId && roomId !== "all",
    schoolYear,
  ].filter(Boolean).length;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-2 border-gray-300 hover:bg-gray-50"
        >
          <FilterIcon className="h-4 w-4" />
          Filter
          {filterCount > 0 && (
            <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {filterCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-4">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              Search
            </label>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Search schedules..."
                className="pl-9 pr-9 h-10 border-gray-300 focus:border-blue-500 focus:ring-blue-500/20 w-full"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => setKeyword("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              Section
            </label>
            <Select value={sectionId} onValueChange={setSectionId}>
              <SelectTrigger className="w-full h-10 border-gray-300">
                <SelectValue placeholder="All sections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sections</SelectItem>
                {sections.map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              Teacher
            </label>
            <Select value={teacherId} onValueChange={setTeacherId}>
              <SelectTrigger className="w-full h-10 border-gray-300">
                <SelectValue placeholder="All teachers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teachers</SelectItem>
                {teachers.map((teacher) => (
                  <SelectItem key={teacher.id} value={teacher.id}>
                    {teacher.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              Room
            </label>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger className="w-full h-10 border-gray-300">
                <SelectValue placeholder="All rooms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All rooms</SelectItem>
                {rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              School Year
            </label>
            <Select value={schoolYear || "all"} onValueChange={setSchoolYear}>
              <SelectTrigger className="w-full h-10 border-gray-300">
                <SelectValue placeholder="All school years" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All school years</SelectItem>
                {getSchoolYearOptions().map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(keyword ||
            sectionId !== "all" ||
            teacherId !== "all" ||
            roomId !== "all" ||
            schoolYear) && (
            <div className="flex justify-end">
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={handleReset}
                className="h-9 border-gray-300 hover:bg-gray-50"
              >
                <X size={14} className="mr-1.5" />
                Clear
              </Button>
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
