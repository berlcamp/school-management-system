/**
 * Division Report Generator — the client half of migration 166.
 *
 * The user picks a dataset, its columns and its filters; the RPC returns one
 * JSONB object per row. Everything this module sends is validated again on the
 * server against the seeded catalogue, because the anon key ships in the
 * browser bundle and a gate that only hides a picker is lifted with F12 (the
 * 161 lesson). Nothing here is a security boundary — it is the UI's half of a
 * contract the database enforces.
 */

import {
  GRADE_LEVELS,
  getGradeLevelLabel,
  LEARNING_AREAS,
  SCHOOL_DISTRICTS,
  SCHOOL_TYPES,
  SECTION_TYPE_OPTIONS,
  SHS_STRANDS,
} from "@/lib/constants";
import { USER_TYPE_LABELS } from "@/lib/constants/userTypes";
import { supabase } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// The catalogue, as the two seeded tables describe it
// ---------------------------------------------------------------------------

export type ReportDataType = "text" | "number" | "date" | "boolean" | "enum";

export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "in"
  | "not_in"
  | "contains"
  | "starts_with"
  | "ends_with"
  | "is_null"
  | "not_null";

export interface ReportField {
  field_key: string;
  label: string;
  data_type: ReportDataType;
  enum_source: string | null;
  filterable: boolean;
  default_selected: boolean;
  sort_order: number;
}

export interface ReportDataset {
  key: string;
  label: string;
  description: string | null;
  row_key: string;
  default_sort: string;
  requires_school_year: boolean;
  school_year_column: string | null;
  sort_order: number;
  fields: ReportField[];
}

export type ReportFilterValue = string | number | boolean | (string | number)[];

export interface ReportFilter {
  field: string;
  op: FilterOperator;
  value?: ReportFilterValue;
}

/** One row as the RPC returns it: only the columns the user asked for. */
export type ReportRow = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Operators
//
// `procurements.division_report_operators` is authoritative and rejects
// anything this list gets wrong — an out-of-step client gets a clear error, not
// a wrong answer. This copy exists so the dropdown can be drawn without a round
// trip per field; keep it in step with migration 166 §5.
// ---------------------------------------------------------------------------

export const OPERATORS_BY_TYPE: Record<ReportDataType, FilterOperator[]> = {
  text: [
    "eq",
    "neq",
    "contains",
    "starts_with",
    "ends_with",
    "in",
    "not_in",
    "is_null",
    "not_null",
  ],
  enum: ["eq", "neq", "in", "not_in", "is_null", "not_null"],
  number: [
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "between",
    "in",
    "not_in",
    "is_null",
    "not_null",
  ],
  date: ["eq", "neq", "gt", "gte", "lt", "lte", "between", "is_null", "not_null"],
  boolean: ["eq", "is_null", "not_null"],
};

/** How many values the operator's input needs to collect. */
export type OperatorArity = "none" | "one" | "two" | "many";

export const OPERATOR_META: Record<
  FilterOperator,
  { label: string; arity: OperatorArity }
> = {
  eq: { label: "is", arity: "one" },
  neq: { label: "is not", arity: "one" },
  gt: { label: "is greater than", arity: "one" },
  gte: { label: "is on or after", arity: "one" },
  lt: { label: "is less than", arity: "one" },
  lte: { label: "is on or before", arity: "one" },
  between: { label: "is between", arity: "two" },
  in: { label: "is any of", arity: "many" },
  not_in: { label: "is none of", arity: "many" },
  contains: { label: "contains", arity: "one" },
  starts_with: { label: "starts with", arity: "one" },
  ends_with: { label: "ends with", arity: "one" },
  is_null: { label: "is blank", arity: "none" },
  not_null: { label: "is not blank", arity: "none" },
};

export function operatorsFor(field: ReportField): FilterOperator[] {
  return OPERATORS_BY_TYPE[field.data_type] ?? [];
}

export function operatorArity(op: FilterOperator): OperatorArity {
  return OPERATOR_META[op]?.arity ?? "one";
}

// ---------------------------------------------------------------------------
// Picklists
//
// `enum_source` is a key the catalogue carries for the UI's benefit only; it
// has no server-side meaning. An unrecognised key falls back to a free-text
// box, which is why adding a dataset never requires a code change here first.
// ---------------------------------------------------------------------------

