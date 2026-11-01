"use client";
import { ComingSoon, Page } from "@/components/cx/Page";
import { Card, EmptyState } from "@/components/cx/ui";

export default function CampaignsPage() {
  return (
    <Page title="Campaigns" subtitle="Send an offer to the right people, safely">
      <Card>
        <EmptyState
          icon="campaigns"
          title="Campaigns are on the way"
          body="You'll pick a message template, choose who gets it, and see how many people it reaches and what it costs before anything is sent."
        />
      </Card>
      <div className="mt-6 space-y-3">
        <ComingSoon icon="rupee" title="Cost before you send" body="Meta's charge and our fee shown as separate lines, with a test send to your own number first." />
        <ComingSoon icon="checks" title="Results that matter" body="Delivered, read, replied and paid, not just how many were sent." />
        <ComingSoon icon="link" title="Bring in enquiries" body="A WhatsApp link and QR for your shop, Instagram and website, so you can see where each customer came from." />
      </div>
    </Page>
  );
}
