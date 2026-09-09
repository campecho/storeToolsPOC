import Link from "next/link";
import { PillButton } from "@/components/ui/PillButton";

/**
 * The wrapper surface at `/launcher` (docs/DEPLOY_CLOUD_RUN_PLAN.md): one
 * page in front of both deployed apps — this POC and the publisher prototype,
 * which is a separate service on its own URL.
 *
 * It is also the gate. When the deployment sets a password, the middleware
 * sends every unauthenticated request here, so the same page either asks for
 * the password or offers the two choices — never both.
 */

const CARD =
  "flex flex-col rounded-lg border border-[#e4e4e4] bg-white p-5 transition-colors hover:border-brand-border";

type LauncherScreenProps = {
  /** Gate satisfied (or no gate configured) — show the choices. */
  authorized: boolean;
  /** Absolute URL of the deployed prototype; absent hides that card. */
  prototypeUrl: string | undefined;
  /** Where to land after the password (already sanitised). */
  next: string;
  /** The previous attempt was wrong. */
  failed: boolean;
};

export function LauncherScreen({ authorized, prototypeUrl, next, failed }: LauncherScreenProps) {
  return (
    <div className="flex flex-1 items-center justify-center bg-[#f6f6f6] px-6 py-12">
      <div className="w-full max-w-[760px]">
        <h1 className="text-[26px] font-bold text-ink">Store Tools</h1>
        <p className="mt-1 text-[13.5px] text-[#6b6b6d]">
          {authorized
            ? "Two applications, deployed separately. Pick one."
            : "This deployment is password-protected."}
        </p>

        {authorized ? (
          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <Link className={CARD} href="/" data-testid="launcher-choice-poc">
              <ChoiceBody
                title="Print Studio POC"
                blurb="The in-store suite proof of concept: templates, Publisher import, the layout editor and the photo editor."
                cta="Open the POC"
              />
            </Link>
            {prototypeUrl ? (
              // Its own Cloud Run service on its own URL, so a plain anchor —
              // next/link routes within this app only.
              <a className={CARD} href={prototypeUrl} data-testid="launcher-choice-prototype">
                <ChoiceBody
                  title="Publisher prototype"
                  blurb="The standalone functional model of the layout tool — every tool and panel, built for the dev-team handoff."
                  cta="Open the prototype"
                />
              </a>
            ) : (
              <div
                className="rounded-lg border border-dashed border-[#d6d6d6] bg-white p-5"
                data-testid="launcher-prototype-missing"
              >
                <h2 className="text-[15px] font-semibold text-[#8a8a8c]">Publisher prototype</h2>
                <p className="mt-1.5 text-[12.5px] leading-[1.5] text-[#8a8a8c]">
                  Not linked yet — this deployment has no prototype URL configured
                  (<code>STP_PROTOTYPE_URL</code>).
                </p>
              </div>
            )}
          </div>
        ) : (
          <form
            method="post"
            action="/api/access"
            className="mt-7 rounded-lg border border-[#e4e4e4] bg-white p-5"
            data-testid="launcher-gate"
          >
            <input type="hidden" name="next" value={next} />
            <label className="block text-[12.5px] font-semibold text-[#4d4d4f]" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              className="mt-1.5 w-full rounded border border-[#cccccc] px-3 py-2 text-[13px] outline-none focus:border-brand"
            />
            {failed ? (
              <p className="mt-2 text-[12.5px] text-brand" data-testid="launcher-gate-error">
                That password didn&apos;t match. Try again.
              </p>
            ) : null}
            <PillButton variant="primary" type="submit" className="mt-4">
              Continue
            </PillButton>
          </form>
        )}
      </div>
    </div>
  );
}

type ChoiceBodyProps = {
  title: string;
  blurb: string;
  cta: string;
};

/** The inside of an app card; the caller supplies the link that wraps it. */
function ChoiceBody({ title, blurb, cta }: ChoiceBodyProps) {
  return (
    <>
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      <p className="mt-1.5 flex-1 text-[12.5px] leading-[1.5] text-[#6b6b6d]">{blurb}</p>
      <span className="mt-4 text-[12.5px] font-semibold text-brand">{cta} →</span>
    </>
  );
}
