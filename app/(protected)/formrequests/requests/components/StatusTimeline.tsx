import {
  CheckCircle2,
  Clock,
  Eye,
  ThumbsUp,
  XCircle,
  PackageCheck,
} from "lucide-react";
import type { RequestLog } from "@/types/database";

interface StatusTimelineProps {
  logs: RequestLog[];
}

const actionConfig: Record<
  string,
  { label: string; icon: React.ReactNode; color: string }
> = {
  created: {
    label: "Request Submitted",
    icon: <Clock className="h-3.5 w-3.5" />,
    color: "bg-blue-500",
  },
  under_review: {
    label: "Marked Under Review",
    icon: <Eye className="h-3.5 w-3.5" />,
    color: "bg-yellow-500",
  },
  approved: {
    label: "Approved",
    icon: <ThumbsUp className="h-3.5 w-3.5" />,
    color: "bg-emerald-500",
  },
  rejected: {
    label: "Rejected",
    icon: <XCircle className="h-3.5 w-3.5" />,
    color: "bg-red-500",
  },
  completed: {
    label: "Completed",
    icon: <PackageCheck className="h-3.5 w-3.5" />,
    color: "bg-emerald-600",
  },
  attachment_added: {
    label: "Attachment Added",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    color: "bg-slate-400",
  },
};

export function StatusTimeline({ logs }: StatusTimelineProps) {
  if (!logs.length) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <ol className="relative space-y-4 pl-6 border-l border-border">
      {logs.map((log) => {
        const config = actionConfig[log.action] ?? {
          label: log.action,
          icon: <Clock className="h-3.5 w-3.5" />,
          color: "bg-slate-400",
        };

        return (
          <li key={log.id} className="relative">
            <span
              className={`absolute -left-[1.35rem] flex h-5 w-5 items-center justify-center rounded-full text-white ${config.color}`}
            >
              {config.icon}
            </span>
            <div className="pl-1">
              <p className="text-sm font-medium">{config.label}</p>
              {log.actor_name && (
                <p className="text-xs text-muted-foreground">
                  by {log.actor_name}
                </p>
              )}
              {log.notes && (
                <p className="text-xs text-muted-foreground mt-0.5 italic">
                  &ldquo;{log.notes}&rdquo;
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(log.created_at).toLocaleString()}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
