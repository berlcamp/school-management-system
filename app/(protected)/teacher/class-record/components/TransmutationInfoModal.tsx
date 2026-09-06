"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ClassRecordGradingScheme,
  TRANSMUTATION_FLOOR,
  alwaysTransmutes,
  descriptorBandsFor,
  transmutationTableFor,
} from "@/lib/constants/classRecord";

interface TransmutationInfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The scheme of the record being viewed — an old record keeps the old table. */
  scheme: ClassRecordGradingScheme;
}

export function TransmutationInfoModal({
  open,
  onOpenChange,
  scheme,
}: TransmutationInfoModalProps) {
  const table = transmutationTableFor(scheme);
  const bands = descriptorBandsFor(scheme);
  const isMatatag = alwaysTransmutes(scheme);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>How Transmutation Works</DialogTitle>
          <DialogDescription>
            {isMatatag
              ? "K to 10 Electronic Class Record (Updated) — Transmutation Table"
              : "DepEd Order No. 8, s. 2015 — Transmutation Table"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <p className="font-medium">Step 1 — Initial Grade</p>
            <p className="text-muted-foreground">
              For each component (Written / Oral Works, Product / Performance
              Tasks, {isMatatag ? "Examinations" : "Summative Tests"}), the
              learner&apos;s total raw score is divided by the total highest
              possible score to get the Percentage Score (PS). The PS is
              multiplied by the component weight to get the Weighted Score (WS).
              The three Weighted Scores are added together to form the{" "}
              <span className="font-medium text-foreground">Initial Grade</span>.
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-medium">Step 2 — Term Grade</p>
            {isMatatag ? (
              <p className="text-muted-foreground">
                The Initial Grade is converted using the table below. The
                updated DepEd form transmutes{" "}
                <span className="font-medium text-foreground">always</span> —
                there is no option to report the raw percentage. An Initial
                Grade of 70.00 is the passing floor and becomes 75; anything
                lower is lifted no further than {TRANSMUTATION_FLOOR}.
              </p>
            ) : (
              <>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Transmute checked:
                  </span>{" "}
                  the Initial Grade is converted using the DepEd transmutation
                  table below. This raises low scores to the prescribed floor of{" "}
                  {TRANSMUTATION_FLOOR}.
                </p>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Transmute unchecked:
                  </span>{" "}
                  the Initial Grade is simply rounded to the nearest whole
                  number, so the raw percentage is reported as-is.
                </p>
              </>
            )}
          </div>

          <div className="space-y-2">
            <p className="font-medium">Example</p>
            <p className="text-muted-foreground">
              {isMatatag ? (
                <>
                  An Initial Grade of{" "}
                  <span className="font-medium text-foreground">84.00</span>{" "}
                  falls in the 82.98–84.15 band, so the Term Grade is{" "}
                  <span className="font-medium text-foreground">86</span>. Under
                  the older DO 8, s. 2015 table the same Initial Grade would
                  have become 90.
                </>
              ) : (
                <>
                  An Initial Grade of{" "}
                  <span className="font-medium text-foreground">78.5</span>{" "}
                  falls in the 77.60–79.19 band, so the transmuted Term Grade is{" "}
                  <span className="font-medium text-foreground">86</span>.
                  Without transmutation it would simply be{" "}
                  <span className="font-medium text-foreground">79</span>.
                </>
              )}
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
                  {table.map(([threshold, grade], index) => {
                    const upper =
                      index === 0 ? null : table[index - 1][0] - 0.01;
                    return (
                      <tr key={grade} className="border-t">
                        <td className="px-3 py-1.5">
                          {upper === null
                            ? `${threshold.toFixed(2)} and above`
                            : `${threshold.toFixed(2)} – ${upper.toFixed(2)}`}
                        </td>
                        <td className="px-3 py-1.5">{grade}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t">
                    <td className="px-3 py-1.5">
                      Below {table[table.length - 1][0].toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5">{TRANSMUTATION_FLOOR}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-medium">Descriptors</p>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Grade</th>
                    <th className="px-3 py-2 text-left font-medium">
                      Descriptor
                    </th>
                    {isMatatag && (
                      <th className="px-3 py-2 text-left font-medium">
                        General Description
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {bands.map((b) => (
                    <tr key={b.label} className="border-t">
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {b.range}
                      </td>
                      <td className="px-3 py-1.5 font-medium">{b.label}</td>
                      {isMatatag && (
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {b.description}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
