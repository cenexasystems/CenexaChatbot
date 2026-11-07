"use client";
import Link from "next/link";
import { useDashboard } from "@/components/cx/DashboardProvider";
import { Page } from "@/components/cx/Page";
import { Field, Panel, Status } from "@/components/cx/ui";
import { aiPausedUntil, isAiHandling } from "@/lib/inbox";
import { AssistantStudio } from "@/components/cx/AssistantStudio";

export default function AssistantPage() {
  const { conversations, now, business } = useDashboard();
  const handling = conversations.filter((c) => isAiHandling(c, now)).length;
  const off = conversations.filter((c) => c.mode === "human").length;
  const paused = conversations.filter((c) => c.mode === "agent" && aiPausedUntil(c, now)).length;

  return (
    <Page wide section="Automation" title="AI Assistant" subtitle="Status and configuration">
      <div className="grid lg:grid-cols-[1fr_1fr] gap-5">
        <Panel title="Live status" icon="bot" action={<Status tone="success">Running</Status>}>
          <div className="grid grid-cols-3 divide-x divide-line">
            <Stat n={handling} label="AI replying" href="/inbox?filter=ai" />
            <Stat n={paused} label="Paused" href="/inbox?filter=needs-you" />
            <Stat n={off} label="Manual" href="/inbox" />
          </div>
        </Panel>

        <Panel title="Configuration" icon="settings">
          <dl className="px-4 py-1">
            <Field label="Pause after phone reply">{business?.handoff_minutes !== undefined ? `${business.handoff_minutes} min` : "—"}</Field>
            <Field label="Voice notes and photos">
              {business?.media_ai_enabled === undefined ? "—" : business.media_ai_enabled ? <Status tone="success">Enabled</Status> : <Status>Off</Status>}
            </Field>
            <Field label="Phone app link (coexistence)">
              {business?.coexistence_enabled === undefined ? "—" : business.coexistence_enabled ? <Status tone="success">Enabled</Status> : <Status>Off</Status>}
            </Field>
            <Field label="Instructions">Configured in this studio</Field>
          </dl>
        </Panel>
      </div>

      <AssistantStudio />
    </Page>
  );
}

function Stat({ n, label, href }: { n: number; label: string; href: string }) {
  return (
    <Link href={href} className="px-4 py-4 hover:bg-canvas transition-colors">
      <p className="eyebrow !text-[9.5px]">{label}</p>
      <p className="text-[26px] font-semibold tabular leading-none mt-2">{n}</p>
    </Link>
  );
}
