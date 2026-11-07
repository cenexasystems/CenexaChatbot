"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useDashboard } from "@/components/cx/DashboardProvider";
import { Page } from "@/components/cx/Page";
import { Avatar, ButtonLink, EmptyState, Panel, StatTile, Status, WindowTimer } from "@/components/cx/ui";
import { Icon } from "@/components/cx/icons";
import {
  aiPausedUntil,
  isAiHandling,
  isMoneyToConfirm,
  isNewToday,
  isWaitingForYou,
  needsYou,
  previewText,
  sortByUrgency,
  timeAgo,
  windowLeftMs,
  formatPhone,
} from "@/lib/inbox";
import type { StringKey } from "@/lib/i18n";

export default function TodayPage() {
  const { conversations, now, t, business, lang } = useDashboard();

  const stats = useMemo(
    () => ({
      waiting: conversations.filter((c) => isWaitingForYou(c, now)).length,
      money: conversations.filter(isMoneyToConfirm).length,
      ai: conversations.filter((c) => isAiHandling(c, now)).length,
      leads: conversations.filter((c) => isNewToday(c, now)).length,
    }),
    [conversations, now]
  );

  const queue = useMemo(() => sortByUrgency(conversations.filter((c) => needsYou(c, now)), now), [conversations, now]);

  const hour = new Date(now).getHours();
  const greetKey: StringKey = hour < 12 ? "today.greeting.morning" : hour < 17 ? "today.greeting.afternoon" : "today.greeting.evening";
  const dateLabel = new Date(now).toLocaleDateString(lang === "ta" ? "ta-IN" : "en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <Page
      wide
      section={dateLabel}
      title={t(greetKey)}
      subtitle={business?.name}
      action={<ButtonLink href="/inbox?filter=needs-you" variant="primary" icon="inbox">Open queue</ButtonLink>}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label={t("today.waiting")} value={stats.waiting} sub="Awaiting your reply" href="/inbox?filter=needs-you" icon="user" tone={stats.waiting ? "attention" : "neutral"} />
        <StatTile label={t("today.money")} value={stats.money} sub="Screenshots to verify" href="/inbox?filter=money" icon="rupee" tone={stats.money ? "attention" : "neutral"} />
        <StatTile label={t("today.ai")} value={stats.ai} sub="Replying automatically" href="/inbox?filter=ai" icon="bot" />
        <StatTile label={t("today.leads")} value={stats.leads} sub="First message today" href="/inbox" icon="plus" />
      </div>

      <Panel
        className="mt-5"
        title="Reply queue" icon="inbox"
        meta={queue.length > 0 && <span className="text-[11px] font-bold text-ink-faint tabular">{queue.length}</span>}
        action={queue.length > 0 && <Link href="/inbox?filter=needs-you" className="text-[12px] font-semibold text-ink hover:underline underline-offset-2">View all</Link>}
      >
        {queue.length === 0 ? (
          <EmptyState icon="check" title="Queue is clear" body="No customer is waiting on a person. The AI is handling every open chat." />
        ) : (
          <>
            {/* Column headings (desktop) */}
            <div className="hidden md:grid grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_150px_90px_120px_24px] gap-4 px-4 h-9 items-center border-b border-line bg-canvas">
              {["Customer", "Last message", "Status", "Waiting", "Reply window", ""].map((h) => (
                <span key={h} className="eyebrow !text-[9.5px]">{h}</span>
              ))}
            </div>
            <ul className="divide-y divide-line">
              {queue.slice(0, 8).map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/inbox/${c.id}?filter=needs-you`}
                    className="grid grid-cols-[1fr_auto] md:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_150px_90px_120px_24px] gap-x-4 gap-y-1 px-4 py-3 items-center hover:bg-canvas transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={c.name} phone={c.phone} size={32} />
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold truncate">{c.name || formatPhone(c.phone)}</p>
                        <p className="text-[11.5px] text-ink-faint font-mono truncate">{formatPhone(c.phone)}</p>
                      </div>
                    </div>
                    <span className="md:hidden text-[12px] text-ink-faint tabular">{timeAgo(c.updated_at, now)}</span>
                    <p className="col-span-2 md:col-span-1 text-[13px] text-ink-soft truncate">{previewText(c)}</p>
                    <div className="col-span-2 md:col-span-1">
                      {isMoneyToConfirm(c) ? (
                        <Status tone="attention">Verify payment</Status>
                      ) : aiPausedUntil(c, now) ? (
                        <Status tone="attention">AI paused</Status>
                      ) : (
                        <Status tone="attention">Needs reply</Status>
                      )}
                    </div>
                    <span className="hidden md:block text-[13px] tabular text-ink">{timeAgo(c.updated_at, now)}</span>
                    <span className="hidden md:block"><WindowTimer msLeft={windowLeftMs(c.last_inbound_at, now)} /></span>
                    <Icon name="chevron" size={16} className="hidden md:block text-ink-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      {conversations.length === 0 && (
        <Panel className="mt-5" title="Setup" icon="check">
          <ul className="divide-y divide-line text-[13px]">
            <li className="flex items-center gap-3 px-4 py-3"><Status tone="success">Done</Status> WhatsApp number connected</li>
            <li className="flex items-center gap-3 px-4 py-3"><Status>To do</Status> Share your WhatsApp link or QR with customers</li>
            <li className="flex items-center gap-3 px-4 py-3"><Status>To do</Status> Add your prices and timings for the AI</li>
          </ul>
        </Panel>
      )}
    </Page>
  );
}
