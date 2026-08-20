"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  NSBI_BUILDING_CONDITIONS,
  NSBI_BUILDING_TYPE_LABELS,
  NSBI_CLASSIFICATIONS,
} from "@/lib/constants/nsbi";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { BuildingDraft, blankBuilding } from "./drafts";
import { NsbiBuildingDialog } from "./NsbiBuildingDialog";

/**
 * NSBI Table 1 as a row list. Eighteen columns plus Table 4A will not fit a
 * screen, so the row carries the identifying few and the rest is opened in a
 * modal — the same shape the Rooms tab uses, so both tabs read alike.
 */

interface Props {
  buildings: BuildingDraft[];
  /** Rooms encoded per building client key, for the Col. 7 cross-check. */
  roomCounts: Map<string, number>;
  onSubmit: (draft: BuildingDraft) => void;
  onRemove: (key: string) => void;
  disabled: boolean;
}

function labelOf(
  list: { value: string; label: string }[],
  value: string,
): string {
  return list.find((o) => o.value === value)?.label ?? value;
}

/** An unfilled cell reads as a dash rather than as an empty box. */
function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

export function NsbiBuildingTable({
  buildings,
  roomCounts,
  onSubmit,
  onRemove,
  disabled,
}: Props) {
  // `index` null marks an add; the draft is built once so cancelling never
  // leaves a half-typed building behind on the return.
  const [editing, setEditing] = useState<{
    draft: BuildingDraft;
    index: number | null;
  } | null>(null);

  const openAdd = () =>
    setEditing({ draft: blankBuilding(buildings.length + 1), index: null });

  return (
    <div className="space-y-3">
      {buildings.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No buildings yet. Prefill from the Rooms module, copy a previous
          inventory, or add one by hand.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-xs">#</TableHead>
                <TableHead className="min-w-48 text-xs">
                  Name / No. (Col. 1)
                </TableHead>
                <TableHead className="min-w-48 text-xs">
                  Building Type (Col. 2)
                </TableHead>
                <TableHead className="w-44 text-xs">
                  Condition (Col. 5)
                </TableHead>
                <TableHead className="w-20 text-xs">Storeys (6)</TableHead>
                <TableHead className="w-32 text-xs">Rooms (Col. 7)</TableHead>
                <TableHead className="w-24 text-xs">Year (8)</TableHead>
                <TableHead className="w-32 text-xs">
                  Classification (9)
                </TableHead>
                <TableHead className="w-24 text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buildings.map((b, i) => {
                const encoded = roomCounts.get(b.key) ?? 0;
                const declared = b.room_count.trim();
                const disagree = declared !== "" && Number(declared) !== encoded;
                return (
                  <TableRow key={b.key}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      {b.building_name || (
                        <span className="italic text-muted-foreground">
                          (unnamed)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {b.building_type ? (
                        NSBI_BUILDING_TYPE_LABELS[b.building_type] ??
                        b.building_type
                      ) : (
                        <Dash />
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {b.condition ? (
                        labelOf(NSBI_BUILDING_CONDITIONS, b.condition)
                      ) : (
                        <Dash />
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {b.storeys || <Dash />}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap items-center gap-1">
                        <span>{declared || "—"}</span>
                        <Badge
                          variant={disagree ? "destructive" : "outline"}
                          className="font-normal"
                        >
                          {encoded} encoded
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {b.year_completed || <Dash />}
                    </TableCell>
                    <TableCell className="text-xs">
                      {b.classification ? (
                        labelOf(NSBI_CLASSIFICATIONS, b.classification)
                      ) : (
                        <Dash />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => setEditing({ draft: b, index: i })}
                          aria-label={`Edit ${b.building_name || "building"}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-destructive hover:text-destructive"
                          onClick={() => onRemove(b.key)}
                          disabled={disabled}
                          aria-label={`Remove ${b.building_name || "building"}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Button type="button" variant="outline" onClick={openAdd} disabled={disabled}>
        <Plus className="mr-2 h-4 w-4" />
        Add building
      </Button>

      <NsbiBuildingDialog
        open={editing !== null}
        draft={editing?.draft ?? null}
        index={editing?.index ?? null}
        roomCount={editing ? (roomCounts.get(editing.draft.key) ?? 0) : 0}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSubmit={onSubmit}
        disabled={disabled}
      />
    </div>
  );
}
