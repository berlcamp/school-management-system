"use client";

import { ViewModal } from "@/app/(protected)/students/ViewModal";
import { formatLrn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getGradeLevelLabel, getSectionTypeLabel } from "@/lib/constants";
import {
  ENROLLMENT_STATUS_LABELS,
  ENROLLMENT_STATUS_STYLES,
} from "@/lib/dashboard-utils";
import { supabase } from "@/lib/supabase/client";
import { RootState } from "@/types";
import type { Enrollment, Section, Student } from "@/types/database";
import { updateList } from "@/lib/redux/listSlice";
import { useAppDispatch } from "@/lib/redux/hook";
import type { EnrollmentLifecycleStatus } from "@/types/database";
import { ArrowRightLeft, Eye, MoreVertical, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { AddModal } from "./AddModal";
import { ChangeStatusModal } from "./components/ChangeStatusModal";

const getGradeBand = (gradeLevel: number) => {
  if (gradeLevel === 0)  return { dot: "bg-amber-400",   text: "text-amber-700 dark:text-amber-400",   bg: "bg-amber-50 dark:bg-amber-950/30",   border: "border-amber-200 dark:border-amber-800/50" };
  if (gradeLevel <= 6)   return { dot: "bg-blue-400",    text: "text-blue-700 dark:text-blue-400",    bg: "bg-blue-50 dark:bg-blue-950/30",    border: "border-blue-200 dark:border-blue-800/50" };
  if (gradeLevel <= 10)  return { dot: "bg-emerald-400", text: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-200 dark:border-emerald-800/50" };
  return                        { dot: "bg-violet-400",  text: "text-violet-700 dark:text-violet-400",  bg: "bg-violet-50 dark:bg-violet-950/30",  border: "border-violet-200 dark:border-violet-800/50" };
};

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
    (state: RootState) => state.list.value,
  ) as EnrollmentListItem[];
  const [modalAddOpen, setModalAddOpen] = useState(false);
  const [modalViewOpen, setModalViewOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<EnrollmentListItem | null>(
    null,
  );
  const dispatch = useAppDispatch();
  const [adviserNames, setAdviserNames] = useState<Record<string, string>>({});
  const [changeStatusItem, setChangeStatusItem] = useState<EnrollmentListItem | null>(null);

  useEffect(() => {
    const fetchAdvisers = async () => {
      const adviserIds = Array.from(
        new Set(
          list
            .filter((item) => item.enrollment_status === "retained" && item.section?.section_adviser_id)
            .map((item) => item.section!.section_adviser_id as string),
        ),
      );
      if (adviserIds.length === 0) return;
      const { data } = await supabase
        .from("sms_users")
        .select("id, name")
        .in("id", adviserIds);
      if (data) {
        const names: Record<string, string> = {};
        data.forEach((u) => { names[String(u.id)] = u.name; });
        setAdviserNames(names);
      }
    };
    fetchAdvisers();
  }, [list]);

  const handleView = (item: EnrollmentListItem) => {
    setSelectedItem(item);
    setModalViewOpen(true);
  };

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
                      {student ? (
                        <button
                          type="button"
                          className="app__table_cell_title text-left text-primary hover:underline cursor-pointer"
                          onClick={() => handleView(item)}
                        >
                          {studentName}
                        </button>
                      ) : (
                        <div className="app__table_cell_title">
                          {studentName}
                        </div>
                      )}
                      {student && (
                        <div className="app__table_cell_subtitle">
                          LRN: {formatLrn(student.lrn)}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Grade Level + Semester */}
                  <td className="app__table_td">
                    {item.grade_level != null ? (
                      <div className="flex flex-col gap-1">
                        <div className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 w-fit ${getGradeBand(item.grade_level).bg} ${getGradeBand(item.grade_level).border}`}>
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${getGradeBand(item.grade_level).dot}`} />
                          <span className={`text-xs font-semibold ${getGradeBand(item.grade_level).text}`}>
                            {getGradeLevelLabel(item.grade_level)}
                            {item.grade_level >= 11 && item.grade_level <= 12 && item.semester && (
                              <span className="font-normal opacity-70 ml-1">· Sem {item.semester}</span>
                            )}
                          </span>
                        </div>
                        {item.school_year && (
                          <span className="text-[11px] text-muted-foreground pl-0.5">{item.school_year}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Section */}
                  <td className="app__table_td">
                    <div className="app__table_cell_text">
                      <div className="app__table_cell_title">
                        {section?.name || "—"}
                      </div>
                      {section?.section_type && (
                        <div className="app__table_cell_subtitle">
                          {getSectionTypeLabel(section.section_type)}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Status badge */}
                  <td className="app__table_td">
                    {item.enrollment_status && (
                      <div className="app__table_cell_text">
                        <span
                          className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ENROLLMENT_STATUS_STYLES[item.enrollment_status] ?? ""}`}
                        >
                          {ENROLLMENT_STATUS_LABELS[item.enrollment_status] ??
                            item.enrollment_status}
                        </span>
                        {item.enrollment_status === "retained" &&
                          item.section?.section_adviser_id && (
                            <div className="app__table_cell_subtitle mt-0.5">
                              Adviser: {adviserNames[item.section.section_adviser_id] ?? "—"}
                            </div>
                          )}
                      </div>
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
                            onClick={() => handleView(item)}
                            disabled={!item.student}
                            className="cursor-pointer"
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleEdit(item)}
                            disabled={item.enrollment_status === "completed"}
                            className="cursor-pointer"
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setChangeStatusItem(item)}
                            className="cursor-pointer"
                          >
                            <ArrowRightLeft className="mr-2 h-4 w-4" />
                            Change Status
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
      <ViewModal
        isOpen={modalViewOpen}
        onClose={() => {
          setModalViewOpen(false);
          setSelectedItem(null);
        }}
        student={selectedItem?.student ?? null}
      />
      <AddModal
        isOpen={modalAddOpen}
        editData={selectedItem}
        onClose={() => {
          setModalAddOpen(false);
          setSelectedItem(null);
        }}
      />
      <ChangeStatusModal
        isOpen={!!changeStatusItem}
        onClose={() => setChangeStatusItem(null)}
        enrollmentId={changeStatusItem?.id ?? null}
        currentStatus={
          (changeStatusItem?.enrollment_status as EnrollmentLifecycleStatus) ?? null
        }
        studentName={
          changeStatusItem?.student
            ? `${changeStatusItem.student.last_name}, ${changeStatusItem.student.first_name}`
            : "Unknown Student"
        }
        onStatusChanged={(newStatus) => {
          if (changeStatusItem) {
            dispatch(
              updateList({
                ...changeStatusItem,
                enrollment_status: newStatus,
              })
            );
          }
        }}
      />
    </div>
  );
};
