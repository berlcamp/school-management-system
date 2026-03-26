"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppSelector } from "@/lib/redux/hook";
import { ArrowLeftRight } from "lucide-react";
import { useState } from "react";
import IncomingRequests from "./components/IncomingRequests";
import OutgoingRequests from "./components/OutgoingRequests";

export default function RecordRequestsPage() {
  const user = useAppSelector((state) => state.user.user);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("incoming");

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5" />
          Record Requests
        </h1>
        <div className="app__title_actions flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="app__content">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="incoming">Incoming Requests</TabsTrigger>
            <TabsTrigger value="outgoing">Outgoing Requests</TabsTrigger>
          </TabsList>
          <TabsContent value="incoming">
            <IncomingRequests
              schoolId={user?.school_id ?? null}
              userId={user?.system_user_id ?? null}
              statusFilter={statusFilter}
            />
          </TabsContent>
          <TabsContent value="outgoing">
            <OutgoingRequests
              schoolId={user?.school_id ?? null}
              userId={user?.system_user_id ?? null}
              statusFilter={statusFilter}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
