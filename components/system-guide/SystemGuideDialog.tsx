"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { cn } from "@/lib/utils";
import { BookOpenCheck, ChevronRight, Lightbulb } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { ScrollArea } from "../ui/scroll-area";
import {
  type GuideCategory,
  type ModuleGuide,
  getVisibleGuides,
} from "./system-guide-data";

interface SystemGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SystemGuideDialog({
  open,
  onOpenChange,
}: SystemGuideDialogProps) {
  const user = useAppSelector((state) => state.user.user);
  const categories = useMemo(
    () => getVisibleGuides(user?.type ?? "", user?.is_tutor === true),
    [user?.type, user?.is_tutor]
  );

  const allModules = useMemo(
    () => categories.flatMap((c) => c.modules),
    [categories]
  );

  const [selectedId, setSelectedId] = useState<string>("");

  const activeModule =
    allModules.find((m) => m.id === selectedId) ?? allModules[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="sm:max-w-5xl h-[85vh] max-h-[85vh] p-0 flex flex-col gap-0 overflow-hidden"
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
              <BookOpenCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">System Guide</DialogTitle>
              <DialogDescription>
                Step-by-step workflows for every module in the system.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Left Panel - Module Navigation */}
          <div className="hidden md:block w-64 shrink-0 border-r bg-muted/30">
            <ScrollArea className="h-full">
              <nav className="p-3 space-y-4">
                {categories.map((category) => (
                  <CategoryGroup
                    key={category.id}
                    category={category}
                    activeId={activeModule?.id ?? ""}
                    onSelect={setSelectedId}
                  />
                ))}
              </nav>
            </ScrollArea>
          </div>

          {/* Mobile Module Selector */}
          <div className="md:hidden border-b shrink-0 w-full">
            <ScrollArea className="w-full">
              <div className="flex gap-1 p-2 overflow-x-auto">
                {allModules.map((mod) => (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => setSelectedId(mod.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                      activeModule?.id === mod.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <mod.icon className="w-3.5 h-3.5" />
                    {mod.title}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Right Panel - Workflow Content */}
          <div className="flex-1 min-w-0">
            <ScrollArea className="h-full">
              {activeModule && <WorkflowContent module={activeModule} />}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryGroup({
  category,
  activeId,
  onSelect,
}: {
  category: GuideCategory;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <p className="px-2 mb-1.5 text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
        {category.label}
      </p>
      <div className="space-y-0.5">
        {category.modules.map((mod) => {
          const isActive = mod.id === activeId;
          return (
            <button
              key={mod.id}
              type="button"
              onClick={() => onSelect(mod.id)}
              className={cn(
                "relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150",
                "hover:bg-accent/50",
                isActive
                  ? "bg-accent text-accent-foreground font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full" />
              )}
              <mod.icon
                className={cn(
                  "w-4 h-4 shrink-0",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              />
              <span className="truncate">{mod.title}</span>
              {isActive && (
                <ChevronRight className="w-3.5 h-3.5 ml-auto shrink-0 text-muted-foreground" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WorkflowContent({ module: mod }: { module: ModuleGuide }) {
  return (
    <div className="p-6">
      {/* Module Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <mod.icon className="w-5.5 h-5.5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {mod.title}
            </h2>
            <p className="text-sm text-muted-foreground">{mod.description}</p>
          </div>
        </div>
      </div>

      {/* Workflow Steps */}
      <div className="relative">
        {mod.steps.map((step, idx) => {
          const isLast = idx === mod.steps.length - 1;
          return (
            <div key={idx} className="flex gap-4 group">
              {/* Step indicator column */}
              <div className="flex flex-col items-center shrink-0">
                {/* Numbered circle */}
                <div
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold shrink-0 transition-colors",
                    isLast
                      ? "bg-green-500/15 text-green-600 ring-1 ring-green-500/30"
                      : "bg-primary/10 text-primary ring-1 ring-primary/20"
                  )}
                >
                  {idx + 1}
                </div>
                {/* Connecting line */}
                {!isLast && (
                  <div className="w-px flex-1 my-1 bg-border" />
                )}
              </div>

              {/* Step content */}
              <div className={cn("pb-6 flex-1 min-w-0", isLast && "pb-0")}>
                <h3 className="font-medium text-sm mb-1 text-foreground">
                  {step.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
                {step.tip && (
                  <div className="mt-2.5 flex gap-2 items-start p-3 rounded-lg bg-amber-500/5 border border-amber-500/15">
                    <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                      {step.tip}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
