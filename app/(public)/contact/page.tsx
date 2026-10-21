import { PublicContactForm } from "@/components/helpdesk/PublicContactForm";
import { PublicClosed, PublicShell } from "@/components/helpdesk/PublicShell";
import { isHelpdeskOpen } from "@/lib/helpdesk/publicActions";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help Desk",
  description: "Send a question or concern to the Schools Division Office of Bayugan City.",
};

// The switch is read per request so turning the Help Desk off takes effect at once.
export const dynamic = "force-dynamic";

export default async function Page() {
  const open = await isHelpdeskOpen();
  return (
    <PublicShell title="Help Desk" subtitle="Send a question or concern to the division office">
      {open ? <PublicContactForm /> : <PublicClosed />}
    </PublicShell>
  );
}
