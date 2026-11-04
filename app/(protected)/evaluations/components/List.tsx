"use client";

import { StatusChip } from "@/components/StatusChip";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hook";
import { deleteItem, updateList } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { Evaluation, RootState } from "@/types";
import {
  BarChart3,
  ListChecks,
  MoreVertical,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";
import { AddModal } from "./AddModal";
import { QuestionsModal } from "./QuestionsModal";
import { ResultsModal } from "./ResultsModal";

type ItemType = Evaluation;

const typeLabels: Record<string, { label: string; className: string }> = {
  student_to_teacher: {
    label: "Student to Teacher",
    className: "app__chip_accent",
  },
  teacher_to_principal: {
    label: "Teacher to School Head",
    className: "app__chip_accent",
  },
  student_to_principal: {
    label: "Student to School Head",
    className: "app__chip_info",
  },
  principal_to_teacher: {
    label: "Principal to Teacher",
    className: "app__chip_warning",
  },
};

export const List = () => {
  const dispatch = useAppDispatch();
  const list = useSelector((state: RootState) => state.list.value);
  const user = useAppSelector((state) => state.user.user);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [modalAddOpen, setModalAddOpen] = useState(false);
  const [questionsModalOpen, setQuestionsModalOpen] = useState(false);
  const [resultsModalOpen, setResultsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemType | null>(null);

  const handleDeleteConfirmation = (item: ItemType) => {
    setSelectedItem(item);
    setIsDeleteModalOpen(true);
  };

  const handleEdit = (item: ItemType) => {
    setSelectedItem(item);
    setModalAddOpen(true);
  };

  const handleManageQuestions = (item: ItemType) => {
    setSelectedItem(item);
    setQuestionsModalOpen(true);
  };

  const handleViewResults = (item: ItemType) => {
    setSelectedItem(item);
    setResultsModalOpen(true);
  };

  const handleToggleActive = async (item: ItemType) => {
    const newActive = !item.is_active;
    let query = supabase
      .from("sms_evaluations")
      .update({ is_active: newActive })
      .eq("id", item.id);
    if (user?.school_id != null) {
      query = query.eq("school_id", user.school_id);
    }
    const { error } = await query;

    if (error) {
      toast.error(error.message);
    } else {
      dispatch(updateList({ ...item, is_active: newActive }));
      toast.success(
        newActive ? "Evaluation activated" : "Evaluation deactivated",
      );
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;

    let query = supabase
      .from("sms_evaluations")
      .delete()
      .eq("id", selectedItem.id);
    if (user?.school_id != null) {
      query = query.eq("school_id", user.school_id);
    }
    const { error } = await query;

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Evaluation deleted");
      dispatch(deleteItem(selectedItem));
      setIsDeleteModalOpen(false);
    }
  };

  return (
    <div className="app__table_container">
      <div className="app__table_wrapper">
        <table className="app__table">
          <thead className="app__table_thead">
            <tr>
              <th className="app__table_th">Title</th>
              <th className="app__table_th">Type</th>
              <th className="app__table_th">School Year</th>
              <th className="app__table_th">Status</th>
              <th className="app__table_th_right">Actions</th>
            </tr>
          </thead>
          <tbody className="app__table_tbody">
            {(list as ItemType[]).map((item: ItemType) => {
              const typeInfo = typeLabels[item.type] || {
                label: item.type,
                className: "app__chip_neutral",
              };
              return (
                <tr key={item.id} className="app__table_tr">
                  <td className="app__table_td">
                    <div className="app__table_cell_text">
                      <div className="app__table_cell_title">{item.title}</div>
                      {item.description && (
                        <div className="app__table_cell_subtitle">
                          {item.description}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="app__table_td">
                    <span
                      className={`app__chip ${typeInfo.className}`}
                    >
                      {typeInfo.label}
                    </span>
                  </td>
                  <td className="app__table_td">
                    <span className="text-sm text-gray-700">
                      {item.school_year}
                    </span>
                  </td>
                  <td className="app__table_td">
                    <StatusChip status={item.is_active ? "active" : "inactive"} />
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
                            onClick={() => handleEdit(item)}
                            className="cursor-pointer"
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleManageQuestions(item)}
                            className="cursor-pointer"
                          >
                            <ListChecks className="mr-2 h-4 w-4" />
                            Manage Questions
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleViewResults(item)}
                            className="cursor-pointer"
                          >
                            <BarChart3 className="mr-2 h-4 w-4" />
                            View Results
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleToggleActive(item)}
                            className="cursor-pointer"
                          >
                            {item.is_active ? (
                              <>
                                <ToggleLeft className="mr-2 h-4 w-4" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <ToggleRight className="mr-2 h-4 w-4" />
                                Activate
                              </>
                            )}
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
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        message="Are you sure you want to delete this evaluation? All questions and responses will be permanently removed."
      />
      <AddModal
        isOpen={modalAddOpen}
        editData={selectedItem}
        onClose={() => {
          setModalAddOpen(false);
          setSelectedItem(null);
        }}
      />
      {selectedItem && (
        <QuestionsModal
          isOpen={questionsModalOpen}
          evaluation={selectedItem}
          onClose={() => {
            setQuestionsModalOpen(false);
            setSelectedItem(null);
          }}
        />
      )}
      {selectedItem && (
        <ResultsModal
          isOpen={resultsModalOpen}
          evaluation={selectedItem}
          onClose={() => {
            setResultsModalOpen(false);
            setSelectedItem(null);
          }}
        />
      )}
    </div>
  );
};
