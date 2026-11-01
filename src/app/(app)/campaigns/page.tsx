"use client";
import { Page, Roadmap } from "@/components/cx/Page";
import { Button, EmptyState, Panel } from "@/components/cx/ui";

export default function CampaignsPage() {
  return (
    <Page wide section="Marketing" title="Campaigns" subtitle="Template broadcasts to customer groups" action={<Button variant="primary" icon="plus" disabled title="Coming soon">New campaign</Button>}>
      <Panel title="Campaigns">
        <EmptyState icon="campaigns" title="No campaigns yet" body="Campaigns are not available yet. They will appear here once enabled for your account." />
      </Panel>
      <Panel className="mt-5" title="Roadmap">
        <Roadmap
          items={[
            { icon: "rupee", title: "Cost preview", body: "Audience size, Meta charge and Cenexa fee as separate lines before sending. Test send to your own number." },
            { icon: "checks", title: "Delivery results", body: "Delivered, read, replied and paid per campaign." },
            { icon: "link", title: "Click-to-chat links and QR", body: "Source-tagged links for your shop, Instagram and website." },
          ]}
        />
      </Panel>
    </Page>
  );
}
