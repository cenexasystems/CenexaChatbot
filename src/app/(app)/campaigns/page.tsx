"use client";
import { Page } from "@/components/cx/Page";
import { EmptyState, Panel } from "@/components/cx/ui";
import { useDashboard } from "@/components/cx/DashboardProvider";
import { CampaignManager } from "@/components/cx/CampaignManager";

export default function CampaignsPage() {
  const { business } = useDashboard();
  if (business?.modules_enabled?.campaigns === true) return <CampaignManager />;
  return (
    <Page wide section="Marketing" title="Campaigns" subtitle="Template broadcasts to customer groups">
      <Panel title="Campaigns" icon="campaigns">
        <EmptyState icon="campaigns" title="Campaigns are off for this business" body="An admin can turn on Campaigns after reviewing consent records, message limits, and the sending pause." />
      </Panel>
    </Page>
  );
}
