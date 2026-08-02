import { redirect } from "next/navigation";

/**
 * The Instructional Supervision Plan was a Monitoring placeholder until the
 * module shipped (migration 121). The route is kept as a redirect so existing
 * links and bookmarks still land on the real module; access is checked there.
 */
export default function Page() {
  redirect("/supervision");
}
