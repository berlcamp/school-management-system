import { PublicClosed, PublicShell } from "@/components/helpdesk/PublicShell";
import { PublicStatus } from "@/components/helpdesk/PublicStatus";
import { isHelpdeskOpen } from "@/lib/helpdesk/publicActions";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Check a concern",
  description: "See replies from the division Help Desk and respond, using your reference code and email.",
};

export const dynamic = "force-dynamic";

// /contact/status?code=HD-XXXXXX, linked from the form's success screen.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const { code } = await searchParams;
  const initialCode = (Array.isArray(code) ? code[0] : code) ?? "";
  const open = await isHelpdeskOpen();
  return (
    <PublicShell title="Check a concern" subtitle="Read replies from the Help Desk and respond">
      {open ? <PublicStatus initialCode={initialCode} /> : <PublicClosed />}
    </PublicShell>
  );
}
