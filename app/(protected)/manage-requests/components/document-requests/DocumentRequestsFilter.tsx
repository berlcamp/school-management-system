"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, X } from "lucide-react";

export interface RequestsFilter {
  keyword: string;
  status: string;
  requester_type: string;
  request_type: string;
}

interface FilterProps {
  value: RequestsFilter;
  onChange: (f: RequestsFilter) => void;
}

export function DocumentRequestsFilter({ value, onChange }: FilterProps) {
  const activeCount = [
    value.keyword,
    value.status !== "all" ? value.status : "",
    value.requester_type !== "all" ? value.requester_type : "",
    value.request_type !== "all" ? value.request_type : "",
  ].filter(Boolean).length;

  const handleClear = () => {
    onChange({ keyword: "", status: "all", requester_type: "all", request_type: "all" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 relative">
          <Filter className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">
              {activeCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-3 space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Search
          </label>
          <Input
            placeholder="Tracking #, name, LRN..."
            value={value.keyword}
            onChange={(e) => onChange({ ...value, keyword: e.target.value })}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <Select
            value={value.status}
            onValueChange={(v) => onChange({ ...value, status: v })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Requester Type
          </label>
          <Select
            value={value.requester_type}
            onValueChange={(v) => onChange({ ...value, requester_type: v })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="student">Student</SelectItem>
              <SelectItem value="parent">Parent</SelectItem>
              <SelectItem value="school">School</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Document Type
          </label>
          <Select
            value={value.request_type}
            onValueChange={(v) => onChange({ ...value, request_type: v })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All documents</SelectItem>
              <SelectItem value="form137">School Form 10</SelectItem>
              <SelectItem value="diploma">Diploma</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-1.5 text-muted-foreground"
            onClick={handleClear}
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
