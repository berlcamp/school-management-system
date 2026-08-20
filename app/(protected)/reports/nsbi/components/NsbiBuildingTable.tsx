"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NSBI_BUILDING_CONDITIONS,
  NSBI_BUILDING_TYPE_LABELS,
  NSBI_CLASSIFICATIONS,
} from "@/lib/constants/nsbi";
import { MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { BuildingDraft, blankBuilding } from "./drafts";
import { NsbiBuildingDialog } from "./NsbiBuildingDialog";

/**
 * NSBI Table 1 as a row list, in the same `app__table` dress every other
 * module's list wears. Eighteen columns plus Table 4A will not fit a screen,
 * so the row carries the identifying few and the rest is opened in a modal.
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
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No buildings yet. Prefill from the Rooms module, copy a previous
          inventory, or add one by hand.
        </p>
      ) : (
        <div className="app__table_container">
          <div className="app__table_wrapper">
            <table className="app__table">
              <thead className="app__table_thead">
                <tr>
                  <th className="app__table_th">#</th>
                  <th className="app__table_th">Name / No.</th>
                  <th className="app__table_th">Building Type</th>
                  <th className="app__table_th">Condition</th>
                  <th className="app__table_th">Storeys</th>
                  <th className="app__table_th">Rooms</th>
                  <th className="app__table_th">Year</th>
                  <th className="app__table_th">Classification</th>
                  <th className="app__table_th_right">Actions</th>
                </tr>
              </thead>
              <tbody className="app__table_tbody">
                {buildings.map((b, i) => {
                  const encoded = roomCounts.get(b.key) ?? 0;
                  const declared = b.room_count.trim();
                  const disagree =
                    declared !== "" && Number(declared) !== encoded;
                  return (
                    <tr key={b.key} className="app__table_tr">
                      <td className="app__table_td text-xs text-muted-foreground">
                        {i + 1}
                      </td>
                      <td className="app__table_td">
                        <div className="app__table_cell_text">
                          <div className="app__table_cell_title">
                            {b.building_name || (
                              <span className="italic text-muted-foreground">
                                (unnamed)
                              </span>
                            )}
                          </div>
                          {b.specific_fund_source ? (
                            <div className="app__table_cell_subtitle">
                              {b.specific_fund_source}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="app__table_td text-sm">
                        {b.building_type ? (
                          NSBI_BUILDING_TYPE_LABELS[b.building_type] ??
                          b.building_type
                        ) : (
                          <Dash />
                        )}
                      </td>
                      <td className="app__table_td text-sm">
                        {b.condition ? (
                          labelOf(NSBI_BUILDING_CONDITIONS, b.condition)
                        ) : (
                          <Dash />
                        )}
                      </td>
                      <td className="app__table_td text-sm">
                        {b.storeys || <Dash />}
                      </td>
                      <td className="app__table_td text-sm">
                        <div className="flex flex-wrap items-center gap-1">
                          <span>{declared || "—"}</span>
                          <Badge
                            variant={disagree ? "destructive" : "outline"}
                            className="font-normal"
                          >
                            {encoded} encoded
                          </Badge>
                        </div>
                      </td>
                      <td className="app__table_td text-sm">
                        {b.year_completed || <Dash />}
                      </td>
                      <td className="app__table_td text-sm">
                        {b.classification ? (
                          labelOf(NSBI_CLASSIFICATIONS, b.classification)
                        ) : (
                          <Dash />
                        )}
                      </td>
                      <td className="app__table_td_actions">
                        <div className="app__table_action_container">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              >
                                <MoreVertical className="h-4 w-4" />
                                <span className="sr-only">Open menu</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem
                                onClick={() => setEditing({ draft: b, index: i })}
                                className="cursor-pointer"
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                {disabled ? "View" : "Edit"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onRemove(b.key)}
                                disabled={disabled}
                                variant="destructive"
                                className="cursor-pointer"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={openAdd}
        disabled={disabled}
      >
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
