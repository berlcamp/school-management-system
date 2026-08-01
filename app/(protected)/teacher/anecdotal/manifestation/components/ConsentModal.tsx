"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CONSENT_STATUS_LABELS,
  isConsentGranted,
} from "@/lib/constants/manifestation";
import type { ManifestationConsentStatus, ManifestationTag } from "@/types";
import { Loader2, Printer } from "lucide-react";
import { useEffect, useState } from "react";

export interface ConsentFormValues {
  consent_status: ManifestationConsentStatus;
  consent_date: string;
  consent_signatory: string;
  consent_relationship: string;
  disagree_reason: string;
}

interface ConsentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  learnerName: string;
  tag: ManifestationTag | null;
  submitting?: boolean;
  printing?: boolean;
  onPrint: () => void;
  onSubmit: (values: ConsentFormValues) => void | Promise<void>;
}

const OPTIONS: ManifestationConsentStatus[] = [
  "pending",
  "agree_lis_and_medical",
  "agree_lis_only",
  "disagree",
];

function blank(): ConsentFormValues {
  return {
    consent_status: "pending",
    consent_date: "",
    consent_signatory: "",
    consent_relationship: "",
    disagree_reason: "",
  };
}

/**
 * Records the parent/guardian's answer on the returned SNED consent form, and
 * prints a fresh blank form for signing.
 *
 * The options are the form's own three, plus 'pending' for a form that has been
 * issued but not yet returned.
 */
export function ConsentModal({
  open,
  onOpenChange,
  learnerName,
  tag,
  submitting,
  printing,
  onPrint,
  onSubmit,
}: ConsentModalProps) {
  const [values, setValues] = useState<ConsentFormValues>(blank());
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setValues(
      tag
        ? {
            consent_status: tag.consent_status,
            consent_date: tag.consent_date ?? "",
            consent_signatory: tag.consent_signatory ?? "",
            consent_relationship: tag.consent_relationship ?? "",
            disagree_reason: tag.disagree_reason ?? "",
          }
        : blank(),
    );
  }, [open, tag]);

  const responded = values.consent_status !== "pending";
  const missingReason =
    values.consent_status === "disagree" && !values.disagree_reason.trim();
  const missingDate = responded && !values.consent_date;
  const invalid = missingReason || missingDate;

  const handleSubmit = async () => {
    setTouched(true);
    if (invalid) return;
    await onSubmit(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Parent / Guardian Consent — {learnerName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="text-sm">
              Print the consent form, have the parent/guardian sign it, then
              record their answer below.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={onPrint}
              disabled={printing}
            >
              {printing ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Printer className="mr-1 h-4 w-4" />
              )}
              Print Consent Form
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Parent/Guardian answer</label>
            <div className="space-y-2">
              {OPTIONS.map((opt) => (
                <label
                  key={opt}
                  className="flex items-start gap-2 rounded-md border p-2 text-sm has-[:checked]:border-primary"
                >
                  <input
                    type="radio"
                    className="mt-0.5"
                    name="consent-status"
                    checked={values.consent_status === opt}
                    onChange={() =>
                      setValues((p) => ({
                        ...p,
                        consent_status: opt,
                        // Only a refusal carries a reason.
                        disagree_reason:
                          opt === "disagree" ? p.disagree_reason : "",
                        // A form not yet returned has no response details.
                        ...(opt === "pending"
                          ? {
                              consent_date: "",
                              consent_signatory: "",
                              consent_relationship: "",
                            }
                          : {}),
                      }))
                    }
                  />
                  <span>{CONSENT_STATUS_LABELS[opt]}</span>
                </label>
              ))}
            </div>
          </div>

          {values.consent_status === "disagree" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Reason for refusal<span className="text-red-500"> *</span>
              </label>
              <Textarea
                rows={2}
                value={values.disagree_reason}
                onChange={(e) =>
                  setValues((p) => ({ ...p, disagree_reason: e.target.value }))
                }
                className={
                  touched && missingReason ? "border-red-500" : undefined
                }
              />
            </div>
          )}

          {responded && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Date returned<span className="text-red-500"> *</span>
                </label>
                <Input
                  type="date"
                  value={values.consent_date}
                  onChange={(e) =>
                    setValues((p) => ({ ...p, consent_date: e.target.value }))
                  }
                  className={
                    touched && missingDate ? "border-red-500" : undefined
                  }
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Relationship</label>
                <Input
                  placeholder="e.g. Mother, Guardian"
                  value={values.consent_relationship}
                  onChange={(e) =>
                    setValues((p) => ({
                      ...p,
                      consent_relationship: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium">
                  Signed by (printed name)
                </label>
                <Input
                  value={values.consent_signatory}
                  onChange={(e) =>
                    setValues((p) => ({
                      ...p,
                      consent_signatory: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
          )}

          {isConsentGranted(values.consent_status) && (
            <p className="text-xs text-emerald-700">
              With consent recorded, this learner is identified for SNED
              enrollment.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Consent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
