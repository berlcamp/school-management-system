"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Props {
  currentStep: number;
  steps: { label: string; description?: string }[];
}

export default function WizardStepIndicator({ currentStep, steps }: Props) {
  return (
    <div className="flex items-center justify-center w-full px-4 py-2">
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const isCompleted = currentStep > stepNumber;
        const isActive = currentStep === stepNumber;

        return (
          <div key={stepNumber} className="flex items-center">
            {/* Step circle + label */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-300",
                  isCompleted &&
                    "border-primary bg-primary text-primary-foreground",
                  isActive &&
                    "border-primary bg-primary/10 text-primary scale-110",
                  !isCompleted &&
                    !isActive &&
                    "border-muted-foreground/30 text-muted-foreground/50"
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  stepNumber
                )}
              </div>
              <span
                className={cn(
                  "mt-1.5 text-xs font-medium transition-colors duration-200",
                  isActive && "text-primary",
                  isCompleted && "text-primary",
                  !isCompleted && !isActive && "text-muted-foreground/60"
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div className="mx-3 mb-5 h-0.5 w-16 sm:w-24">
                <div
                  className={cn(
                    "h-full rounded-full transition-colors duration-500",
                    isCompleted ? "bg-primary" : "bg-muted-foreground/20"
                  )}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
