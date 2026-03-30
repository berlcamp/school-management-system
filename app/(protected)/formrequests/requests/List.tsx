"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppSelector } from "@/lib/redux/hook";
import type { DocumentRequest } from "@/types/database";
import {
  Eye,
  FileText,
  GraduationCap,
  MoreVertical,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { RootState } from "@/types";

interface ListProps {
  onViewDetail: (id: string) => void;
  onMarkUnderReview: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

const statusVariantMap: Record<
  string,
  "green" | "red" | "orange" | "blue" | "outline"
> = {
  pending: "orange",
  under_review: "blue",
  approved: "green",
  rejected: "red",
  completed: "green",
};

const statusLabel: Record<string, string> = {
  pending: "Pending",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
};

const requesterTypeBadge: Record<string, "blue" | "green" | "outline"> = {
  student: "blue",
  parent: "green",
  school: "outline",
};

export function RequestsList({
  onViewDetail,
  onMarkUnderReview,
  onApprove,
  onReject,
}: ListProps) {
  const list = useAppSelector(
    (state: RootState) => state.list.value
  ) as DocumentRequest[];

  return (
    <div className="app__table_container">
      <div className="app__table_wrapper">
        <table className="app__table">
          <thead className="app__table_thead">
            <tr>
              <th className="app__table_th">Tracking #</th>
              <th className="app__table_th">Type</th>
              <th className="app__table_th">Student</th>
              <th className="app__table_th">Requester</th>
              <th className="app__table_th">Status</th>
              <th className="app__table_th">Date</th>
              <th className="app__table_th_right">Actions</th>
            </tr>
          </thead>
          <tbody className="app__table_tbody">
            {list.map((req) => (
              <tr key={req.id} className="app__table_tr">
                <td className="app__table_td">
                  <span className="font-mono text-xs font-medium bg-muted px-1.5 py-0.5 rounded">
                    {req.tracking_number}
                  </span>
                </td>

                <td className="app__table_td">
                  <div className="flex items-center gap-1.5">
                    {req.request_type === "form137" ? (
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="text-sm">
                      {req.request_type === "form137" ? "SF10" : "Diploma"}
                    </span>
                  </div>
                </td>

                <td className="app__table_td">
                  <div className="app__table_cell_text">
                    <div className="app__table_cell_title">{req.student_name}</div>
                    <div className="app__table_cell_subtitle">
                      LRN: {req.student_lrn}
                    </div>
                  </div>
                </td>

                <td className="app__table_td">
                  <div className="app__table_cell_text">
                    <div className="app__table_cell_title">
                      {req.requester_name}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Badge
                        variant={requesterTypeBadge[req.requester_type] ?? "outline"}
                        className="text-[10px] px-1.5 capitalize"
                      >
                        {req.requester_type}
                      </Badge>
                    </div>
                  </div>
                </td>

                <td className="app__table_td">
                  <Badge variant={statusVariantMap[req.status] ?? "outline"}>
                    {statusLabel[req.status] ?? req.status}
                  </Badge>
                </td>

                <td className="app__table_td">
                  <span className="text-sm text-muted-foreground">
                    {new Date(req.created_at).toLocaleDateString()}
                  </span>
                </td>

                <td className="app__table_td_actions">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onViewDetail(req.id)}>
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </DropdownMenuItem>

                      {req.status === "pending" && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onMarkUnderReview(req.id)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Mark Under Review
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onReject(req.id)}
                            className="text-destructive"
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Reject
                          </DropdownMenuItem>
                        </>
                      )}

                      {req.status === "under_review" && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => onApprove(req.id)}>
                            <ThumbsUp className="h-4 w-4 mr-2" />
                            Approve
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onReject(req.id)}
                            className="text-destructive"
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Reject
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
