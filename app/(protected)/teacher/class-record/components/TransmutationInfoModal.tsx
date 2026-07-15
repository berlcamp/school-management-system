"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TRANSMUTATION_TABLE } from "./classRecordUtils";

interface TransmutationInfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransmutationInfoModal({
  open,
  onOpenChange,
}: TransmutationInfoModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>How Transmutation Works</DialogTitle>
          <DialogDescription>
            DepEd Order No. 8, s. 2015 — Transmutation Table
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <p className="font-medium">Step 1 — Initial Grade</p>
            <p className="text-muted-foreground">
              For each component (Written Works, Performance Tasks, Summative
              Test), the learner&apos;s total raw score is divided by the total
              highest possible score to get the Percentage Score (PS). The PS is
              multiplied by the component weight to get the Weighted Score (WS).
              The three Weighted Scores are added together to form the{" "}
              <span className="font-medium text-foreground">Initial Grade</span>.
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-medium">Step 2 — Final Grade</p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">
                Transmute checked:
              </span>{" "}
              the Initial Grade is converted using the DepEd transmutation table
              below. This is the official DepEd computation and it raises low
              scores to the prescribed floor of 60.
            </p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">
                Transmute unchecked:
              </span>{" "}
              the Initial Grade is simply rounded to the nearest whole number, so
              the raw percentage is reported as-is.
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-medium">Example</p>
            <p className="text-muted-foreground">
              An Initial Grade of <span className="font-medium text-foreground">78.5</span>{" "}
              falls in the 77.60–79.19 band, so the transmuted Final Grade is{" "}
              <span className="font-medium text-foreground">86</span>. Without
              transmutation it would simply be{" "}
              <span className="font-medium text-foreground">79</span>.
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-medium">Transmutation Table</p>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">
                      Initial Grade
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      Transmuted Grade
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {TRANSMUTATION_TABLE.map(([threshold, grade], index) => {
                    const upper =
                      index === 0
                        ? null
                        : TRANSMUTATION_TABLE[index - 1][0] - 0.01;
                    return (
                      <tr key={grade} className="border-t">
                        <td className="px-3 py-1.5">
                          {upper === null
                            ? "100"
                            : `${threshold.toFixed(2)} – ${upper.toFixed(2)}`}
                        </td>
                        <td className="px-3 py-1.5">{grade}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t">
                    <td className="px-3 py-1.5">Below 4.00</td>
                    <td className="px-3 py-1.5">60</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
