import type { Metadata, Viewport } from "next";
import { Figtree, Noto_Sans_Tamil } from "next/font/google";
import { DashboardProvider } from "@/components/cx/DashboardProvider";
import { AppShell } from "@/components/cx/AppShell";

// ChatFlow 2.0 dashboard shell: /today, /inbox, /contacts, /campaigns, /assistant, /more.
// The old single-page dashboard at / is untouched until the switch-over.

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });
const notoTamil = Noto_Sans_Tamil({ subsets: ["tamil"], variable: "--font-noto-tamil", display: "swap" });

export const metadata: Metadata = {
  title: "Cenexa ChatFlow",
  description: "Run your WhatsApp business from your phone",
};

export const viewport: Viewport = {
  themeColor: "#FAF8F4",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`cx-root ${figtree.variable} ${notoTamil.variable} flex-1`}>
      <DashboardProvider>
        <AppShell>{children}</AppShell>
      </DashboardProvider>
    </div>
  );
}
