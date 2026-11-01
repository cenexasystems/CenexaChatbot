"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useDashboard } from "@/components/cx/DashboardProvider";
import { Page } from "@/components/cx/Page";
import { Avatar, Badge, Card, EmptyState, WindowTimer, cx } from "@/components/cx/ui";
import { Icon, type IconName } from "@/components/cx/icons";
import {
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

  const nextUp = useMemo(() => sortByUrgency(conversations.filter((c) => needsYou(c, now)), now).slice(0, 5), [conversations, now]);

  const hour = new Date(now).getHours();
  const greetKey: StringKey = hour < 12 ? "today.greeting.morning" : hour < 17 ? "today.greeting.afternoon" : "today.greeting.evening";
  const dateLabel = new Date(now).toLocaleDateString(lang === "ta" ? "ta-IN" : "en-IN", { weekday: "long", day: "numeric", month: "long" });

  const cards: { key: StringKey; n: number; href: string; icon: IconName; urgent?: boolean; hint: string }[] = [
    { key: "today.waiting", n: stats.waiting, href: "/inbox?filter=needs-you", icon: "user", urgent: stats.waiting > 0, hint: "Customers whose last message has no reply yet" },
    { key: "today.money", n: stats.money, href: "/inbox?filter=money", icon: "rupee", urgent: stats.money > 0, hint: "Payment screenshots to check" },
    { key: "today.ai", n: stats.ai, href: "/inbox?filter=ai", icon: "bot", hint: "Chats the AI is answering for you" },
    { key: "today.leads", n: stats.leads, href: "/inbox", icon: "plus", hint: "People who messaged you for the first time today" },
  ];

  return (
    <Page title={t(greetKey)} subtitle={business?.name ? `${business.name} · ${dateLabel}` : dateLabel}>
      {/* Counts: each opens the list behind it */}
      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <Link
            key={c.key}
            href={c.href}
            title={c.hint}
            className={cx(
              "rounded-[12px] border p-4 flex flex-col gap-3 min-h-[116px] transition-colors duration-150",
              c.urgent ? "bg-attention-tint border-transparent hover:border-attention/30" : "bg-surface border-line hover:bg-sunken"
            )}
          >
            <span className={cx("w-9 h-9 rounded-full flex items-center justify-center", c.urgent ? "bg-surface text-attention" : "bg-sunken text-ink-soft")}>
              <Icon name={c.icon} size={18} />
            </span>
            <div>
              <p className={cx("text-[30px] font-semibold leading-none tabular", c.urgent && "text-attention")}>{c.n}</p>
              <p className="text-[14px] text-ink-soft mt-1.5 leading-snug">{t(c.key)}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Next up */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-[17px] font-semibold">Reply next</h2>
          {nextUp.length > 0 && (
            <Link href="/inbox?filter=needs-you" className="text-[14px] text-accent font-medium">See all</Link>
          )}
        </div>
        {nextUp.length === 0 ? (
          <Card>
            <EmptyState icon="check" title="Nobody is waiting" body="The AI is answering your customers. You'll see someone here when they ask for a person or send a payment." />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul>
              {nextUp.map((c) => (
                <li key={c.id} className="border-b border-line last:border-0">
                  <Link href={`/inbox/${c.id}?filter=needs-you`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
                    <Avatar name={c.name} phone={c.phone} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{c.name || formatPhone(c.phone)}</p>
                        <span className="text-[12px] text-ink-faint shrink-0">{timeAgo(c.updated_at, now)}</span>
                      </div>
                      <p className="text-[14px] text-ink-soft truncate">{previewText(c)}</p>
                    </div>
                    <div className="hidden sm:flex shrink-0">
                      {isMoneyToConfirm(c) ? (
                        <Badge tone="attention" icon="rupee">Check payment</Badge>
                      ) : (
                        <WindowTimer msLeft={windowLeftMs(c.last_inbound_at, now)} compact />
                      )}
                    </div>
                    <Icon name="chevron" size={18} className="text-ink-faint shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {/* First-run guidance */}
      {conversations.length === 0 && (
        <section className="mt-8">
          <h2 className="text-[17px] font-semibold mb-3">Get set up</h2>
          <Card className="p-4 space-y-3 text-[15px]">
            <p className="flex items-center gap-2"><Icon name="check" size={18} className="text-success" /> WhatsApp number connected</p>
            <p className="flex items-center gap-2 text-ink-soft"><Icon name="qr" size={18} /> Share your WhatsApp link or QR so customers can reach you</p>
            <p className="flex items-center gap-2 text-ink-soft"><Icon name="assistant" size={18} /> Tell the AI about your prices and timings</p>
          </Card>
        </section>
      )}
    </Page>
  );
}
