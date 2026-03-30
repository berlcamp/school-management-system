import {
  CheckCircle2,
  Clock,
  Eye,
  ThumbsUp,
  XCircle,
  PackageCheck,
} from "lucide-react";

interface TimelineEntry {
  action: string;
  actor_name: string | null;
  notes: string | null;
  created_at: string;
}

interface StatusTimelineProps {
  logs: TimelineEntry[];
}

const actionConfig: Record<
  string,
  { label: string; icon: React.ReactNode; color: string }
> = {
  created: {
    label: "Request Submitted",
    icon: <Clock className="h-4 w-4" />,
    color: "bg-blue-500/80",
  },
  under_review: {
    label: "Under Review",
    icon: <Eye className="h-4 w-4" />,
    color: "bg-yellow-500/80",
  },
  approved: {
    label: "Approved",
    icon: <ThumbsUp className="h-4 w-4" />,
    color: "bg-emerald-500/80",
  },
  rejected: {
    label: "Rejected",
    icon: <XCircle className="h-4 w-4" />,
    color: "bg-red-500/80",
  },
  completed: {
    label: "Completed",
    icon: <PackageCheck className="h-4 w-4" />,
    color: "bg-emerald-600/80",
  },
  attachment_added: {
    label: "Attachment Added",
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "bg-slate-500/80",
  },
};

export function StatusTimeline({ logs }: StatusTimelineProps) {
  if (!logs.length) {
    return (
      <p className="text-sm text-white/60 py-2">No activity yet.</p>
    );
  }

  return (
    <ol className="relative space-y-4 pl-6 border-l border-white/20">
      {logs.map((log, idx) => {
        const config = actionConfig[log.action] ?? {
          label: log.action,
          icon: <Clock className="h-4 w-4" />,
          color: "bg-slate-500/80",
        };

        return (
          <li key={idx} className="relative">
            {/* Dot */}
            <span
              className={`absolute -left-[1.45rem] flex h-6 w-6 items-center justify-center rounded-full text-white ${config.color}`}
            >
              {config.icon}
            </span>

            <div className="pl-2">
              <p className="text-sm font-medium text-white">{config.label}</p>
              {log.actor_name && (
                <p className="text-xs text-white/60">by {log.actor_name}</p>
              )}
              {log.notes && (
                <p className="text-xs text-white/70 mt-0.5 italic">
                  &ldquo;{log.notes}&rdquo;
                </p>
              )}
              <p className="text-xs text-white/50 mt-0.5">
                {new Date(log.created_at).toLocaleString()}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
