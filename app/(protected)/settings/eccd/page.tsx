"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppSelector } from "@/lib/redux/hook";
import { supabase } from "@/lib/supabase/client";
import { EccdCompetency, EccdDomain, EccdScaleScore } from "@/types";
import { ArrowLeft, ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { EccdDomainModal } from "./components/EccdDomainModal";
import { EccdCompetencyModal } from "./components/EccdCompetencyModal";
import { EccdScaleScoreTable } from "./components/EccdScaleScoreTable";

export default function EccdSettingsPage() {
  const user = useAppSelector((state) => state.user.user);
  const [domains, setDomains] = useState<EccdDomain[]>([]);
  const [competencies, setCompetencies] = useState<EccdCompetency[]>([]);
  const [scaleScores, setScaleScores] = useState<EccdScaleScore[]>([]);
  const [selectedDomainId, setSelectedDomainId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Modal states
  const [domainModal, setDomainModal] = useState<{ open: boolean; editData?: EccdDomain }>({ open: false });
  const [compModal, setCompModal] = useState<{ open: boolean; editData?: EccdCompetency }>({ open: false });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [domainsRes, compsRes, scalesRes] = await Promise.all([
      supabase.from("sms_eccd_domains").select("*").order("sort_order"),
      supabase.from("sms_eccd_competencies").select("*").order("sort_order"),
      supabase.from("sms_eccd_scale_scores").select("*"),
    ]);
    setDomains(domainsRes.data || []);
    setCompetencies(compsRes.data || []);
    setScaleScores(scalesRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (domains.length > 0 && !selectedDomainId) {
      setSelectedDomainId(domains[0].id);
    }
  }, [domains, selectedDomainId]);

  const selectedDomain = domains.find((d) => d.id === selectedDomainId);
  const domainComps = competencies.filter((c) => String(c.domain_id) === String(selectedDomainId));
  const domainScales = scaleScores.filter((s) => String(s.domain_id) === String(selectedDomainId));

  const handleToggleDomain = async (domain: EccdDomain) => {
    const { error } = await supabase
      .from("sms_eccd_domains")
      .update({ is_active: !domain.is_active })
      .eq("id", domain.id);
    if (error) { toast.error("Failed to update domain"); return; }
    fetchData();
  };

  const handleToggleCompetency = async (comp: EccdCompetency) => {
    const { error } = await supabase
      .from("sms_eccd_competencies")
      .update({ is_active: !comp.is_active })
      .eq("id", comp.id);
    if (error) { toast.error("Failed to update item"); return; }
    fetchData();
  };

  const handleMoveDomain = async (domainId: string, direction: "up" | "down") => {
    const idx = domains.findIndex((d) => d.id === domainId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= domains.length) return;

    const updates = [
      { id: domains[idx].id, sort_order: domains[swapIdx].sort_order },
      { id: domains[swapIdx].id, sort_order: domains[idx].sort_order },
    ];
    for (const u of updates) {
      await supabase.from("sms_eccd_domains").update({ sort_order: u.sort_order }).eq("id", u.id);
    }
    fetchData();
  };

  const handleMoveCompetency = async (compId: string, direction: "up" | "down") => {
    const idx = domainComps.findIndex((c) => c.id === compId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= domainComps.length) return;

    const updates = [
      { id: domainComps[idx].id, sort_order: domainComps[swapIdx].sort_order },
      { id: domainComps[swapIdx].id, sort_order: domainComps[idx].sort_order },
    ];
    for (const u of updates) {
      await supabase.from("sms_eccd_competencies").update({ sort_order: u.sort_order }).eq("id", u.id);
    }
    fetchData();
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/settings">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            ECCD Checklist Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage domains, checklist items, and scale score mappings
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Left: Domains */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Domains</CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1"
                onClick={() => setDomainModal({ open: true })}
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="px-4 pb-4 text-sm text-muted-foreground">Loading...</div>
            ) : (
              <div className="divide-y">
                {domains.map((domain, idx) => (
                  <div
                    key={domain.id}
                    className={`px-3 py-2 cursor-pointer transition-colors text-sm ${
                      selectedDomainId === domain.id
                        ? "bg-primary/10 border-l-2 border-primary"
                        : "hover:bg-muted/50"
                    } ${!domain.is_active ? "opacity-50" : ""}`}
                    onClick={() => setSelectedDomainId(domain.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">{domain.code}</span>
                        <span className="text-muted-foreground ml-1.5">{domain.name}</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-muted-foreground"
                          onClick={(e) => { e.stopPropagation(); handleMoveDomain(domain.id, "up"); }}
                          disabled={idx === 0}
                        >
                          &#9650;
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-muted-foreground"
                          onClick={(e) => { e.stopPropagation(); handleMoveDomain(domain.id, "down"); }}
                          disabled={idx === domains.length - 1}
                        >
                          &#9660;
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Competencies + Scale Scores */}
        <div className="space-y-6">
          {selectedDomain ? (
            <>
              {/* Domain info & actions */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {selectedDomain.code} — {selectedDomain.name}
                        {!selectedDomain.is_active && (
                          <span className="ml-2 text-xs text-amber-600 font-normal">(Inactive)</span>
                        )}
                      </CardTitle>
                      {selectedDomain.description && (
                        <CardDescription className="mt-1">{selectedDomain.description}</CardDescription>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleDomain(selectedDomain)}
                      >
                        {selectedDomain.is_active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDomainModal({ open: true, editData: selectedDomain })}
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {/* Checklist Items */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Checklist Items ({domainComps.length})</CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1"
                      onClick={() => setCompModal({ open: true })}
                    >
                      <Plus className="h-3 w-3" />
                      Add Item
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {domainComps.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                        No checklist items yet. Add one to get started.
                      </div>
                    ) : (
                      domainComps.map((comp, idx) => (
                        <div
                          key={comp.id}
                          className={`px-4 py-2 flex items-center gap-3 text-sm ${!comp.is_active ? "opacity-50" : ""}`}
                        >
                          <span className="text-xs text-muted-foreground w-10 shrink-0 font-mono">
                            {comp.code}
                          </span>
                          <span className="flex-1 min-w-0">{comp.description}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-xs"
                              onClick={() => handleMoveCompetency(comp.id, "up")}
                              disabled={idx === 0}
                            >
                              &#9650;
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-xs"
                              onClick={() => handleMoveCompetency(comp.id, "down")}
                              disabled={idx === domainComps.length - 1}
                            >
                              &#9660;
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={() => handleToggleCompetency(comp)}
                            >
                              {comp.is_active ? "Deactivate" : "Activate"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={() => setCompModal({ open: true, editData: comp })}
                            >
                              Edit
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Scale Score Mapping */}
              <EccdScaleScoreTable
                domainId={selectedDomainId}
                domainCode={selectedDomain.code}
                scaleScores={domainScales}
                competencyCount={domainComps.filter((c) => c.is_active).length}
                onRefresh={fetchData}
              />
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Select a domain to view its checklist items and scale scores.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Modals */}
      <EccdDomainModal
        open={domainModal.open}
        onOpenChange={(open) => setDomainModal({ open })}
        editData={domainModal.editData}
        nextSortOrder={domains.length > 0 ? Math.max(...domains.map((d) => d.sort_order)) + 1 : 1}
        onSuccess={fetchData}
      />
      <EccdCompetencyModal
        open={compModal.open}
        onOpenChange={(open) => setCompModal({ open })}
        editData={compModal.editData}
        domainId={selectedDomainId}
        nextSortOrder={domainComps.length > 0 ? Math.max(...domainComps.map((c) => c.sort_order)) + 1 : 1}
        onSuccess={fetchData}
      />
    </div>
  );
}
