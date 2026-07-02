import type { Metadata } from "next";
import { AppHeader } from "@/components/chrome/AppHeader";
import { ReportModal } from "@/components/report/ReportModal";
import { NotificationsDropdown } from "@/components/overlays/NotificationsDropdown";
import { CelebrateModal } from "@/components/overlays/CelebrateModal";
import { StoreHydrator } from "@/components/chrome/StoreHydrator";
import { EscapeCloser } from "@/components/chrome/EscapeCloser";
import { HydrationGuard } from "@/components/chrome/HydrationGuard";
import "./globals.css";

export const metadata: Metadata = {
  title: "Print Studio — Store Tools POC",
  description:
    "In-Store Suite POC — homepage placeholder and the feedback, bug & feature-request tracker.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* Responsive app shell. The wires target a 1440×900 desktop frame, but the
          layout now reflows down to phone: the ≥lg desktop composition is preserved,
          smaller breakpoints stack the surfaces. 100dvh (not 100vh) so mobile browser
          chrome doesn't clip the header; internal scrolling keeps the board's rail and
          list independent on desktop.
          suppressHydrationWarning: extensions (Grammarly et al.) stamp attributes on <body>. */}
      <body suppressHydrationWarning className="flex h-[100dvh] flex-col">
        <HydrationGuard />
        <StoreHydrator />
        <EscapeCloser />
        <AppHeader />
        <main className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</main>
        {/* Overlays live at the root so they open over any surface. */}
        <ReportModal />
        <NotificationsDropdown />
        <CelebrateModal />
      </body>
    </html>
  );
}
