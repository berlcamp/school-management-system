"use client";

import { ConfirmationModal } from "@/components/ConfirmationModal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { deleteItem } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { RootState, Student } from "@/types";
import { Eye, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useSelector } from "react-redux"; 
import { AddModal } from "./AddModal";
import { ViewModal } from "./ViewModal";

type ItemType = Student;
const table = "sms_students";

export const List = () => {
  const dispatch = useAppDispatch();
  const list = useSelector((state: RootState) => state.list.value);
  const user = useAppSelector((state) => state.user.user);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalAddOpen, setModalAddOpen] = useState(false);
  const [modalViewOpen, setModalViewOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemType | null>(null);
  const [sectionNames, setSectionNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchSections = async () => {
      const sectionIds = Array.from(
        new Set(
          (list as ItemType[])
            .map((item) => item.current_section_id)
            .filter(Boolean) as string[],
        ),
      );

      if (sectionIds.length === 0) return;

      let query = supabase
        .from("sms_sections")
        .select("id, name")
        .in("id", sectionIds);
      if (user?.school_id != null) {
        query = query.eq("school_id", user.school_id);
      }
      const { data } = await query;

      if (data) {
        const names: Record<string, string> = {};
        data.forEach((section) => {
          names[section.id] = section.name;
        });
        setSectionNames(names);
      }
    };

    if (list.length > 0) {
      fetchSections();
    }
  }, [list, user?.school_id]);

  const handleDeleteConfirmation = (item: ItemType) => {
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  const handleEdit = (item: ItemType) => {
    setSelectedItem(item);
    setModalAddOpen(true);
  };

  const handleView = (item: ItemType) => {
    setSelectedItem(item);
    setModalViewOpen(true);
  };

  const handleDelete = async () => {
    if (selectedItem) {
      let deleteQuery = supabase.from(table).delete().eq("id", selectedItem.id);
      if (user?.school_id != null) {
        deleteQuery = deleteQuery.eq("school_id", user.school_id);
      }
      const { error } = await deleteQuery;

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

  const getFullName = (student: ItemType) => {
    return `${student.last_name}, ${student.first_name}${
      student.middle_name ? ` ${String(student.middle_name).charAt(0)}.` : ""
    }${student.suffix ? ` ${student.suffix}` : ""}`;
  };

  return (
    <div className="app__table_container">
      <div className="app__table_wrapper">
        <table className="app__table">
          <thead className="app__table_thead">
            <tr>
              <th className="app__table_th">LRN</th>
              <th className="app__table_th">Name</th>
              <th className="app__table_th">Section</th>
              <th className="app__table_th">Status</th>
              <th className="app__table_th_right">Actions</th>
            </tr>
          </thead>
          <tbody className="app__table_tbody">
            {(list as ItemType[]).filter(Boolean).map((item: ItemType) => (
              <tr key={item.id} className="app__table_tr">
                <td className="app__table_td">
                  <div className="app__table_cell_text">
                    <div className="app__table_cell_title font-mono">
                      {item.lrn}
                    </div>
                  </div>
                </td>
                <td className="app__table_td">
                  <div className="app__table_cell_text">
                    <div className="app__table_cell_title">
                      {getFullName(item)}
                    </div>
                    <div className="app__table_cell_subtitle">
                      {item.gender === "male" ? "Male" : "Female"} •{" "}
                      {new Date(item.date_of_birth).toLocaleDateString()}
                    </div>
                  </div>
                </td>
                <td className="app__table_td">
                  <div className="app__table_cell_text">
                    <div className="app__table_cell_title">
                      {item.current_section_id
                        ? sectionNames[item.current_section_id] || "-"
                        : "-"}
                    </div>
                  </div>
                </td>
                <td className="app__table_td">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      item.enrollment_status === "enrolled"
                        ? "bg-green-100 text-green-800"
                        : item.enrollment_status === "transferred"
                          ? "bg-blue-100 text-blue-800"
                          : item.enrollment_status === "graduated"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {(item.enrollment_status ?? "")
                      .charAt(0)
                      .toUpperCase() +
                      (item.enrollment_status ?? "").slice(1) || "-"}
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
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          onClick={() => handleView(item)}
                          className="cursor-pointer"
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View
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
        message="Are you sure you want to delete this student?"
      />
      <AddModal
        isOpen={modalAddOpen}
        editData={selectedItem}
        onClose={() => {
          setModalAddOpen(false);
          setSelectedItem(null);
        }}
      />
      <ViewModal
        isOpen={modalViewOpen}
        student={selectedItem}
        onClose={() => {
          setModalViewOpen(false);
          setSelectedItem(null);
        }}
      />
    </div>
  );
};
