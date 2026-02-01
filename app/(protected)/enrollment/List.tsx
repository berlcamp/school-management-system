"use client";

import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";
import { RootState } from "@/types";
import { CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";

export const List = () => {
  const list = useSelector((state: RootState) => state.list.value);
  const [loading, setLoading] = useState<string | null>(null);

  const handleApprove = async (enrollmentId: string) => {
    setLoading(enrollmentId);
    try {
      const { error } = await supabase
        .from("sms_enrollments")
        .update({ status: "approved" })
        .eq("id", enrollmentId);

      if (error) throw error;

      toast.success("Enrollment approved!");
      window.location.reload();
    } catch (err) {
      toast.error("Failed to approve enrollment");
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async (enrollmentId: string) => {
    setLoading(enrollmentId);
    try {
      const { error } = await supabase
        .from("sms_enrollments")
        .update({ status: "rejected" })
        .eq("id", enrollmentId);

      if (error) throw error;

      toast.success("Enrollment rejected!");
      window.location.reload();
    } catch (err) {
      toast.error("Failed to reject enrollment");
    } finally {
      setLoading(null);
    }
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
              <th className="app__table_th">School Year</th>
              <th className="app__table_th">Status</th>
              <th className="app__table_th_right">Actions</th>
            </tr>
          </thead>
          <tbody className="app__table_tbody">
            {list.map((item: any) => {
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
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        item.status === "approved"
                          ? "bg-green-100 text-green-800"
                          : item.status === "rejected"
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {item.status.charAt(0).toUpperCase() +
                        item.status.slice(1)}
                    </span>
                  </td>
                  <td className="app__table_td_actions">
                    {item.status === "pending" && (
                      <div className="app__table_action_container">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleApprove(item.id)}
                          disabled={loading === item.id}
                          className="mr-2"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReject(item.id)}
                          disabled={loading === item.id}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
