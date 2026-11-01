"use client";
import Link from "next/link";
import { useDashboard } from "@/components/cx/DashboardProvider";
import { EmptyState } from "@/components/cx/ui";
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
          title={`${waiting} ${waiting === 1 ? "person is" : "people are"} waiting for you`}
          body="Start with the oldest. The AI is handling everyone else."
          action={<Link href="/inbox?filter=needs-you" className="inline-flex items-center h-11 px-4 rounded-[10px] bg-accent text-white font-medium hover:bg-accent-hover">Show who needs you</Link>}
        />
      ) : (
        <EmptyState icon="check" title="You're all caught up" body="Pick a chat on the left to read it. New messages appear here as they arrive." />
      )}
    </div>
  );
}
