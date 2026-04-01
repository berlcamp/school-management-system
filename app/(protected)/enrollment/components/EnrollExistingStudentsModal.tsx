"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useGpaThresholds } from "@/hooks/useGpaThresholds";
import { useAppSelector } from "@/lib/redux/hook";
import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { EnrollStudentsTabContent } from "./EnrollStudentsTabContent";

interface EnrollExistingStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEnrolled: () => void;
}

export function EnrollExistingStudentsModal({
  isOpen,
  onClose,
  onEnrolled,
}: EnrollExistingStudentsModalProps) {
  const user = useAppSelector((state) => state.user.user);
  const { thresholds } = useGpaThresholds(isOpen, user?.school_id);
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-[1100px] max-h-[90vh] overflow-hidden flex flex-col p-0"
        onEscapeKeyDown={(e) => submitting && e.preventDefault()}
        onInteractOutside={(e) => submitting && e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <ClipboardList className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold">
                Auto Enroll
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                Select students and assign them to sections for enrollment.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs
          defaultValue="promoted"
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="mx-6 mt-4 w-fit">
            <TabsTrigger value="promoted" disabled={submitting}>
              Promoted Students
            </TabsTrigger>
            <TabsTrigger value="retained" disabled={submitting}>
              Retained Students
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="promoted"
            forceMount
            className="flex-1 flex flex-col overflow-hidden mt-0 data-[state=inactive]:hidden"
          >
            <EnrollStudentsTabContent
              mode="promoted"
              isOpen={isOpen}
              onClose={onClose}
              onEnrolled={onEnrolled}
              user={user}
              thresholds={thresholds}
              onSubmittingChange={setSubmitting}
            />
          </TabsContent>
          <TabsContent
            value="retained"
            forceMount
            className="flex-1 flex flex-col overflow-hidden mt-0 data-[state=inactive]:hidden"
          >
            <EnrollStudentsTabContent
              mode="retained"
              isOpen={isOpen}
              onClose={onClose}
              onEnrolled={onEnrolled}
              user={user}
              thresholds={thresholds}
              onSubmittingChange={setSubmitting}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
