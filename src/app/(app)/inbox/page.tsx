"use client";
import { useDashboard } from "@/components/cx/DashboardProvider";
import { ButtonLink, EmptyState } from "@/components/cx/ui";
import { needsYou } from "@/lib/inbox";

// Shown beside the list on tablet and desktop when no chat is open.
export default function InboxHome() {
  const { conversations, now } = useDashboard();
  const waiting = conversations.filter((c) => needsYou(c, now)).length;
  return (
    <div className="h-full flex items-center justify-center bg-canvas">
      {waiting > 0 ? (
        <EmptyState
          icon="inbox"
          title={`${waiting} waiting for a reply`}
          body="Oldest first. Everything else is handled by the AI."
          action={<ButtonLink href="/inbox?filter=needs-you" variant="primary">Open queue</ButtonLink>}
        />
      ) : (
        <EmptyState icon="check" title="No chat selected" body="Select a conversation from the list." />
      )}
    </div>
  );
}
