"use client";

import { supabase } from "@/lib/supabase/client";
import { formatDays, formatTimeRange } from "@/lib/utils/scheduleConflicts";
import { RootState, SubjectSchedule } from "@/types";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";

type ItemType = SubjectSchedule;

export const List = () => {
  const list = useSelector((state: RootState) => state.list.value);
  const [subjectNames, setSubjectNames] = useState<Record<string, string>>({});
  const [sectionNames, setSectionNames] = useState<Record<string, string>>({});
  const [teacherNames, setTeacherNames] = useState<Record<string, string>>({});
  const [roomNames, setRoomNames] = useState<Record<string, string>>({});

  // Fetch related data
  useEffect(() => {
    const fetchRelatedData = async () => {
      const schedules = list as ItemType[];
      if (schedules.length === 0) return;

      const subjectIds = Array.from(
        new Set(schedules.map((s) => s.subject_id)),
      );
      const sectionIds = Array.from(
        new Set(schedules.map((s) => s.section_id)),
      );
      const teacherIds = Array.from(
        new Set(schedules.map((s) => s.teacher_id)),
      );
      const roomIds = Array.from(new Set(schedules.map((s) => s.room_id)));

      // Fetch subjects
      if (subjectIds.length > 0) {
        const { data } = await supabase
          .from("sms_subjects")
          .select("id, name, code")
          .in("id", subjectIds);
        if (data) {
          const names: Record<string, string> = {};
          data.forEach((subject) => {
            names[subject.id] = `${subject.code} - ${subject.name}`;
          });
          setSubjectNames(names);
        }
      }

      // Fetch sections
      if (sectionIds.length > 0) {
        const { data } = await supabase
          .from("sms_sections")
          .select("id, name")
          .in("id", sectionIds);
        if (data) {
          const names: Record<string, string> = {};
          data.forEach((section) => {
            names[section.id] = section.name;
          });
          setSectionNames(names);
        }
      }

      // Fetch teachers
      if (teacherIds.length > 0) {
        const { data } = await supabase
          .from("sms_users")
          .select("id, name")
          .in("id", teacherIds);
        if (data) {
          const names: Record<string, string> = {};
          data.forEach((teacher) => {
            names[teacher.id] = teacher.name;
          });
          setTeacherNames(names);
        }
      }

      // Fetch rooms
      if (roomIds.length > 0) {
        const { data } = await supabase
          .from("sms_rooms")
          .select("id, name")
          .in("id", roomIds);
        if (data) {
          const names: Record<string, string> = {};
          data.forEach((room) => {
            names[room.id] = room.name;
          });
          setRoomNames(names);
        }
      }
    };

    fetchRelatedData();
  }, [list]);

  return (
    <div className="app__table_container">
      <div className="app__table_wrapper">
        <table className="app__table">
          <thead className="app__table_thead">
            <tr>
              <th className="app__table_th">Subject</th>
              <th className="app__table_th">Section</th>
              <th className="app__table_th">Teacher</th>
              <th className="app__table_th">Room</th>
              <th className="app__table_th">Days</th>
              <th className="app__table_th">Time</th>
              <th className="app__table_th">School Year</th>
            </tr>
          </thead>
          <tbody className="app__table_tbody">
            {(list as ItemType[]).map((item: ItemType) => (
              <tr key={item.id} className="app__table_tr">
                <td className="app__table_td">
                  <div className="app__table_cell_text">
                    <div className="app__table_cell_title">
                      {subjectNames[item.subject_id] || "-"}
                    </div>
                  </div>
                </td>
                <td className="app__table_td">
                  <div className="app__table_cell_text">
                    <div className="app__table_cell_title">
                      {sectionNames[item.section_id] || "-"}
                    </div>
                  </div>
                </td>
                <td className="app__table_td">
                  <div className="app__table_cell_text">
                    <div className="app__table_cell_title">
                      {teacherNames[item.teacher_id] || "-"}
                    </div>
                  </div>
                </td>
                <td className="app__table_td">
                  <div className="app__table_cell_text">
                    <div className="app__table_cell_title">
                      {roomNames[item.room_id] || "-"}
                    </div>
                  </div>
                </td>
                <td className="app__table_td">
                  <div className="flex flex-wrap gap-1">
                    {(Array.isArray(item.days_of_week) ? item.days_of_week : [])
                      .slice()
                      .sort()
                      .map((day) => (
                      <span
                        key={day}
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary"
                      >
                        {formatDays([day])}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="app__table_td">
                  <div className="app__table_cell_text">
                    <div className="app__table_cell_title font-mono">
                      {formatTimeRange(item.start_time, item.end_time)}
                    </div>
                  </div>
                </td>
                <td className="app__table_td">
                  <div className="app__table_cell_text">
                    <div className="app__table_cell_title">
                      {item.school_year}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
