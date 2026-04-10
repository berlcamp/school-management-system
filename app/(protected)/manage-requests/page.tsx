"use client";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { ClipboardList } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DocumentRequestsTab } from "./components/document-requests/DocumentRequestsTab";
import { IncomingRequestsTab } from "./components/record-requests/IncomingRequestsTab";
import { OutgoingRequestsTab } from "./components/record-requests/OutgoingRequestsTab";

interface PendingCounts {
  documentRequests: number;
  incomingTransfers: number;
  outgoingTransfers: number;
}

export default function RequestsPage() {
  const user = useAppSelector((state) => state.user.user);
  const schoolId = user?.school_id ?? null;
  const [counts, setCounts] = useState<PendingCounts>({
    documentRequests: 0,
    incomingTransfers: 0,
    outgoingTransfers: 0,
  });

  const fetchCounts = useCallback(async () => {
    if (!schoolId) return;

    const [documents, incoming, outgoing] = await Promise.all([
      // Document requests: pending status
      supabase
        .from("sms_requests")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("status", "pending"),
      // Incoming transfers: pending record requests where we are origin
      supabase
        .from("sms_record_requests")
        .select("id", { count: "exact", head: true })
        .eq("origin_school_id", schoolId)
        .eq("status", "pending"),
      // Outgoing transfers: pending record requests where we are requester
      supabase
        .from("sms_record_requests")
        .select("id", { count: "exact", head: true })
        .eq("requesting_school_id", schoolId)
        .eq("status", "pending"),
    ]);

    setCounts({
      documentRequests: documents.count ?? 0,
      incomingTransfers: incoming.count ?? 0,
      outgoingTransfers: outgoing.count ?? 0,
    });
  }, [schoolId]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          Requests
        </h1>
      </div>

      <div className="app__content">
        <Tabs defaultValue="document">
          <TabsList className="mb-4">
            <TabsTrigger value="document" className="gap-1.5">
              Document Requests
              {counts.documentRequests > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1.5 text-[10px]">
                  {counts.documentRequests}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="incoming" className="gap-1.5">
              Incoming Requests
              {counts.incomingTransfers > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1.5 text-[10px]">
                  {counts.incomingTransfers}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="outgoing" className="gap-1.5">
              Outgoing Requests
              {counts.outgoingTransfers > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1.5 text-[10px]">
                  {counts.outgoingTransfers}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="document">
            <DocumentRequestsTab />
          </TabsContent>
          <TabsContent value="incoming">
            <IncomingRequestsTab />
          </TabsContent>
          <TabsContent value="outgoing">
            <OutgoingRequestsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
