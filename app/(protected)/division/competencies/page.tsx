"use client";

import { CompetencyCatalogue } from "@/components/examinations/catalogue/CompetencyCatalogue";
import { ListChecks } from "lucide-react";

export default function Page() {
  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text flex items-center gap-2">
          <ListChecks className="h-5 w-5" />
          Competency Catalogue
        </h1>
        <p className="text-sm text-muted-foreground">
          The division list every TOS picks its learning area and competencies
          from. Retire an entry instead of deleting it — saved TOS keep their copy.
        </p>
      </div>
      <div className="app__content">
        <CompetencyCatalogue />
      </div>
    </div>
  );
}
