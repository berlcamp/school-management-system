"use client";

import { TosViewModal } from "@/components/examinations/TosViewModal";
import { ReviewDecisionPanel } from "@/components/examinations/review/ReviewDecisionPanel";
import { ReviewHistory } from "@/components/examinations/review/ReviewHistory";
import { ReviewStatusBadge } from "@/components/examinations/review/ReviewStatusBadge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";
import { generateTosTitle } from "@/lib/utils/tos";
import type { Tos } from "@/types";
import Link from "next/link";
import { use, useEffect, useState } from "react";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tos, setTos] = useState<Tos | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { data } = await supabase.from("sms_tos").select("*").eq("id", Number(id)).single();
      if (isMounted) setTos((data as Tos) ?? null);
    })();
    return () => {
      isMounted = false;
    };
  }, [id, refreshKey]);

  if (!tos) return <div className="app__content">Loading…</div>;

  return (
    <div>
      <div className="app__title">
        <Link href="/qa" className="text-sm text-muted-foreground hover:text-foreground">
          ← QA Dashboard
        </Link>
        <h1 className="app__title_text flex items-center gap-3">
          {tos.title?.trim() || generateTosTitle(tos)}
          <ReviewStatusBadge status={tos.review_status} />
        </h1>
        <div className="app__title_actions">
          <Button variant="outline" size="sm" onClick={() => setViewOpen(true)}>
            View blueprint
          </Button>
        </div>
      </div>
      <div className="app__content grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-3">
          <h2 className="font-semibold">Decision</h2>
          {tos.review_status && (
            <ReviewDecisionPanel
              entity="tos"
              row={{ id: tos.id, review_status: tos.review_status, created_by: tos.created_by }}
              onChanged={() => setRefreshKey((k) => k + 1)}
            />
          )}
        </section>
        <section className="space-y-3">
          <h2 className="font-semibold">History</h2>
          <ReviewHistory entity="tos" id={tos.id} refreshKey={refreshKey} />
        </section>
      </div>
      <TosViewModal isOpen={viewOpen} tos={tos} onClose={() => setViewOpen(false)} />
    </div>
  );
}
