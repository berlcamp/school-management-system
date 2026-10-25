"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  addKitchen,
  fetchDivisionSchools,
  fetchKitchens,
  setKitchenActive,
  type SbfpKitchen,
} from "@/lib/sbfp/queries";
import type { SbfpSchoolOption } from "@/lib/utils/sbfp";
import { Loader2, Plus, Settings2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { DispatchLogPanel } from "./monitoring/DispatchLogPanel";
import { KitchenLogPanel } from "./monitoring/KitchenLogPanel";
import { QualityPanel } from "./monitoring/QualityPanel";
import { ReceivingLogPanel } from "./monitoring/ReceivingLogPanel";
import type { SbfpTabProps } from "./types";

/**
 * The four daily monitoring tools (migration 220). The kitchen and dispatch
 * tools are filed by the school that cooks — a centralized kitchen, or a
 * school cooking at its own site; the receiving and quality tools by the
 * school that is fed.
 */
export function MonitoringTab({
  canLog,
  isDivisionManager,
  ...tabProps
}: SbfpTabProps & {
  /** A manager or a teacher of the school (212's rule). */
  canLog: boolean;
  /** Super admin / division_admin: maintain the kitchens and evaluation questions. */
  isDivisionManager: boolean;
}) {
  const { program } = tabProps;
  const [kitchens, setKitchens] = useState<SbfpKitchen[] | null>(null);
  const [schools, setSchools] = useState<SbfpSchoolOption[]>([]);
  const [tool, setTool] = useState("kitchen");
  const [managingKitchens, setManagingKitchens] = useState(false);

  const load = useCallback(async () => {
    try {
      const [k, s] = await Promise.all([fetchKitchens(), fetchDivisionSchools()]);
      setKitchens(k);
      setSchools(s);
    } catch (err) {
      console.error("Error loading SBFP kitchens:", err);
      toast.error("Failed to load kitchens and schools");
      setKitchens([]);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (isMounted) await load();
    })();
    return () => {
      isMounted = false;
    };
  }, [load]);

  if (!program) return null;
  if (kitchens === null) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  const panelProps = {
    schoolId: tabProps.schoolId,
    schoolYear: tabProps.schoolYear,
    program,
    canManage: tabProps.canManage,
    canLog,
    actorId: tabProps.actorId,
    kitchens,
    schools,
  };

  return (
    <div className="space-y-4">
      <Tabs value={tool} onValueChange={setTool} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="kitchen">Kitchen</TabsTrigger>
            <TabsTrigger value="dispatch">Food Dispatch</TabsTrigger>
            <TabsTrigger value="receiving">Receiving &amp; Feeding</TabsTrigger>
            <TabsTrigger value="quality">Hot Meals Quality</TabsTrigger>
          </TabsList>
          {isDivisionManager && (tool === "kitchen" || tool === "dispatch") && (
            <Button variant="outline" size="sm" onClick={() => setManagingKitchens(true)}>
              <Settings2 className="h-4 w-4 mr-2" />
              Manage kitchens
            </Button>
          )}
        </div>

        {!canLog && (
          <p className="text-sm text-muted-foreground">
            Read only. The school&apos;s head, admin, nurse, focal person and teachers file
            these entries.
          </p>
        )}

        <TabsContent value="kitchen">
          <KitchenLogPanel {...panelProps} />
        </TabsContent>
        <TabsContent value="dispatch">
          <DispatchLogPanel {...panelProps} />
        </TabsContent>
        <TabsContent value="receiving">
          <ReceivingLogPanel {...panelProps} />
        </TabsContent>
        <TabsContent value="quality">
          <QualityPanel {...panelProps} isDivisionManager={isDivisionManager} />
        </TabsContent>
      </Tabs>

      {isDivisionManager && (
        <ManageKitchensDialog
          open={managingKitchens}
          onOpenChange={setManagingKitchens}
          kitchens={kitchens}
          schools={schools}
          onSaved={load}
        />
      )}
    </div>
  );
}

function ManageKitchensDialog({
  open,
  onOpenChange,
  kitchens,
  schools,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kitchens: SbfpKitchen[];
  schools: SbfpSchoolOption[];
  onSaved: () => Promise<void>;
}) {
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);
  const taken = new Set(kitchens.map((k) => k.school_id));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await onSaved();
    } catch (err) {
      console.error("Error saving kitchen:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Centralized kitchens</DialogTitle>
          <DialogDescription>
            The schools that cook for others, offered as the Assigned Kitchen on every
            school&apos;s monitoring tools. &quot;At school site&quot; is always offered.
            A kitchen is switched off rather than removed, so filed entries keep its name.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {kitchens.map((k) => (
            <div key={k.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <span className="flex-1">{k.school_name}</span>
              {!k.is_active && <Badge variant="outline">Off</Badge>}
              <Switch
                checked={k.is_active}
                disabled={busy}
                onCheckedChange={(v) => run(() => setKitchenActive(k.id, v))}
              />
            </div>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label>Add a kitchen</Label>
            <Select value={picked} onValueChange={setPicked}>
              <SelectTrigger>
                <SelectValue placeholder="Select school" />
              </SelectTrigger>
              <SelectContent>
                {schools
                  .filter((s) => !taken.has(s.id))
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={!picked || busy}
            onClick={() =>
              run(async () => {
                await addKitchen(picked, kitchens.length + 1);
                setPicked("");
              })
            }
          >
            {busy ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Add
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
