"use client";

import { useAppSelector } from "@/lib/redux/hook";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  BookOpenCheck,
  ChevronRight,
  Lightbulb,
  Search,
  SearchX,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
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
  type GuideSearchResult,
  type ModuleGuide,
  type SubModuleGuide,
  getVisibleGuides,
  searchGuides,
  splitSearchTerms,
} from "./system-guide-data";

/**
 * What the reader is looking at. `subId` is set only when they drilled into a
 * sub-module — a screen that lives inside a module (a tab, a row action, a page
 * you reach by opening a record) rather than beside it in the sidebar.
 */
interface Selection {
  moduleId: string;
  subId?: string;
}

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

  const [selected, setSelected] = useState<Selection | null>(null);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const terms = useMemo(() => splitSearchTerms(query), [query]);
  const isSearching = terms.length > 0;

  const results = useMemo(
    () => (isSearching ? searchGuides(categories, query) : []),
    [categories, query, isSearching]
  );

  // A query left over from the last time the guide was opened would hide the
  // module the reader came back for, so every fresh open starts clean.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const activeModule =
    allModules.find((m) => m.id === selected?.moduleId) ?? allModules[0];

  // A stale subId can outlive its module only if the roles change mid-dialog, so
  // resolve it against the active module rather than trusting the selection.
  const activeSub =
    selected?.moduleId === activeModule?.id && selected?.subId
      ? activeModule?.subModules?.find((s) => s.id === selected.subId)
      : undefined;

  /** Opening a result is also how a search ends — the reader found what they wanted. */
  const openResult = (result: GuideSearchResult) => {
    setSelected({ moduleId: result.moduleId, subId: result.subId });
    setQuery("");
  };

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

          {/* Search — matches module and screen names as well as the text of
              every step, so "LRN" finds Enrollment and the Student Roster even
              though no module carries that word in its title. */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Escape clears the search first and only closes the dialog on
                // a second press, which is what a reader mid-search expects.
                if (e.key === "Escape" && query) {
                  e.preventDefault();
                  e.stopPropagation();
                  setQuery("");
                }
                if (e.key === "Enter" && results.length > 0) {
                  e.preventDefault();
                  openResult(results[0]);
                }
              }}
              placeholder="Search guides — module, screen, or any step…"
              aria-label="Search the system guide"
              className="w-full h-10 pl-9 pr-9 rounded-lg border bg-background text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
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
                    activeSubId={activeSub?.id}
                    onSelect={setSelected}
                  />
                ))}
              </nav>
            </ScrollArea>
          </div>

          {/* Mobile Module Selector — the result list replaces it while searching */}
          <div
            className={cn(
              "md:hidden border-b shrink-0 w-full",
              isSearching && "hidden"
            )}
          >
            <ScrollArea className="w-full">
              <div className="flex gap-1 p-2 overflow-x-auto">
                {allModules.map((mod) => (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => setSelected({ moduleId: mod.id })}
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
              {isSearching ? (
                <SearchResults
                  query={query}
                  terms={terms}
                  results={results}
                  onOpen={openResult}
                />
              ) : (
                activeModule && (
                  <WorkflowContent
                    module={activeModule}
                    activeSub={activeSub}
                    onSelect={setSelected}
                  />
                )
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Wraps every occurrence of a search term in a <mark>. Splitting on a capturing
 * group keeps the untouched text at even indexes and the hits at odd ones, so
 * the original spacing and punctuation survive verbatim.
 */
function Highlight({ text, terms }: { text: string; terms: string[] }): ReactNode {
  if (terms.length === 0) return text;

  const pattern = new RegExp(
    `(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi"
  );

  return text.split(pattern).map((part, idx) =>
    idx % 2 === 1 ? (
      <mark
        key={idx}
        className="rounded-sm bg-amber-200/70 px-0.5 text-foreground dark:bg-amber-500/30"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function SearchResults({
  query,
  terms,
  results,
  onOpen,
}: {
  query: string;
  terms: string[];
  results: GuideSearchResult[];
  onOpen: (result: GuideSearchResult) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="flex items-center justify-center w-12 h-12 mb-4 rounded-xl bg-muted">
          <SearchX className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">
          No guide matches “{query}”
        </p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground leading-relaxed">
          Try a single keyword — a module name like “enrollment”, or a word from
          the task itself like “transfer”, “LRN”, or “report card”.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <p className="mb-4 text-xs text-muted-foreground">
        {results.length} {results.length === 1 ? "guide" : "guides"} match “
        {query}”
      </p>

      <div className="space-y-2">
        {results.map((result) => (
          <button
            key={`${result.moduleId}/${result.subId ?? ""}`}
            type="button"
            onClick={() => onOpen(result)}
            className="group w-full flex items-start gap-3 p-3.5 rounded-lg border text-left transition-colors hover:bg-accent/50 hover:border-primary/30"
          >
            <div className="flex items-center justify-center w-9 h-9 shrink-0 rounded-lg bg-primary/10 text-primary">
              <result.icon className="w-4 h-4" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                {result.breadcrumb}
              </p>
              <p className="text-sm font-medium text-foreground">
                <Highlight text={result.title} terms={terms} />
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                <Highlight text={result.description} terms={terms} />
              </p>

              {/* The steps that matched — evidence for why this result is here. */}
              {result.matches.length > 0 && (
                <div className="mt-2.5 space-y-1.5 border-l-2 border-border pl-3">
                  {result.matches.map((match) => (
                    <div key={match.label}>
                      <p className="text-[11px] font-medium text-foreground/80">
                        <Highlight text={match.label} terms={terms} />
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                        <Highlight text={match.snippet} terms={terms} />
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <ChevronRight className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ))}
      </div>
    </div>
  );
}

function CategoryGroup({
  category,
  activeId,
  activeSubId,
  onSelect,
}: {
  category: GuideCategory;
  activeId: string;
  activeSubId?: string;
  onSelect: (selection: Selection) => void;
}) {
  return (
    <div>
      <p className="px-2 mb-1.5 text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
        {category.label}
      </p>
      <div className="space-y-0.5">
        {category.modules.map((mod) => {
          const isActive = mod.id === activeId;
          const subModules = mod.subModules ?? [];
          return (
            <div key={mod.id}>
              <button
                type="button"
                onClick={() => onSelect({ moduleId: mod.id })}
                className={cn(
                  "relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150",
                  "hover:bg-accent/50",
                  isActive && !activeSubId
                    ? "bg-accent text-accent-foreground font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                  isActive && activeSubId && "text-foreground font-medium"
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
                {subModules.length > 0 && (
                  <span
                    className={cn(
                      "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {subModules.length}
                  </span>
                )}
                {isActive && subModules.length === 0 && (
                  <ChevronRight className="w-3.5 h-3.5 ml-auto shrink-0 text-muted-foreground" />
                )}
              </button>

              {/* Sub-modules only unfold under the module you are reading, so the
                  sidebar never becomes a wall of every screen in the system. */}
              {isActive && subModules.length > 0 && (
                <div className="mt-0.5 ml-5 pl-3 border-l border-border space-y-0.5">
                  {subModules.map((sub) => {
                    const isSubActive = sub.id === activeSubId;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() =>
                          onSelect({ moduleId: mod.id, subId: sub.id })
                        }
                        className={cn(
                          "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors",
                          "hover:bg-accent/50",
                          isSubActive
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <sub.icon
                          className={cn(
                            "w-3.5 h-3.5 shrink-0",
                            isSubActive ? "text-primary" : "text-muted-foreground"
                          )}
                        />
                        <span className="truncate text-left">{sub.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkflowContent({
  module: mod,
  activeSub,
  onSelect,
}: {
  module: ModuleGuide;
  activeSub?: SubModuleGuide;
  onSelect: (selection: Selection) => void;
}) {
  const subModules = mod.subModules ?? [];
  const shown = activeSub ?? mod;
  const Icon = shown.icon;

  return (
    <div className="p-6">
      {/* Header — a sub-module says which module it belongs to and how to get back */}
      <div className="mb-8">
        {activeSub && (
          <button
            type="button"
            onClick={() => onSelect({ moduleId: mod.id })}
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {mod.title}
            <span className="text-muted-foreground/60">/ {activeSub.title}</span>
          </button>
        )}
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 ring-1 ring-primary/20">
            <Icon className="w-5.5 h-5.5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {shown.title}
            </h2>
            <p className="text-sm text-muted-foreground">{shown.description}</p>
          </div>
        </div>
      </div>

      {/* Workflow Steps */}
      <div className="relative">
        {shown.steps.map((step, idx) => {
          const isLast = idx === shown.steps.length - 1;
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

      {/* Sub-modules — the screens inside this module. Shown on the module view
          only; from a sub-module the sidebar and the back link are the way out.
          This is also the only path to them on mobile, where the sidebar with
          its nested list is hidden. */}
      {!activeSub && subModules.length > 0 && (
        <div className="mt-10 pt-6 border-t">
          <p className="mb-1 text-sm font-semibold text-foreground">
            Inside this module
          </p>
          <p className="mb-4 text-xs text-muted-foreground">
            {subModules.length} screens live inside {mod.title}. Pick one for its
            own step-by-step workflow.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {subModules.map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => onSelect({ moduleId: mod.id, subId: sub.id })}
                className="group flex items-start gap-3 p-3 rounded-lg border text-left transition-colors hover:bg-accent/50 hover:border-primary/30"
              >
                <div className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-primary/10 text-primary">
                  <sub.icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {sub.title}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {sub.description}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
