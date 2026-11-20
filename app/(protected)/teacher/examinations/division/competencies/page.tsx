"use client";

import { CompetencyCatalogue } from "@/components/examinations/catalogue/CompetencyCatalogue";
import { useDivisionAuthorStatus } from "@/hooks/useDivisionAuthorStatus";
import { ListPlus } from "lucide-react";
import Link from "next/link";

/**
 * A QA-authorized Division author whom QA has let add catalogue competencies
 * (migration 236). Add only: the catalogue INSERT policy admits exactly this
 * teacher, and every entry they add is flagged `added_by_teacher`.
 */
export default function Page() {
  const { loading, mayAddCompetencies } = useDivisionAuthorStatus();

  return (
    <div>
      <div className="app__title">
        <Link
          href="/teacher/examinations"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Examinations
        </Link>
        <div className="min-w-0 space-y-0.5">
          <h1 className="app__title_text flex items-center gap-2">
            <ListPlus className="h-5 w-5 shrink-0" />
            Competency Catalogue
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Add a learning competency the division catalogue is missing. Entries you add are
            marked &ldquo;Added by teacher&rdquo;; QA or the division office fixes or retires them.
          </p>
        </div>
      </div>
      <div className="app__content">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : mayAddCompetencies ? (
          <CompetencyCatalogue addOnly />
        ) : (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            You are not allowed to add competencies to the catalogue. A QA reviewer can turn this on
            for authorized teachers on the Authorized Teachers page.
          </p>
        )}
      </div>
    </div>
  );
}
