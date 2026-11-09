"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDashboard } from "../DashboardProvider";
import { Avatar, EmptyState, FilterTabs, Status, cx } from "../ui";
import { Icon } from "../icons";
import {
  FILTERS,
  aiPausedUntil,
  isMoneyToConfirm,
  isWaitingForPayment,
  isWaitingForYou,
  matchesFilter,
  needsYou,
  parseFilter,
  previewText,
  sortByUrgency,
  timeAgo,
  windowLeftMs,
  formatDuration,
  formatPhone,
  type InboxFilter,
} from "@/lib/inbox";
import type { ConversationWithLastMessage } from "@/lib/types";

const EMPTY: Record<InboxFilter, { title: string; body: string }> = {
  all: { title: "No conversations", body: "Chats appear here when customers message your WhatsApp number." },
  "needs-you": { title: "Queue is clear", body: "No customer is waiting on a person right now." },
  ai: { title: "No AI chats", body: "Chats the AI is answering will be listed here." },
  money: { title: "Nothing to verify", body: "Payment screenshots from customers will be listed here." },
  "waiting-payment": { title: "No pending payments", body: "Chats where a payment QR was sent will be listed here." },
};

export function ConversationList({ selectedId }: { selectedId: string | null }) {
  const { conversations, now, t, userId } = useDashboard();
  const router = useRouter();
  const params = useSearchParams();
  const filter = parseFilter(params.get("filter"));
  const mine = params.get("mine") === "1";
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Partial<Record<InboxFilter, number>> = {};
    for (const f of FILTERS) c[f] = conversations.filter((x) => matchesFilter(x, f, now)).length;
    return c;
  }, [conversations, now]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = conversations.filter((c) => matchesFilter(c, filter, now));
    if (mine && userId) out = out.filter((c) => c.assigned_to === userId);
    if (q) {
      const digits = q.replace(/\D/g, "");
      out = out.filter(
        (c) => c.name?.toLowerCase().includes(q) || (digits && c.phone.includes(digits)) || c.last_message?.toLowerCase().includes(q) || c.tags?.some((tg) => tg.toLowerCase().includes(q))
      );
    }
    return filter === "needs-you" || filter === "money"
      ? sortByUrgency(out, now)
      : [...out].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [conversations, filter, query, now, mine, userId]);

  const qs = `${filter === "all" ? "" : `?filter=${filter}`}${mine ? `${filter === "all" ? "?" : "&"}mine=1` : ""}`;

  return (
    <div className="h-full flex flex-col bg-surface">
      <div className="shrink-0 px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between">
          <h1 className="heading text-[20px] leading-tight">{t("nav.inbox")}</h1>
          <span className="eyebrow tabular">{conversations.length} chats</span>
        </div>
        <label className="mt-3 flex items-center gap-2 h-10 px-3 rounded-[10px] border border-line-strong bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15 transition">
          <Icon name="search" size={16} className="text-ink-faint shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, number, tag"
            className="flex-1 min-w-0 bg-transparent text-[13px] placeholder:text-ink-faint focus:outline-none"
            aria-label="Search chats"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-ink-faint hover:text-ink" aria-label="Clear search">
              <Icon name="close" size={14} />
            </button>
          )}
        </label>
      </div>

      <FilterTabs
        label="Filter chats"
        active={filter}
        hrefFor={(f) => (f === "all" ? `/inbox${mine ? "?mine=1" : ""}` : `/inbox?filter=${f}${mine ? "&mine=1" : ""}`)}
        items={FILTERS.map((f) => ({ id: f, label: t(`filter.${f}`), count: f === "needs-you" || f === "money" ? counts[f] : undefined }))}
      />

      {userId && <div className="px-4 pt-2"><button type="button" aria-pressed={mine} onClick={() => router.push(`/inbox${filter === "all" ? "" : `?filter=${filter}`}${mine ? "" : `${filter === "all" ? "?" : "&"}mine=1`}`)} className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${mine ? "border-brand bg-brand text-white" : "border-line text-ink-soft hover:bg-canvas"}`}>Mine</button></div>}

      <div className="flex-1 overflow-y-auto">
        {list.length === 0 ? (
          query ? (
            <EmptyState icon="search" title="No matches" body={`Nothing matches "${query}".`} />
          ) : (
            <EmptyState icon={filter === "money" ? "rupee" : "inbox"} {...EMPTY[filter]} />
          )
        ) : (
          <ul className="divide-y divide-line">
            {list.map((c) => (
              <li key={c.id}>
                <Row convo={c} selected={c.id === selectedId} href={`/inbox/${c.id}${qs}`} now={now} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function rowStatus(c: ConversationWithLastMessage, now: number) {
  if (isMoneyToConfirm(c)) return <Status tone="attention">Verify payment</Status>;
  if (isWaitingForYou(c, now)) {
    const left = windowLeftMs(c.last_inbound_at, now);
    return <Status tone="attention">Needs reply{left !== null ? ` · ${formatDuration(left)} left` : ""}</Status>;
  }
  if (aiPausedUntil(c, now)) return <Status>AI paused</Status>;
  if (isWaitingForPayment(c)) return <Status tone="info">Awaiting payment</Status>;
  if (c.payment_status === "verified") return <Status tone="success">Paid</Status>;
  if (c.mode === "human") return <Status tone="dark">Manual</Status>;
  return <Status>AI active</Status>;
}

function Row({ convo: c, selected, href, now }: { convo: ConversationWithLastMessage; selected: boolean; href: string; now: number }) {
  const sender =
    c.last_message_role === "user" ? "" : c.last_message_source === "dashboard" || c.last_message_source === "template" ? "You: " : c.last_message_source === "business_app" ? "Phone: " : "AI: ";
  const urgent = needsYou(c, now);
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cx("relative flex gap-3 pl-4 pr-3 py-3 transition-colors duration-150", selected ? "bg-accent-tint" : "hover:bg-canvas")}
    >
      {selected && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-brand" />}
      <Avatar name={c.name} phone={c.phone} size={38} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className={cx("truncate text-[13.5px]", urgent ? "font-bold" : "font-semibold")}>{c.name || formatPhone(c.phone)}</p>
          <span className={cx("text-[11px] shrink-0 tabular", urgent ? "text-attention font-bold" : "text-ink-faint")}>{timeAgo(c.updated_at, now)}</span>
        </div>
        <p className="text-[12.5px] text-ink-soft truncate mt-0.5">
          {c.last_message_type === "audio" && <Icon name="mic" size={12} className="inline -mt-0.5 mr-1" />}
          {c.last_message_type === "image" && <Icon name="image" size={12} className="inline -mt-0.5 mr-1" />}
          <span className="text-ink-faint">{sender}</span>
          {previewText(c)}
        </p>
        <div className="flex items-center justify-between gap-2 mt-1.5">
          {rowStatus(c, now)}
          {c.tags?.[0] && <span className="text-[10.5px] text-ink-faint font-medium truncate">#{c.tags[0]}</span>}
        </div>
      </div>
    </Link>
  );
}
