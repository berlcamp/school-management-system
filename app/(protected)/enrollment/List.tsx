"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getGradeLevelLabel } from "@/lib/constants";
import {
  ENROLLMENT_STATUS_LABELS,
  ENROLLMENT_STATUS_STYLES,
} from "@/lib/dashboard-utils";
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


function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const List = () => {
  const list = useSelector(
    (state: RootState) => state.list.value
  ) as EnrollmentListItem[];
  const [modalAddOpen, setModalAddOpen] = useState(false);
  const [selectedItem, setSelectedItem] =
    useState<EnrollmentListItem | null>(null);

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
              <th className="app__table_th">Grade Level</th>
              <th className="app__table_th">Section</th>
              <th className="app__table_th">School Year</th>
              <th className="app__table_th">Status</th>
              <th className="app__table_th">Date Enrolled</th>
              <th className="app__table_th_right">Actions</th>
            </tr>
          </thead>
          <tbody className="app__table_tbody">
            {list.map((item: EnrollmentListItem) => {
              const student = item.student;
              const section = item.section;
              const studentName = student
                ? `${student.last_name}, ${student.first_name}${student.middle_name ? ` ${student.middle_name.charAt(0)}.` : ""}`
                : "—";

              return (
                <tr key={item.id} className="app__table_tr">
                  {/* Student */}
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

                  {/* Grade Level + Semester */}
                  <td className="app__table_td">
                    {item.grade_level != null && (
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                      {getGradeLevelLabel(item.grade_level)}
                    </span>
                    )}
                    {item.grade_level >= 11 &&
                      item.grade_level <= 12 &&
                      item.semester && (
                        <span className="ml-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300">
                          Sem {item.semester}
                        </span>
                      )}
                  </td>

                  {/* Section */}
                  <td className="app__table_td">
                    <div className="app__table_cell_text">
                      <div className="app__table_cell_title">
                        {section?.name || "—"}
                      </div>
                    </div>
                  </td>

                  {/* School Year */}
                  <td className="app__table_td">
                    <div className="app__table_cell_title">
                      {item.school_year}
                    </div>
                  </td>

                  {/* Status badge */}
                  <td className="app__table_td">
                    {item.enrollment_status && (
                      <span
                        className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ENROLLMENT_STATUS_STYLES[item.enrollment_status] ?? ""}`}
                      >
                        {ENROLLMENT_STATUS_LABELS[
                          item.enrollment_status
                        ] ?? item.enrollment_status}
                      </span>
                    )}
                  </td>

                  {/* Date Enrolled */}
                  <td className="app__table_td">
                    <div className="app__table_cell_title text-muted-foreground">
                      {item.enrollment_date
                        ? formatDate(item.enrollment_date)
                        : item.created_at
                          ? formatDate(item.created_at)
                          : "—"}
                    </div>
                  </td>

                  {/* Actions */}
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
                            disabled={item.enrollment_status === "completed"}
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
