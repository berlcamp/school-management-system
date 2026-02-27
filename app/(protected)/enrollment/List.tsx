"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getGradeLevelLabel } from "@/lib/constants";
import { RootState } from "@/types";
import type { Enrollment, Section, Student } from "@/types/database";
import { MoreVertical, Pencil } from "lucide-react";
import { useState } from "react";
import { useSelector } from "react-redux";
import { AddModal } from "./AddModal";

export type EnrollmentListItem = Enrollment & {
  student?: Student | null;
  section?: Section | null;
};

export const List = () => {
  const list = useSelector((state: RootState) => state.list.value) as EnrollmentListItem[];
  const [modalAddOpen, setModalAddOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<EnrollmentListItem | null>(null);

  const handleEdit = (item: EnrollmentListItem) => {
    setSelectedItem(item);
    setModalAddOpen(true);
  };

  return (
    <div className="app__table_container">
      <div className="app__table_wrapper">
        <table className="app__table">
          <thead className="app__table_thead">
            <tr>
              <th className="app__table_th">Student</th>
              <th className="app__table_th">Section</th>
              <th className="app__table_th">Grade Level</th>
              <th className="app__table_th">Semester</th>
              <th className="app__table_th">School Year</th>
              <th className="app__table_th">Date Enrolled</th>
              <th className="app__table_th_right">Actions</th>
            </tr>
          </thead>
          <tbody className="app__table_tbody">
            {list.map((item: EnrollmentListItem) => {
              const student = item.student;
              const section = item.section;
              const studentName = student
                ? `${student.last_name}, ${student.first_name}`
                : "-";
              return (
                <tr key={item.id} className="app__table_tr">
                  <td className="app__table_td">
                    <div className="app__table_cell_text">
                      <div className="app__table_cell_title">{studentName}</div>
                      {student && (
                        <div className="app__table_cell_subtitle">
                          LRN: {student.lrn}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="app__table_td">
                    <div className="app__table_cell_text">
                      <div className="app__table_cell_title">
                        {section?.name || "-"}
                      </div>
                    </div>
                  </td>
                  <td className="app__table_td">
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                      {getGradeLevelLabel(item.grade_level)}
                    </span>
                  </td>
                  <td className="app__table_td">
                    <div className="app__table_cell_text">
                      <div className="app__table_cell_title">
                        {item.grade_level >= 11 && item.grade_level <= 12 && item.semester
                          ? `Semester ${item.semester}`
                          : "-"}
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
                  <td className="app__table_td">
                    <div className="app__table_cell_text">
                      <div className="app__table_cell_title">
                        {item.enrollment_date
                          ? new Date(item.enrollment_date).toLocaleDateString()
                          : "-"}
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
