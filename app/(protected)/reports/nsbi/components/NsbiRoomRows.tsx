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
  NSBI_ACTUAL_USAGE_LABELS,
  NSBI_ROOM_CONDITIONS,
  NSBI_ROOM_USAGES,
} from "@/lib/constants/nsbi";
import { MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { RoomDraft, blankRoom } from "./drafts";
import { NsbiRoomDialog } from "./NsbiRoomDialog";

/**
 * NSBI Table 2 for one building, as a row list in the standard `app__table`
 * dress. Column order follows the printed form so the screen can be read
 * straight against the paper walk-through; the row is display-only and every
 * field is edited in a modal.
 */

interface Props {
  buildingKey: string;
  buildingName: string;
  rooms: RoomDraft[];
  onSubmit: (draft: RoomDraft) => void;
  onRemove: (key: string) => void;
  disabled: boolean;
}

function labelOf(
  list: { value: string; label: string }[],
  value: string,
): string {
  return list.find((o) => o.value === value)?.label ?? value;
}

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

export function NsbiRoomRows({
  buildingKey,
  buildingName,
  rooms,
  onSubmit,
  onRemove,
  disabled,
}: Props) {
  const [editing, setEditing] = useState<{
    draft: RoomDraft;
    index: number | null;
  } | null>(null);

  const openAdd = () =>
    setEditing({ draft: blankRoom(buildingKey, rooms.length + 1), index: null });

  return (
    <div className="app__table_container">
      <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-6 py-2">
        <span className="text-sm font-medium">
          {buildingName || "(unnamed building)"}
        </span>
        <Badge variant="outline" className="font-normal">
          {rooms.length} room{rooms.length === 1 ? "" : "s"}
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-7"
          onClick={openAdd}
          disabled={disabled}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add room
        </Button>
      </div>

      {rooms.length === 0 ? (
        <p className="bg-background px-6 py-4 text-sm italic text-muted-foreground">
          No rooms recorded for this building.
        </p>
      ) : (
        <div className="app__table_wrapper">
          <table className="app__table">
            <thead className="app__table_thead">
              <tr>
                <th className="app__table_th">Floor</th>
                <th className="app__table_th">Room No.</th>
                <th className="app__table_th">Condition</th>
                <th className="app__table_th">Usage</th>
                <th className="app__table_th">Actual Usage/s</th>
                <th className="app__table_th">Width m</th>
                <th className="app__table_th">Length m</th>
                <th className="app__table_th_right">Actions</th>
              </tr>
            </thead>
            <tbody className="app__table_tbody">
              {rooms.map((room, i) => (
                <tr key={room.key} className="app__table_tr">
                  <td className="app__table_td text-sm">
                    {room.floor_number || <Dash />}
                  </td>
                  <td className="app__table_td">
                    <div className="app__table_cell_title">
                      {room.room_number || <Dash />}
                    </div>
                  </td>
                  <td className="app__table_td text-sm">
                    {room.condition ? (
                      labelOf(NSBI_ROOM_CONDITIONS, room.condition)
                    ) : (
                      <Dash />
                    )}
                  </td>
                  <td className="app__table_td text-sm">
                    {room.room_usage ? (
                      labelOf(NSBI_ROOM_USAGES, room.room_usage)
                    ) : (
                      <Dash />
                    )}
                  </td>
                  <td className="app__table_td">
                    {room.actual_usages.length === 0 ? (
                      <Dash />
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {room.actual_usages.map((code, j) => (
                          <Badge
                            key={`${code}-${j}`}
                            variant="secondary"
                            className="font-normal"
                          >
                            {NSBI_ACTUAL_USAGE_LABELS[code] ?? code}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="app__table_td text-sm">
                    {room.width_m || <Dash />}
                  </td>
                  <td className="app__table_td text-sm">
                    {room.length_m || <Dash />}
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
                            onClick={() => setEditing({ draft: room, index: i })}
                            className="cursor-pointer"
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            {disabled ? "View" : "Edit"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onRemove(room.key)}
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NsbiRoomDialog
        open={editing !== null}
        draft={editing?.draft ?? null}
        index={editing?.index ?? null}
        buildingName={buildingName}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSubmit={onSubmit}
        disabled={disabled}
      />
    </div>
  );
}

/** Grid header note explaining why width and length are separate columns. */
export const NSBI_ROOM_DIMENSION_NOTE =
  "Width is the chalkboard side, length the window side (answering guide, note 24).";
