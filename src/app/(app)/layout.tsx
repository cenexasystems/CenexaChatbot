import type { Metadata, Viewport } from "next";
import { DashboardProvider } from "@/components/cx/DashboardProvider";
import { AppShell } from "@/components/cx/AppShell";

// ChatFlow dashboard shell. The home page sends signed-in users to /today.

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
    <div className="cx-root flex-1">
      <DashboardProvider>
        <AppShell>{children}</AppShell>
      </DashboardProvider>
    </div>
  );
}
