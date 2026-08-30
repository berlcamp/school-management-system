"use client";

/**
 * Filter rows for the Report Generator.
 *
 * The operators offered come from the field's data type, mirroring
 * `procurements.division_report_operators`. The server validates again and
 * refuses anything this gets wrong — an unrecognised filter RAISES rather than
 * being dropped, because a dropped filter silently widens the result.
 */

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  enumOptions,
  FilterOperator,
  OPERATOR_META,
  operatorArity,
  operatorsFor,
  ReportField,
  ReportFilter,
} from "@/lib/utils/reportBuilder";
import { Plus, X } from "lucide-react";

interface FilterBuilderProps {
  fields: ReportField[];
  filters: ReportFilter[];
  onChange: (filters: ReportFilter[]) => void;
  /** Field keys not worth offering at this scope — see SCHOOL_IDENTITY_FIELDS. */
  hiddenFields?: string[];
}

export function FilterBuilder({
  fields,
  filters,
  onChange,
  hiddenFields = [],
}: FilterBuilderProps) {
  const filterable = fields.filter(
    (f) => f.filterable && !hiddenFields.includes(f.field_key),
  );

  const add = () => {
    const first = filterable[0];
    if (!first) return;
    onChange([
      ...filters,
      { field: first.field_key, op: operatorsFor(first)[0] ?? "eq" },
    ]);
  };

  const update = (index: number, next: ReportFilter) => {
    onChange(filters.map((f, i) => (i === index ? next : f)));
  };

  const remove = (index: number) => {
    onChange(filters.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Filters
        </Label>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={add}
          disabled={filterable.length === 0}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add filter
        </Button>
      </div>

      {filters.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No filters — every row in scope is reported.
        </p>
      ) : (
        <div className="space-y-2">
          {filters.map((filter, index) => (
            <FilterRow
              key={index}
              fields={filterable}
              filter={filter}
              onChange={(next) => update(index, next)}
              onRemove={() => remove(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FilterRowProps {
  fields: ReportField[];
  filter: ReportFilter;
  onChange: (filter: ReportFilter) => void;
  onRemove: () => void;
}

function FilterRow({ fields, filter, onChange, onRemove }: FilterRowProps) {
  const field = fields.find((f) => f.field_key === filter.field);
  const operators = field ? operatorsFor(field) : [];
  const arity = operatorArity(filter.op);

  const onFieldChange = (fieldKey: string) => {
    const next = fields.find((f) => f.field_key === fieldKey);
    if (!next) return;
    // The operator and the value belong to the old field; carry neither over.
    onChange({ field: fieldKey, op: operatorsFor(next)[0] ?? "eq" });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={filter.field} onValueChange={onFieldChange}>
        <SelectTrigger className="h-9 w-[220px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fields.map((f) => (
            <SelectItem key={f.field_key} value={f.field_key}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filter.op}
        onValueChange={(op) =>
          onChange({ field: filter.field, op: op as FilterOperator })
        }
      >
        <SelectTrigger className="h-9 w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((op) => (
            <SelectItem key={op} value={op}>
              {OPERATOR_META[op].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {field && arity !== "none" && (
        <ValueInput
          field={field}
          filter={filter}
          onChange={onChange}
        />
      )}

      <Button
        variant="ghost"
        size="sm"
        className="h-9 px-2"
        onClick={onRemove}
        aria-label="Remove filter"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ValueInput({
  field,
  filter,
  onChange,
}: {
  field: ReportField;
  filter: ReportFilter;
  onChange: (filter: ReportFilter) => void;
}) {
  const arity = operatorArity(filter.op);
  const options = enumOptions(field.enum_source);
  const set = (value: ReportFilter["value"]) =>
    onChange({ ...filter, value });

  if (arity === "two") {
    const pair = Array.isArray(filter.value) ? filter.value : [];
    const inputType = field.data_type === "date" ? "date" : "number";
    return (
      <div className="flex items-center gap-1.5">
        <Input
          type={inputType}
          className="h-9 w-[150px]"
          value={String(pair[0] ?? "")}
          onChange={(e) => set([e.target.value, String(pair[1] ?? "")])}
        />
        <span className="text-xs text-muted-foreground">and</span>
        <Input
          type={inputType}
          className="h-9 w-[150px]"
          value={String(pair[1] ?? "")}
          onChange={(e) => set([String(pair[0] ?? ""), e.target.value])}
        />
      </div>
    );
  }

  if (arity === "many") {
    const chosen = Array.isArray(filter.value) ? filter.value.map(String) : [];

    if (options.length > 0) {
      const toggle = (value: string, checked: boolean) =>
        set(
          checked
            ? [...chosen, value]
            : chosen.filter((v) => v !== value),
        );

      return (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 w-[240px] justify-start font-normal">
              {chosen.length === 0
                ? "Choose values"
                : `${chosen.length} selected`}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-0">
            <ScrollArea className="h-64">
              <div className="space-y-1 p-3">
                {options.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      checked={chosen.includes(option.value)}
                      onChange={(e) => toggle(option.value, e.target.checked)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
      );
    }

    return (
      <Input
        className="h-9 w-[260px]"
        placeholder="Separate values with a comma"
        value={chosen.join(", ")}
        onChange={(e) =>
          set(
            e.target.value
              .split(",")
              .map((v) => v.trim())
              .filter((v) => v !== ""),
          )
        }
      />
    );
  }

  // arity === "one"
  if (field.data_type === "boolean") {
    return (
      <Select value={String(filter.value ?? "")} onValueChange={set}>
        <SelectTrigger className="h-9 w-[160px]">
          <SelectValue placeholder="Choose" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">Yes</SelectItem>
          <SelectItem value="false">No</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  // A picklist is only right for an exact match; `contains` on a coded value
  // wants what the user types.
  if (options.length > 0 && (filter.op === "eq" || filter.op === "neq")) {
    return (
      <Select value={String(filter.value ?? "")} onValueChange={set}>
        <SelectTrigger className="h-9 w-[220px]">
          <SelectValue placeholder="Choose a value" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      type={
        field.data_type === "date"
          ? "date"
          : field.data_type === "number"
            ? "number"
            : "text"
      }
      className="h-9 w-[220px]"
      value={String(filter.value ?? "")}
      onChange={(e) => set(e.target.value)}
      placeholder="Value"
    />
  );
}
