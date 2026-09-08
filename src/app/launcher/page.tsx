import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LauncherScreen } from "@/components/launcher/LauncherScreen";
import { accessPassword, prototypeUrl, safeNextPath } from "@/lib/access/session";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/access/token";

/**
 * `/launcher` — the wrapper page for the deployment
 * (docs/DEPLOY_CLOUD_RUN_PLAN.md): choose this POC or the publisher
 * prototype, and, where the deployment sets a password, the place the
 * middleware sends everyone who hasn't entered it yet.
 *
 * `/` stays the picker (redesign plan Phase 11, decision of record #9) — this
 * page sits beside it, not over it.
 */

export const metadata: Metadata = {
  title: "Store Tools — choose an app",
};

type LauncherPageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function LauncherPage({ searchParams }: LauncherPageProps) {
  const { next, error } = await searchParams;
  const password = accessPassword();
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;

  return (
    <LauncherScreen
      authorized={!password || (await verifyAccessToken(password, token, Date.now()))}
      prototypeUrl={prototypeUrl()}
      next={safeNextPath(next)}
      failed={error === "1"}
    />
  );
}
