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
      </div>
      <div className="app__content">
        <CompetencyCatalogue />
      </div>
    </div>
  );
}
