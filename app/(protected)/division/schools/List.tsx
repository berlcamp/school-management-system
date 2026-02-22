"use client";

import { ConfirmationModal } from "@/components/ConfirmationModal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getSchoolTypeLabel } from "@/lib/constants";
import { useAppDispatch } from "@/lib/redux/hook";
import { deleteItem } from "@/lib/redux/listSlice";
import { supabase } from "@/lib/supabase/client";
import { School } from "@/types";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";
import { AddModal } from "./AddModal";

type ItemType = School;
const table = "sms_schools";

const CANNOT_DELETE_MESSAGE =
  "Cannot delete: this school has users assigned. Remove or reassign all users first.";

export const List = () => {
  const dispatch = useAppDispatch();
  const list = useSelector(
    (state: { list: { value: ItemType[] } }) => state.list.value,
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalAddOpen, setModalAddOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemType | null>(null);
  const [userCountBySchool, setUserCountBySchool] = useState<
    Record<string, number>
  >({});

  const fetchUserCounts = useCallback(async () => {
    const schoolIds = (list as ItemType[])
      .map((s) => String(s.id))
      .filter(Boolean);
    if (schoolIds.length === 0) {
      setUserCountBySchool({});
      return;
    }
    const { data } = await supabase
      .from("sms_users")
      .select("school_id")
      .in("school_id", schoolIds);
    const counts: Record<string, number> = {};
    (data ?? []).forEach((row) => {
      const sid = String(row.school_id);
      if (sid) counts[sid] = (counts[sid] ?? 0) + 1;
    });
    setUserCountBySchool(counts);
  }, [list]);

  useEffect(() => {
    fetchUserCounts();
  }, [fetchUserCounts]);

  const handleDeleteConfirmation = (item: ItemType) => {
    const userCount = userCountBySchool[String(item.id)] ?? 0;
    if (userCount > 0) {
      toast.error(CANNOT_DELETE_MESSAGE);
      return;
    }
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  const handleEdit = (item: ItemType) => {
    setSelectedItem(item);
    setModalAddOpen(true);
  };

  const handleDelete = async () => {
    if (selectedItem) {
      const { error } = await supabase
        .from(table)
        .delete()
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
              <th className="app__table_th">School ID</th>
              <th className="app__table_th">Name</th>
              <th className="app__table_th">Type</th>
              <th className="app__table_th">Address</th>
              <th className="app__table_th">District</th>
              <th className="app__table_th">Status</th>
              <th className="app__table_th_right">Actions</th>
            </tr>
          </thead>
          <tbody className="app__table_tbody">
            {(list as ItemType[]).map((item) => (
              <tr key={item.id} className="app__table_tr">
                <td className="app__table_td">
                  <div className="app__table_cell_text">
                    <div className="app__table_cell_title">
                      {item.school_id}
                    </div>
                  </div>
                </td>
                <td className="app__table_td">
                  <div className="app__table_cell_text">
                    <div className="app__table_cell_title">{item.name}</div>
                  </div>
                </td>
                <td className="app__table_td">
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                    {getSchoolTypeLabel(item.school_type)}
                  </span>
                </td>
                <td className="app__table_td">
                  <div className="app__table_cell_text">
                    <div className="app__table_cell_title">
                      {item.address || "-"}
                    </div>
                  </div>
                </td>
                <td className="app__table_td">
                  <div className="app__table_cell_text">
                    <div className="app__table_cell_title">
                      {item.district || "-"}
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
                      <DropdownMenuContent align="end" className="w-40">
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
                          disabled={
                            (userCountBySchool[String(item.id)] ?? 0) > 0
                          }
                          title={
                            (userCountBySchool[String(item.id)] ?? 0) > 0
                              ? CANNOT_DELETE_MESSAGE
                              : undefined
                          }
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {(userCountBySchool[String(item.id)] ?? 0) > 0
                            ? "School cannot be deleted (users assigned)"
                            : "Delete"}
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
        message="Are you sure you want to delete this school?"
      />
      <AddModal
        isOpen={modalAddOpen}
        editData={selectedItem}
        onClose={() => {
          setModalAddOpen(false);
          setSelectedItem(null);
        }}
      />
    </div>
  );
};
