"use client";

import { ModuleComingSoon } from "@/components/ModuleComingSoon";

export default function Page() {
  return (
    <ModuleComingSoon
      title="Manifestation"
      description="Behavioral manifestations observed per learner in your advisory section."
      backHref="/teacher/anecdotal"
      backLabel="Back to Anecdotal Record"
    />
  );
}
