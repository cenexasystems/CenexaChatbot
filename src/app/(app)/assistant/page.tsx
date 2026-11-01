"use client";
import Link from "next/link";
import { useDashboard } from "@/components/cx/DashboardProvider";
import { ComingSoon, Page } from "@/components/cx/Page";
import { Badge, Card } from "@/components/cx/ui";
import { Icon } from "@/components/cx/icons";
import { aiPausedUntil, isAiHandling } from "@/lib/inbox";

export default function AssistantPage() {
  const { conversations, now, business } = useDashboard();
  const handling = conversations.filter((c) => isAiHandling(c, now)).length;
  const off = conversations.filter((c) => c.mode === "human").length;
  const paused = conversations.filter((c) => c.mode === "agent" && aiPausedUntil(c, now)).length;

  return (
    <Page title="AI Assistant" subtitle="Teach your assistant and decide how much it does alone">
      <Card className="p-4">
        <p className="font-semibold mb-3">Right now</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat n={handling} label="AI replying" href="/inbox?filter=ai" />
          <Stat n={paused} label="Paused after your phone reply" href="/inbox?filter=needs-you" />
          <Stat n={off} label="You're replying" href="/inbox" />
        </div>
        {business?.handoff_minutes !== undefined && (
          <p className="text-[14px] text-ink-soft mt-4 flex items-center gap-2">
            <Icon name="phone" size={16} />
            When you reply from your phone, the AI waits {business.handoff_minutes} minutes before answering again.
          </p>
        )}
        {business?.media_ai_enabled !== undefined && (
          <p className="text-[14px] text-ink-soft mt-2 flex items-center gap-2">
            <Icon name="mic" size={16} />
            Voice notes and photos: {business.media_ai_enabled ? <Badge tone="success">Understood by AI</Badge> : <Badge>Off</Badge>}
          </p>
        )}
      </Card>

      <div className="mt-6 space-y-3">
        <ComingSoon icon="note" title="Instructions in your words" body="Write how the AI should talk, what you sell and your timings. No scripts, no waiting for us." />
        <ComingSoon icon="file" title="Knowledge" body="Add your price list, menu or brochure. The AI answers from it and shows where each answer came from." />
        <ComingSoon icon="assistant" title="Test chat" body="Try questions before customers do, in Tamil, English or both." />
        <ComingSoon icon="user" title="When to hand over to you" body="Choose when the AI stops and alerts you: a request for a person, an angry customer, a large order." />
      </div>
    </Page>
  );
}

function Stat({ n, label, href }: { n: number; label: string; href: string }) {
  return (
    <Link href={href} className="bg-sunken rounded-[10px] p-3 hover:bg-line transition-colors">
      <p className="text-[24px] font-semibold tabular leading-none">{n}</p>
      <p className="text-[12px] text-ink-soft mt-1.5 leading-snug">{label}</p>
    </Link>
  );
}
