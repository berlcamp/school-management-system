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
import { RootState, Section } from "@/types";
import { BookOpen, MoreVertical, Pencil, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";
import { AddModal } from "./AddModal";
import { ViewStudentsModal } from "./ViewStudentsModal";
import { ViewSubjectsModal } from "./ViewSubjectsModal";

type ItemType = Section;
const table: string = "sms_sections";

export const List = () => {
  const dispatch = useAppDispatch();
  const list = useSelector((state: RootState) => state.list.value);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalAddOpen, setModalAddOpen] = useState(false);
  const [modalViewStudentsOpen, setModalViewStudentsOpen] = useState(false);
  const [modalViewSubjectsOpen, setModalViewSubjectsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemType | null>(null);
  const [adviserNames, setAdviserNames] = useState<Record<string, string>>({});

  // Fetch adviser names
  useEffect(() => {
    const fetchAdvisers = async () => {
      const adviserIds = Array.from(
        new Set(
          (list as ItemType[])
            .map((item) => item.section_adviser_id)
            .filter(Boolean) as string[]
        )
      );

      if (adviserIds.length === 0) return;

      const { data } = await supabase
        .from("sms_users")
        .select("id, name")
        .in("id", adviserIds);

      if (data) {
        const names: Record<string, string> = {};
        data.forEach((adviser) => {
          names[adviser.id] = adviser.name;
        });
        setAdviserNames(names);
      }
    };

    if (list.length > 0) {
      fetchAdvisers();
    }
  }, [list]);

  const handleDeleteConfirmation = (item: ItemType) => {
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  const handleEdit = (item: ItemType) => {
    setSelectedItem(item);
    setModalAddOpen(true);
  };

  const handleViewStudents = (item: ItemType) => {
    setSelectedItem(item);
    setModalViewStudentsOpen(true);
  };

  const handleViewSubjects = (item: ItemType) => {
    setSelectedItem(item);
    setModalViewSubjectsOpen(true);
  };

  const handleDelete = async () => {
    if (selectedItem) {
      const { error } = await supabase
        .from(table)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", selectedItem.id);

      if (error) {
        if (error.code === "23503") {
          toast.error("Selected record cannot be deleted.");
        } else {
          toast.error(error.message);
        }
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
              <th className="app__table_th">Section Name</th>
              <th className="app__table_th">Grade Level</th>
              <th className="app__table_th">School Year</th>
              <th className="app__table_th">Adviser</th>
              <th className="app__table_th">Status</th>
              <th className="app__table_th_right">Actions</th>
            </tr>
          </thead>
          <tbody className="app__table_tbody">
            {(list as ItemType[]).map((item: ItemType) => (
              <tr key={item.id} className="app__table_tr">
                <td className="app__table_td">
                  <div className="app__table_cell_text">
                    <div className="app__table_cell_title">{item.name}</div>
                  </div>
                </td>
                <td className="app__table_td">
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                    Grade {item.grade_level}
                  </span>
                </td>
                <td className="app__table_td">
                  <div className="app__table_cell_text">
                    <div className="app__table_cell_title">
                      {item.school_year}
                    </div>
                  </div>
                </td>
                <td className="app__table_td">
                  <div className="app__table_cell_text">
                    <div className="app__table_cell_title">
                      {item.section_adviser_id
                        ? adviserNames[item.section_adviser_id] || "-"
                        : "-"}
                    </div>
                  </div>
                </td>
                <td className="app__table_td">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      item.is_active
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {item.is_active ? "Active" : "Inactive"}
                  </span>
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
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={() => handleViewStudents(item)}
                          className="cursor-pointer"
                        >
                          <Users className="mr-2 h-4 w-4" />
                          View Students
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleViewSubjects(item)}
                          className="cursor-pointer"
                        >
                          <BookOpen className="mr-2 h-4 w-4" />
                          View Subjects
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleEdit(item)}
                          className="cursor-pointer"
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
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
        message="Are you sure you want to delete this section?"
      />
      <AddModal
        isOpen={modalAddOpen}
        editData={selectedItem}
        onClose={() => {
          setModalAddOpen(false);
          setSelectedItem(null);
        }}
      />
      <ViewStudentsModal
        isOpen={modalViewStudentsOpen}
        section={selectedItem}
        onClose={() => {
          setModalViewStudentsOpen(false);
          setSelectedItem(null);
        }}
      />
      <ViewSubjectsModal
        isOpen={modalViewSubjectsOpen}
        section={selectedItem}
        onClose={() => {
          setModalViewSubjectsOpen(false);
          setSelectedItem(null);
        }}
      />
    </div>
  );
};
