import type { Metadata } from "next";
import { AppHeader } from "@/components/chrome/AppHeader";
import { ReportModal } from "@/components/report/ReportModal";
import "./globals.css";

export const metadata: Metadata = {
  title: "Print Studio — Store Tools POC",
  description:
    "In-Store Suite POC — homepage placeholder and the feedback, bug & feature-request tracker.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* Full-viewport desktop app (the wires' fixed 1440×900 frame is wireframe chrome).
          h-screen + internal scrolling so the board's rail and list scroll independently. */}
      <body className="flex h-screen min-w-[1200px] flex-col">
        <AppHeader />
        <main className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</main>
        {/* Overlays live at the root so they open over any surface. */}
        <ReportModal />
      </body>
    </html>
  );
}
