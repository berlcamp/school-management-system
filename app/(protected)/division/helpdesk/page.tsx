import { redirect } from "next/navigation";

/** Moved into Division Office → Module Settings; kept so old links still land. */
export default function Page() {
  redirect("/division/module-settings#helpdesk");
}
