"use client";
import { useDashboard } from "@/components/cx/DashboardProvider";
import { AutomationManager } from "@/components/cx/AutomationManager";
import { Page } from "@/components/cx/Page";
import { EmptyState, Panel } from "@/components/cx/ui";

export default function AutomationsPage() {
  const { business } = useDashboard();
  if (business?.modules_enabled?.automations === true) return <AutomationManager />;
  return <Page wide section="Operations" title="Automations" subtitle="Follow-ups, reminders, and review requests"><Panel title="Automations" icon="flow"><EmptyState icon="flow" title="Automations are off for this business" body="An admin can enable this module from the Operations settings after reviewing each rule and its safeguards." /></Panel></Page>;
}
