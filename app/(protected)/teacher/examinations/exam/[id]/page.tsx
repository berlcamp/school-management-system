"use client";

import { ExamScanWorkspace } from "@/components/examinations/ExamScanWorkspace";
import { use } from "react";

export default function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ExamScanWorkspace examId={id} mode="teacher" />;
}