export interface EnumOption {
  value: string;
  label: string;
}

const STAFF_CATEGORY_OPTIONS: EnumOption[] = [
  { value: "teacher", label: "Teaching" },
  { value: "admin", label: "Administrative" },
  { value: "health", label: "Health" },
  { value: "library", label: "Library" },
  { value: "guidance", label: "Guidance" },
  { value: "security", label: "Security" },
  { value: "utility", label: "Utility" },
  { value: "other", label: "Other" },
];

/** Lifecycle statuses of an enrolment (050 / 057 / 066). */
const ENROLLMENT_LIFECYCLE_OPTIONS: EnumOption[] = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "promoted", label: "Promoted" },
  { value: "retained", label: "Retained" },
  { value: "graduated", label: "Graduated" },
  { value: "transferred_out", label: "Transferred Out" },
  { value: "dropped", label: "Dropped" },
  { value: "pending_transfer", label: "Pending Transfer" },
];

export function enumOptions(source: string | null | undefined): EnumOption[] {
  switch (source) {
    case "sex":
      return [
        { value: "male", label: "Male" },
        { value: "female", label: "Female" },
      ];
    case "grade_level":
      return GRADE_LEVELS.map((level) => ({
        value: String(level),
        label: getGradeLevelLabel(level),
      }));
    case "semester":
      return [
        { value: "1", label: "1st Semester" },
        { value: "2", label: "2nd Semester" },
      ];
    case "district":
      return SCHOOL_DISTRICTS.map((d) => ({ value: d, label: d }));
    case "school_type":
      return SCHOOL_TYPES.map((t) => ({ value: t.value, label: t.label }));
    case "section_type":
      return SECTION_TYPE_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
      }));
    case "strand":
      return SHS_STRANDS.map((s) => ({ value: s.code, label: s.label }));
    case "learning_area":
      return LEARNING_AREAS.map((a) => ({ value: a.code, label: a.label }));
    case "user_type":
      return Object.entries(USER_TYPE_LABELS).map(([value, label]) => ({
        value,
        label,
      }));
    case "staff_category":
      return STAFF_CATEGORY_OPTIONS;
    case "enrollment_lifecycle":
      return ENROLLMENT_LIFECYCLE_OPTIONS;
    case "enrollment_approval":
      return [
        { value: "approved", label: "Approved" },
        { value: "pending", label: "Pending" },
        { value: "rejected", label: "Rejected" },
      ];
    case "learner_status":
      return [
        { value: "enrolled", label: "Enrolled" },
        { value: "graduated", label: "Graduated" },
        { value: "transferred", label: "Transferred" },
        { value: "dropped", label: "Dropped" },
      ];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

/** Mirrors the server-side clamp in migration 166 §8. */
export const REPORT_ROW_LIMIT = 5000;

/** Rows per page in the on-screen preview. */
export const REPORT_PAGE_SIZE = 50;

interface DatasetRow {
  key: string;
  label: string;
  description: string | null;
  row_key: string;
  default_sort: string;
  requires_school_year: boolean;
  school_year_column: string | null;
  sort_order: number;
}

interface FieldRow extends ReportField {
  dataset_key: string;
}

/**
 * The catalogue, datasets with their fields nested. Both tables are readable by
 * any authenticated user — they hold labels, not data.
 */
export async function fetchReportDatasets(): Promise<ReportDataset[]> {
  const [datasets, fields] = await Promise.all([
    supabase
      .from("sms_report_datasets")
      .select(
        "key, label, description, row_key, default_sort, requires_school_year, school_year_column, sort_order",
      )
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("sms_report_dataset_fields")
      .select(
        "dataset_key, field_key, label, data_type, enum_source, filterable, default_selected, sort_order",
      )
      .order("sort_order"),
  ]);

  if (datasets.error) throw new Error(datasets.error.message);
  if (fields.error) throw new Error(fields.error.message);

  const byDataset = new Map<string, ReportField[]>();
  ((fields.data as FieldRow[]) ?? []).forEach((f) => {
    const bucket = byDataset.get(f.dataset_key);
    const field: ReportField = {
      field_key: f.field_key,
      label: f.label,
      data_type: f.data_type,
      enum_source: f.enum_source,
      filterable: f.filterable,
      default_selected: f.default_selected,
      sort_order: f.sort_order,
    };
    if (bucket) bucket.push(field);
    else byDataset.set(f.dataset_key, [field]);
  });

  return ((datasets.data as DatasetRow[]) ?? []).map((d) => ({
    ...d,
    fields: byDataset.get(d.key) ?? [],
  }));
}

