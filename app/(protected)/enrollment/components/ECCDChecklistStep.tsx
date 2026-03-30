"use client";

import { supabase } from "@/lib/supabase/client";
import { EccdCompetency, EccdDomain } from "@/types";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ECCDRatingSelect } from "@/app/(protected)/teacher/eccd/components/ECCDRatingSelect";

interface ECCDChecklistStepProps {
  ratings: Record<string, string>;
  onRatingsChange: (ratings: Record<string, string>) => void;
  isSubmitting: boolean;
}

export default function ECCDChecklistStep({
  ratings,
  onRatingsChange,
  isSubmitting,
}: ECCDChecklistStepProps) {
  const [domains, setDomains] = useState<EccdDomain[]>([]);
  const [competencies, setCompetencies] = useState<EccdCompetency[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    const fetchChecklist = async () => {
      setLoading(true);
      try {
        const [domainsRes, competenciesRes] = await Promise.all([
          supabase
            .from("sms_eccd_domains")
            .select("*")
            .eq("is_active", true)
            .order("sort_order"),
          supabase
            .from("sms_eccd_competencies")
            .select("*")
            .eq("is_active", true)
            .order("sort_order"),
        ]);
        const domainList = domainsRes.data || [];
        setDomains(domainList);
        setCompetencies(competenciesRes.data || []);
        // Expand all domains by default
        setExpandedDomains(new Set(domainList.map((d) => d.id)));
      } catch {
        toast.error("Failed to load ECCD checklist");
      } finally {
        setLoading(false);
      }
    };
    fetchChecklist();
  }, []);

  const toggleDomain = (domainId: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domainId)) {
        next.delete(domainId);
      } else {
        next.add(domainId);
      }
      return next;
    });
  };

  const updateRating = (competencyId: string, value: string) => {
    onRatingsChange({
      ...ratings,
      [competencyId]: value,
    });
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading ECCD checklist...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">
          ECCD Checklist — Beginning of School Year (BOSY)
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Rate each competency for the incoming Kindergarten learner. This is
          optional — you can skip and complete it later from the ECCD Checklist
          page.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>
          <strong>1</strong> = Cannot yet perform
        </span>
        <span>
          <strong>2</strong> = With some assistance
        </span>
        <span>
          <strong>3</strong> = Can perform independently
        </span>
      </div>

      <div className="space-y-2">
        {domains.map((domain) => {
          const domainComps = competencies.filter(
            (c) => String(c.domain_id) === String(domain.id)
          );
          const isExpanded = expandedDomains.has(domain.id);

          return (
            <div key={domain.id} className="border rounded-lg">
              <button
                type="button"
                onClick={() => toggleDomain(domain.id)}
                className="flex items-center gap-2 w-full px-4 py-3 text-left text-sm font-medium hover:bg-muted/50 transition-colors rounded-lg"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                {domain.code} — {domain.name}
                <span className="text-muted-foreground font-normal ml-1">
                  ({domainComps.length} items)
                </span>
              </button>
              {isExpanded && (
                <div className="px-4 pb-3 space-y-2">
                  {domainComps.map((comp) => (
                    <div
                      key={comp.id}
                      className="flex items-center gap-3 py-1"
                    >
                      <span className="text-xs text-muted-foreground w-14 shrink-0">
                        {comp.code}
                      </span>
                      <span className="text-sm flex-1 min-w-0">
                        {comp.description}
                      </span>
                      <div className="w-[160px] shrink-0">
                        <ECCDRatingSelect
                          value={ratings[comp.id] || ""}
                          onChange={(v) => updateRating(comp.id, v)}
                          disabled={isSubmitting}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
