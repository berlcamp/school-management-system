"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createContext, useContext, useMemo, useState } from "react";
import type { ReviewEntity } from "@/lib/constants/examReview";
import { ReviewHistory } from "./ReviewHistory";

interface HistoryDialogApi {
  show: (entity: ReviewEntity, id: string) => void;
}

const Ctx = createContext<HistoryDialogApi | null>(null);

/**
 * Owns the review-history dialog above the row menus. A dropdown's content
 * unmounts when it closes, so the dialog cannot live inside the menu item.
 */
export function ReviewHistoryDialogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [target, setTarget] = useState<{
    entity: ReviewEntity;
    id: string;
  } | null>(null);
  const api = useMemo<HistoryDialogApi>(
    () => ({ show: (entity, id) => setTarget({ entity, id }) }),
    [],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review history</DialogTitle>
          </DialogHeader>
          {target && <ReviewHistory entity={target.entity} id={target.id} />}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setTarget(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}

/** null when no provider is mounted. */
export function useReviewHistoryDialog(): HistoryDialogApi | null {
  return useContext(Ctx);
}
