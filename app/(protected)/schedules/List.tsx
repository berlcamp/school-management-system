"use client";

import { ConfirmationModal } from "@/components/ConfirmationModal";
import { SharedSlotBadge } from "@/components/SharedSlotBadge";
import { TemporaryScheduleBadge } from "@/components/TemporaryScheduleBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useScheduleScope } from "@/hooks/useScheduleScope";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { deleteItem } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { formatDays, formatTimeRange } from "@/lib/utils/scheduleConflicts";
import { fetchStaffNames } from "@/lib/utils/staff";
import { RootState, SubjectSchedule } from "@/types";
import { Copy, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";
import { AddModal } from "./AddModal";
import { DuplicateModal } from "./DuplicateModal";

type ItemType = SubjectSchedule;

interface ListProps {
  /**
   * Per-row Edit / Duplicate / Delete, offered to a Department Head or Grade
   * Level Coordinator with no school-management role (migration 216). Off for
   * everyone else, whose list is unchanged.
   */
  showActions?: boolean;
}

export const List = ({ showActions = false }: ListProps) => {
  const dispatch = useAppDispatch();
  const list = useSelector((state: RootState) => state.list.value);
  const user = useAppSelector((state) => state.user.user);
  const scope = useScheduleScope();
  const [subjectNames, setSubjectNames] = useState<Record<string, string>>({});
  const [sectionNames, setSectionNames] = useState<Record<string, string>>({});
  const [sectionGrades, setSectionGrades] = useState<Record<string, number>>(
    {},
  );
  const [selectedItem, setSelectedItem] = useState<ItemType | null>(null);
  const [modalEditOpen, setModalEditOpen] = useState(false);
  const [modalDuplicateOpen, setModalDuplicateOpen] = useState(false);
  const [modalDeleteOpen, setModalDeleteOpen] = useState(false);
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
      // Temporary schedules have no teacher — keep nulls out of the .in() filter
      const teacherIds = Array.from(
        new Set(
          schedules
            .map((s) => s.teacher_id)
            .filter((id): id is string => id != null),
        ),
      );
      const roomIds = Array.from(new Set(schedules.map((s) => s.room_id)));

      // Fetch subjects (school-scoped)
      if (subjectIds.length > 0) {
        let query = supabase
          .from("sms_subjects")
          .select("id, name, code")
          .in("id", subjectIds);
        if (user?.school_id != null) {
          query = query.eq("school_id", user.school_id);
        }
        const { data } = await query;
        if (data) {
          const names: Record<string, string> = {};
          data.forEach((subject) => {
            names[subject.id] = `${subject.code} - ${subject.name}`;
          });
          setSubjectNames(names);
        }
      }

      // Fetch sections (school-scoped)
      if (sectionIds.length > 0) {
        let query = supabase
          .from("sms_sections")
          .select("id, name, grade_level")
          .in("id", sectionIds);
        if (user?.school_id != null) {
          query = query.eq("school_id", user.school_id);
        }
        const { data } = await query;
        if (data) {
          const names: Record<string, string> = {};
          const grades: Record<string, number> = {};
          data.forEach((section) => {
            names[section.id] = section.name;
            grades[section.id] = Number(section.grade_level);
          });
          setSectionNames(names);
          setSectionGrades(grades);
        }
      }

      // Fetch teachers. Deliberately NOT school-scoped: a teacher who has
      // since moved schools still taught this slot, and filtering them out
      // rendered the row as "-" — indistinguishable from an unassigned one.
      if (teacherIds.length > 0) {
        setTeacherNames(await fetchStaffNames(teacherIds));
      }

      // Fetch rooms (school-scoped)
      if (roomIds.length > 0) {
        let query = supabase
          .from("sms_rooms")
          .select("id, name")
          .in("id", roomIds);
        if (user?.school_id != null) {
          query = query.eq("school_id", user.school_id);
        }
        const { data } = await query;
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
  }, [list, user?.school_id]);

  // Deletes one time block only; the subject's other blocks stay.
  const handleDelete = async () => {
    if (!selectedItem) return;
    let deleteQuery = supabase
      .from("sms_subject_schedules")
      .delete()
      .eq("id", selectedItem.id);
    if (user?.school_id != null) {
      deleteQuery = deleteQuery.eq("school_id", user.school_id);
    }
    const { error } = await deleteQuery;
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Schedule deleted successfully!");
    dispatch(deleteItem(selectedItem));
    setModalDeleteOpen(false);
    setSelectedItem(null);
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
              {showActions && (
                <th className="app__table_th_right">Actions</th>
              )}
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
                      {item.teacher_id == null ? (
                        <TemporaryScheduleBadge />
                      ) : (
                        teacherNames[item.teacher_id] || "-"
                      )}
                    </div>
                  </div>
                </td>
                <td className="app__table_td">
                  <div className="app__table_cell_text">
                    <div className="app__table_cell_title flex items-center gap-2">
                      {roomNames[item.room_id] || "-"}
                      {item.conflict_override && <SharedSlotBadge />}
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
                {showActions && (
                  <td className="app__table_td_actions">
                    {(() => {
                      // Full for a subject they head; teacher only for a
                      // section they coordinate (migration 216).
                      const mode = scope.modeFor(
                        item.subject_id,
                        sectionGrades[item.section_id],
                      );
                      if (mode === "none") return null;
                      return (
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
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedItem(item);
                                  setModalEditOpen(true);
                                }}
                                className="cursor-pointer"
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                {mode === "teacher_only"
                                  ? "Change Teacher"
                                  : "Edit"}
                              </DropdownMenuItem>
                              {mode === "full" && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedItem(item);
                                    setModalDuplicateOpen(true);
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Copy className="mr-2 h-4 w-4" />
                                  Duplicate
                                </DropdownMenuItem>
                              )}
                              {mode === "full" && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedItem(item);
                                    setModalDeleteOpen(true);
                                  }}
                                  variant="destructive"
                                  className="cursor-pointer"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })()}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showActions && (
        <>
          <AddModal
            isOpen={modalEditOpen}
            editData={selectedItem}
            onClose={() => {
              setModalEditOpen(false);
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
          <ConfirmationModal
            isOpen={modalDeleteOpen}
            onClose={() => {
              setModalDeleteOpen(false);
              setSelectedItem(null);
            }}
            onConfirm={handleDelete}
            message="Delete this time block? The subject's other time blocks are not affected."
          />
        </>
      )}
    </div>
  );
};
