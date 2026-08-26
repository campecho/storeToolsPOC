import { redirect } from "next/navigation";

/**
 * The picker moved to `/` (redesign plan Phase 11, decision of record #9);
 * this route survives as a redirect so pre-move deep links keep working.
 */
export default function TemplatesRedirect() {
  redirect("/");
}
