"use client";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePendingRequestCounts } from "@/hooks/usePendingRequestCounts";
import { ClipboardList } from "lucide-react";
import { DocumentRequestsTab } from "./components/document-requests/DocumentRequestsTab";
import { IncomingRequestsTab } from "./components/record-requests/IncomingRequestsTab";
import { OutgoingRequestsTab } from "./components/record-requests/OutgoingRequestsTab";

export default function RequestsPage() {
  const { counts } = usePendingRequestCounts();

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
