import type { Metadata, Viewport } from "next";
import { Michroma, Poppins, Noto_Sans_Tamil } from "next/font/google";
import { DashboardProvider } from "@/components/cx/DashboardProvider";
import { AppShell } from "@/components/cx/AppShell";

// ChatFlow 2.0 dashboard shell: /today, /inbox, /contacts, /campaigns, /assistant, /more.
// The old single-page dashboard at / is untouched until the switch-over.

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-poppins", display: "swap" });
const notoTamil = Noto_Sans_Tamil({ subsets: ["tamil"], weight: ["400", "500", "600", "700"], variable: "--font-noto-tamil", display: "swap" });
// Wordmark only: wide geometric face close to the CENEXA logotype.
const michroma = Michroma({ subsets: ["latin"], weight: "400", variable: "--font-michroma", display: "swap" });

export const metadata: Metadata = {
  title: "Cenexa ChatFlow",
  icons: { icon: "/brand/cenexa-mark.png", apple: "/brand/cenexa-mark.png" },
  description: "Run your WhatsApp business from your phone",
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`cx-root ${poppins.variable} ${notoTamil.variable} ${michroma.variable} flex-1`}>
      <DashboardProvider>
        <AppShell>{children}</AppShell>
      </DashboardProvider>
    </div>
  );
}
