"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

const DISABILITY_CATEGORIES = [
  { group: "Visual Impairment", items: ["Blind", "Low Vision"] },
  { group: "Hearing Impairment", items: ["Deaf", "Hard of Hearing"] },
  {
    group: "Learning Disability",
    items: ["Dyslexia", "Dyscalculia"],
  },
  { group: null, items: ["Intellectual Disability"] },
  { group: null, items: ["Autism Spectrum Disorder"] },
  { group: null, items: ["Emotional / Behavioral Disorder"] },
  { group: null, items: ["Orthopedic / Physical Disability"] },
  { group: null, items: ["Speech / Language Disorder"] },
  { group: null, items: ["Multiple Disabilities"] },
] as const;

interface SNEDDisabilityStepProps {
  selectedDisabilities: string[];
  onDisabilitiesChange: (disabilities: string[]) => void;
  isSubmitting: boolean;
}

export default function SNEDDisabilityStep({
  selectedDisabilities,
  onDisabilitiesChange,
  isSubmitting,
}: SNEDDisabilityStepProps) {
  const toggleDisability = (disability: string) => {
    if (selectedDisabilities.includes(disability)) {
      onDisabilitiesChange(
        selectedDisabilities.filter((d) => d !== disability)
      );
    } else {
      onDisabilitiesChange([...selectedDisabilities, disability]);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">
          Disability / Impairment Information
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Select all applicable disability types (DepEd-aligned categories).
        </p>
      </div>

      <div className="space-y-4">
        {DISABILITY_CATEGORIES.map((category, catIdx) => (
          <div key={catIdx}>
            {category.group && (
              <p className="text-sm font-medium text-muted-foreground mb-2">
                {category.group}
              </p>
            )}
            <div className="space-y-2 ml-1">
              {category.items.map((disability) => {
                const id = `disability-${disability.replace(/\s+/g, "-").toLowerCase()}`;
                return (
                  <div key={disability} className="flex items-center gap-2.5">
                    <Checkbox
                      id={id}
                      checked={selectedDisabilities.includes(disability)}
                      onChange={() => toggleDisability(disability)}
                      disabled={isSubmitting}
                    />
                    <Label
                      htmlFor={id}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {disability}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedDisabilities.length === 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            No disability selected. You may skip this step, but it is
            recommended to provide disability information for SNED learners.
          </span>
        </div>
      )}
    </div>
  );
}
