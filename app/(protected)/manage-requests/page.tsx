"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardList } from "lucide-react";
import { DocumentRequestsTab } from "./components/document-requests/DocumentRequestsTab";
import { IncomingRequestsTab } from "./components/record-requests/IncomingRequestsTab";
import { OutgoingRequestsTab } from "./components/record-requests/OutgoingRequestsTab";
import { PendingReviewsTab } from "./components/record-requests/PendingReviewsTab";

export default function RequestsPage() {
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
            <TabsTrigger value="pending-reviews">Pending Reviews</TabsTrigger>
            <TabsTrigger value="document">Document Requests</TabsTrigger>
            <TabsTrigger value="incoming">Incoming Transfers</TabsTrigger>
            <TabsTrigger value="outgoing">Outgoing Transfers</TabsTrigger>
          </TabsList>
          <TabsContent value="pending-reviews">
            <PendingReviewsTab />
          </TabsContent>
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
