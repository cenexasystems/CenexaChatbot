import { AppShell } from "@/components/cx/AppShell";
import { DashboardProvider } from "@/components/cx/DashboardProvider";
import TodayPage from "@/app/(app)/today/page";

export default function HomePage() {
  return (
    <div className="cx-root flex-1">
      <DashboardProvider>
        <AppShell><TodayPage /></AppShell>
      </DashboardProvider>
    </div>
  );
}