export interface RunReportParams {
  dataset: string;
  /** In the order the user wants them printed. */
  columns: string[];
  filters: ReportFilter[];
  /** NULL is the whole division (the 106/118/125/157 convention). */
  schoolId: number | null;
  schoolYear: string | null;
  sortField?: string | null;
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

interface RunReportRow {
  row_data: ReportRow;
}

/**
 * Runs one report.
 *
 * Filter values are sent RAW. The server escapes ILIKE wildcards itself, so
 * calling `escapeIlikePattern` here as well would double-escape and a learner
 * whose name really contains an underscore would stop matching.
 */
export async function runReport(params: RunReportParams): Promise<ReportRow[]> {
  const { data, error } = await supabase.rpc("division_report_run", {
    p_dataset: params.dataset,
    p_columns: params.columns,
    p_filters: params.filters,
    p_school_id: params.schoolId,
    p_school_year: params.schoolYear,
    p_sort_field: params.sortField ?? null,
    p_sort_dir: params.sortDir ?? "asc",
    p_limit: params.limit ?? REPORT_PAGE_SIZE,
    p_offset: params.offset ?? 0,
  });

  if (error) throw new Error(error.message);
  return ((data as RunReportRow[]) ?? []).map((r) => r.row_data);
}

export interface CountReportParams {
  dataset: string;
  filters: ReportFilter[];
  schoolId: number | null;
  schoolYear: string | null;
}

/** The unpaginated total for the same dataset, filters and scope. */
export async function countReport(
  params: CountReportParams,
): Promise<number> {
  const { data, error } = await supabase.rpc("division_report_count", {
    p_dataset: params.dataset,
    p_filters: params.filters,
    p_school_id: params.schoolId,
    p_school_year: params.schoolYear,
  });

  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/**
 * Every row matching the report, in pages, up to the server's own cap. The
 * export paths page through rather than asking for a bigger LIMIT.
 */
export async function runReportAll(
  params: Omit<RunReportParams, "limit" | "offset">,
  max: number = REPORT_ROW_LIMIT,
): Promise<ReportRow[]> {
  const rows: ReportRow[] = [];
  const pageSize = 1000;

  while (rows.length < max) {
    const page = await runReport({
      ...params,
      limit: Math.min(pageSize, max - rows.length),
      offset: rows.length,
    });
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/** The dash the DepEd printables use for an empty cell. */
export const EMPTY_CELL = "—";

export function formatReportValue(
  field: ReportField,
  value: unknown,
): string {
  if (value === null || value === undefined || value === "") return EMPTY_CELL;

  if (field.data_type === "boolean" || typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (field.enum_source) {
    const options = enumOptions(field.enum_source);
    const match = options.find((o) => o.value === String(value));
    if (match) return match.label;
  }

  return String(value);
}

/** The fields the user picked, in the order they picked them. */
export function orderedFields(
  dataset: ReportDataset,
  columns: string[],
): ReportField[] {
  return columns
    .map((key) => dataset.fields.find((f) => f.field_key === key))
    .filter((f): f is ReportField => f !== undefined);
}

/** Column headings for exportCsv / the printable. */
export function exportHeaders(fields: ReportField[]): string[] {
  return fields.map((f) => f.label);
}

/**
 * Rows keyed by column LABEL, in the chosen order — the shape exportExcel and
 * exportCsv take. JSONB does not preserve key order, so the order comes from
 * `fields`, never from the row object.
 */
export function toExportRows(
  fields: ReportField[],
  rows: ReportRow[],
): Record<string, string>[] {
  return rows.map((row) => {
    const out: Record<string, string> = {};
    fields.forEach((f) => {
      const formatted = formatReportValue(f, row[f.field_key]);
      out[f.label] = formatted === EMPTY_CELL ? "" : formatted;
    });
    return out;
  });
}

/** A filter the user has not finished filling in should not be sent. */
export function isCompleteFilter(filter: ReportFilter): boolean {
  const arity = operatorArity(filter.op);
  if (arity === "none") return true;

  const value = filter.value;
  if (value === undefined || value === null || value === "") return false;

  if (arity === "many") return Array.isArray(value) && value.length > 0;
  if (arity === "two") return Array.isArray(value) && value.length === 2
    && value.every((v) => v !== "" && v !== null && v !== undefined);

  return !Array.isArray(value);
}

/** A one-line description of the filters, for the printable's header. */
export function describeFilters(
  dataset: ReportDataset,
  filters: ReportFilter[],
): string[] {
  return filters.filter(isCompleteFilter).map((filter) => {
    const field = dataset.fields.find((f) => f.field_key === filter.field);
    const label = field?.label ?? filter.field;
    const opLabel = OPERATOR_META[filter.op]?.label ?? filter.op;

    if (operatorArity(filter.op) === "none") return `${label} ${opLabel}`;

    const values = Array.isArray(filter.value) ? filter.value : [filter.value];
    const shown = values
      .map((v) =>
        field ? formatReportValue(field, v) : String(v ?? ""),
      )
      .join(", ");

    return `${label} ${opLabel} ${shown}`;
  });
}

// ---------------------------------------------------------------------------
// Saved definitions (migration 167)
//
// A saved definition is the INPUTS to a report — dataset, columns, filters,
// sort, scope — never its rows. The school year is deliberately not among them:
// a report saved last year must open on this year (see the migration header).
// ---------------------------------------------------------------------------

export interface ReportDefinition {
  id: number;
  name: string;
  description: string | null;
  dataset_key: string;
  columns: string[];
  filters: ReportFilter[];
  sort_field: string | null;
  sort_dir: "asc" | "desc" | null;
  /** The remembered scope: null = all schools. */
  school_id: number | null;
  owner_id: number;
  is_division_shared: boolean;
}

const DEFINITION_COLUMNS =
  "id, name, description, dataset_key, columns, filters, sort_field, sort_dir, school_id, owner_id, is_division_shared";

/** Every definition the caller may see: their own, plus the division's. */
export async function fetchReportDefinitions(): Promise<ReportDefinition[]> {
  const { data, error } = await supabase
    .from("sms_report_definitions")
    .select(DEFINITION_COLUMNS)
    .order("name");

  if (error) throw new Error(error.message);
  return (data as ReportDefinition[]) ?? [];
}

export interface SaveReportDefinitionInput {
  name: string;
  description: string | null;
  datasetKey: string;
  columns: string[];
  filters: ReportFilter[];
  sortField: string | null;
  sortDir: "asc" | "desc" | null;
  schoolId: number | null;
  isDivisionShared: boolean;
  /** `sms_users.id` — RLS refuses any other author. */
  ownerId: number;
}

export async function saveReportDefinition(
  input: SaveReportDefinitionInput,
): Promise<ReportDefinition> {
  const { data, error } = await supabase
    .from("sms_report_definitions")
    .insert({
      name: input.name.trim(),
      description: input.description,
      dataset_key: input.datasetKey,
      columns: input.columns,
      filters: input.filters,
      sort_field: input.sortField,
      sort_dir: input.sortDir,
      school_id: input.schoolId,
      is_division_shared: input.isDivisionShared,
      owner_id: input.ownerId,
    })
    .select(DEFINITION_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return data as ReportDefinition;
}

/** Overwrites a definition in place, keeping its id and its author. */
export async function updateReportDefinition(
  id: number,
  input: Omit<SaveReportDefinitionInput, "ownerId">,
): Promise<void> {
  const { error } = await supabase
    .from("sms_report_definitions")
    .update({
      name: input.name.trim(),
      description: input.description,
      dataset_key: input.datasetKey,
      columns: input.columns,
      filters: input.filters,
      sort_field: input.sortField,
      sort_dir: input.sortDir,
      school_id: input.schoolId,
      is_division_shared: input.isDivisionShared,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function deleteReportDefinition(id: number): Promise<void> {
  const { error } = await supabase
    .from("sms_report_definitions")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}

/**
 * Whether this session may edit a definition. RLS decides for real (167); this
 * only keeps a button from being offered that would fail.
 */
export function canManageDefinition(
  definition: ReportDefinition,
  currentUserId: number | undefined,
  currentUserType: string | undefined,
): boolean {
  if (currentUserId !== undefined && definition.owner_id === currentUserId) {
    return true;
  }
  return (
    definition.is_division_shared &&
    (currentUserType === "division_admin" || currentUserType === "super admin")
  );
}
