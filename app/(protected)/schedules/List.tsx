"use client";

import { ConfirmationModal } from "@/components/ConfirmationModal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch } from "@/lib/redux/hook";
import { deleteItem } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { formatDays, formatTimeRange } from "@/lib/utils/scheduleConflicts";
import { RootState, SubjectSchedule } from "@/types";
import { Copy, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";
import { AddModal } from "./AddModal";
import { DuplicateModal } from "./DuplicateModal";

type ItemType = SubjectSchedule;
const table = "sms_subject_schedules";

export const List = () => {
  const dispatch = useAppDispatch();
  const list = useSelector((state: RootState) => state.list.value);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalAddOpen, setModalAddOpen] = useState(false);
  const [modalDuplicateOpen, setModalDuplicateOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemType | null>(null);
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
        new Set(schedules.map((s) => s.subject_id))
      );
      const sectionIds = Array.from(
        new Set(schedules.map((s) => s.section_id))
      );
      const teacherIds = Array.from(
        new Set(schedules.map((s) => s.teacher_id))
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

  const handleDeleteConfirmation = (item: ItemType) => {
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  const handleEdit = (item: ItemType) => {
    setSelectedItem(item);
    setModalAddOpen(true);
  };

  const handleDuplicate = (item: ItemType) => {
    setSelectedItem(item);
    setModalDuplicateOpen(true);
  };

  const handleDelete = async () => {
    if (selectedItem) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("id", selectedItem.id);

      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Successfully deleted!");
        dispatch(deleteItem(selectedItem));
        setIsModalOpen(false);
      }
    }
  };

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
              <th className="app__table_th_right">Actions</th>
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
                    {[...item.days_of_week].sort().map((day) => (
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
                <td className="app__table_td_actions">
                  <div className="app__table_action_container">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        >
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">Open menu</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          onClick={() => handleEdit(item)}
                          className="cursor-pointer"
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDuplicate(item)}
                          className="cursor-pointer"
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteConfirmation(item)}
                          variant="destructive"
                          className="cursor-pointer"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleDelete}
        message="Are you sure you want to delete this schedule?"
      />
      <AddModal
        isOpen={modalAddOpen}
        editData={selectedItem}
        onClose={() => {
          setModalAddOpen(false);
          setSelectedItem(null);
        }}
      />
      <DuplicateModal
        isOpen={modalDuplicateOpen}
        scheduleData={selectedItem}
        onClose={() => {
          setModalDuplicateOpen(false);
          setSelectedItem(null);
        }}
      />
    </div>
  );
};
