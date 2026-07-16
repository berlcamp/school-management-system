"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  SRC_AWARD_COLUMNS,
  SRC_CONTRIBUTION_COLUMNS,
  SRC_DROPOUT_CAUSE_COLUMNS,
  SRC_ENROLLMENT_COLUMNS,
  SRC_HEALTH_COLUMNS,
  SRC_MATERIAL_COLUMNS,
  SRC_PARTICIPATION_COLUMNS,
  SRC_PARTNER_COLUMNS,
  SRC_PD_COLUMNS,
  SRC_PERFORMANCE_COLUMNS,
  SRC_RATE_COLUMNS,
  SRC_RATIO_COLUMNS,
  type SrcColumn,
  type SrcSectionMeta,
} from "@/lib/constants/src";
import type { SrcSectionKey, SrcSectionPayloadMap } from "@/types";
import { fromSrcRows, SrcRowsEditor, toSrcRows } from "./SrcRowsEditor";

interface SrcSectionCardProps {
  meta: SrcSectionMeta;
  payload: SrcSectionPayloadMap[SrcSectionKey];
  narrative: string;
  disabled: boolean;
  onPayloadChange: (payload: SrcSectionPayloadMap[SrcSectionKey]) => void;
  onNarrativeChange: (narrative: string) => void;
}

/** Single-table sections: section_key -> its column spec. */
const SINGLE_TABLE_COLUMNS: Partial<Record<SrcSectionKey, SrcColumn[]>> = {
  enrollment: SRC_ENROLLMENT_COLUMNS,
  health: SRC_HEALTH_COLUMNS,
  materials: SRC_MATERIAL_COLUMNS,
  professional_development: SRC_PD_COLUMNS,
  awards: SRC_AWARD_COLUMNS,
  promotion: SRC_RATE_COLUMNS,
  academic_performance: SRC_PERFORMANCE_COLUMNS,
  stakeholder_participation: SRC_PARTICIPATION_COLUMNS,
  learner_teacher: SRC_RATIO_COLUMNS,
  learner_classroom: SRC_RATIO_COLUMNS,
  learner_toilet: SRC_RATIO_COLUMNS,
  learner_seat: SRC_RATIO_COLUMNS,
};

/**
 * Sections X and XI have no table of their own — their figure is a scalar on
 * the submission header, edited in the Indicators card on the page.
 */
const SCALAR_ONLY: SrcSectionKey[] = ["sbm", "cfss"];

export function SrcSectionCard({
  meta,
  payload,
  narrative,
  disabled,
  onPayloadChange,
  onNarrativeChange,
}: SrcSectionCardProps) {
  const renderTables = () => {
    if (SCALAR_ONLY.includes(meta.key)) {
      return (
        <p className="text-sm text-muted-foreground">
          The figure for this section is set in the Indicators card above; add
          the analysis paragraph below.
        </p>
      );
    }

    // Section V — two tables side by side in the DepEd template.
    if (meta.key === "funding") {
      const funding = payload as SrcSectionPayloadMap["funding"];
      return (
        <div className="space-y-6">
          <div className="space-y-2">
            <Label>Resources Generated from Partners and Stakeholders</Label>
            <SrcRowsEditor
              columns={SRC_PARTNER_COLUMNS}
              rows={toSrcRows(funding.partners)}
              onChange={(rows) =>
                onPayloadChange({
                  ...funding,
                  partners:
                    fromSrcRows<SrcSectionPayloadMap["funding"]["partners"][number]>(
                      rows,
                    ),
                })
              }
              disabled={disabled}
              emptyLabel="No partner rows yet."
              addLabel="Add fiscal year"
            />
          </div>
          <div className="space-y-2">
            <Label>Stakeholders&apos; Contributions</Label>
            <SrcRowsEditor
              columns={SRC_CONTRIBUTION_COLUMNS}
              rows={toSrcRows(funding.contributions)}
              onChange={(rows) =>
                onPayloadChange({
                  ...funding,
                  contributions:
                    fromSrcRows<
                      SrcSectionPayloadMap["funding"]["contributions"][number]
                    >(rows),
                })
              }
              disabled={disabled}
              emptyLabel="No contribution rows yet."
              addLabel="Add activity"
            />
          </div>
        </div>
      );
    }

    // Section VII — the rate table plus the optional by-cause breakdown.
    if (meta.key === "dropouts") {
      const dropouts = payload as SrcSectionPayloadMap["dropouts"];
      return (
        <div className="space-y-6">
          <div className="space-y-2">
            <Label>Dropout Rate by School Year</Label>
            <SrcRowsEditor
              columns={SRC_RATE_COLUMNS}
              rows={toSrcRows(dropouts.rows)}
              onChange={(rows) =>
                onPayloadChange({
                  ...dropouts,
                  rows: fromSrcRows<
                    SrcSectionPayloadMap["dropouts"]["rows"][number]
                  >(rows),
                })
              }
              disabled={disabled}
              emptyLabel="No rate rows yet."
              addLabel="Add school year"
            />
          </div>
          <div className="space-y-2">
            <Label>Dropouts by Cause</Label>
            <p className="text-xs text-muted-foreground">
              Causes are not recorded against enrollments, so this breakdown is
              always typed in.
            </p>
            <SrcRowsEditor
              columns={SRC_DROPOUT_CAUSE_COLUMNS}
              rows={toSrcRows(dropouts.causes)}
              onChange={(rows) =>
                onPayloadChange({
                  ...dropouts,
                  causes: fromSrcRows<
                    SrcSectionPayloadMap["dropouts"]["causes"][number]
                  >(rows),
                })
              }
              disabled={disabled}
              emptyLabel="No causes listed."
              addLabel="Add cause"
            />
          </div>
        </div>
      );
    }

    const columns = SINGLE_TABLE_COLUMNS[meta.key];
    if (!columns) return null;

    const rows = (payload as { rows?: unknown[] }).rows ?? [];
    return (
      <SrcRowsEditor
        columns={columns}
        rows={toSrcRows(rows)}
        onChange={(next) =>
          onPayloadChange({
            rows: fromSrcRows(next),
          } as SrcSectionPayloadMap[SrcSectionKey])
        }
        disabled={disabled}
      />
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">
              {meta.numeral}. {meta.title}
            </CardTitle>
            <CardDescription>
              {meta.autofilled
                ? "Prefilled by Autofill from live data — edit freely; what you save here is what prints."
                : "Not derivable from system data — type it in."}
            </CardDescription>
          </div>
          {meta.autofilled ? (
            <Badge variant="outline">Autofill</Badge>
          ) : (
            <Badge variant="secondary">Manual</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {renderTables()}
        <div className="space-y-2">
          <Label htmlFor={`narrative-${meta.key}`}>Analysis</Label>
          <Textarea
            id={`narrative-${meta.key}`}
            value={narrative}
            onChange={(e) => onNarrativeChange(e.target.value)}
            disabled={disabled}
            rows={3}
            placeholder="The paragraph that prints beneath this section's tables."
          />
        </div>
      </CardContent>
    </Card>
  );
}
