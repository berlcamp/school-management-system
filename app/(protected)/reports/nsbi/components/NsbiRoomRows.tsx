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
  NSBI_ACTUAL_USAGE_LABELS,
  NSBI_ROOM_CONDITIONS,
  NSBI_ROOM_USAGES,
} from "@/lib/constants/nsbi";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { RoomDraft, blankRoom } from "./drafts";
import { NsbiRoomDialog } from "./NsbiRoomDialog";

/**
 * NSBI Table 2 for one building, as a row list. Column order follows the
 * printed form so the screen can be read straight against the paper
 * walk-through; the row is display-only and every field is edited in a modal.
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
    <div className="rounded-md border">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
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
        <p className="px-3 py-4 text-xs italic text-muted-foreground">
          No rooms recorded for this building.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24 text-xs">Floor (Col. 2)</TableHead>
                <TableHead className="w-40 text-xs">Room No. (Col. 3)</TableHead>
                <TableHead className="w-48 text-xs">Condition (Col. 4)</TableHead>
                <TableHead className="w-44 text-xs">Usage (Col. 5)</TableHead>
                <TableHead className="min-w-64 text-xs">
                  Actual Usage/s (Col. 6)
                </TableHead>
                <TableHead className="w-24 text-xs">Width m (Col. 7)</TableHead>
                <TableHead className="w-24 text-xs">Length m (Col. 8)</TableHead>
                <TableHead className="w-24 text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.map((room, i) => (
                <TableRow key={room.key}>
                  <TableCell className="text-xs">
                    {room.floor_number || <Dash />}
                  </TableCell>
                  <TableCell className="text-xs font-medium">
                    {room.room_number || <Dash />}
                  </TableCell>
                  <TableCell className="text-xs">
                    {room.condition ? (
                      labelOf(NSBI_ROOM_CONDITIONS, room.condition)
                    ) : (
                      <Dash />
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {room.room_usage ? (
                      labelOf(NSBI_ROOM_USAGES, room.room_usage)
                    ) : (
                      <Dash />
                    )}
                  </TableCell>
                  <TableCell>
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
                  </TableCell>
                  <TableCell className="text-xs">
                    {room.width_m || <Dash />}
                  </TableCell>
                  <TableCell className="text-xs">
                    {room.length_m || <Dash />}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => setEditing({ draft: room, index: i })}
                        aria-label="Edit room"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-destructive hover:text-destructive"
                        onClick={() => onRemove(room.key)}
                        disabled={disabled}
                        aria-label="Remove room"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
