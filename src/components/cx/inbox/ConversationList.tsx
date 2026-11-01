"use client";
import Link from "next/link";
import { useMemo, useRef, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useDashboard } from "../DashboardProvider";
import { Avatar, Badge, Chip, EmptyState, IconButton, WindowTimer, cx } from "../ui";
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
  formatPhone,
  type InboxFilter,
} from "@/lib/inbox";
import type { ConversationWithLastMessage } from "@/lib/types";

const EMPTY: Record<InboxFilter, { title: string; body: string }> = {
  all: { title: "No chats yet", body: "When customers message your WhatsApp number, their chats appear here." },
  "needs-you": { title: "You're all caught up", body: "Nobody is waiting for a reply. The AI is handling the rest." },
  ai: { title: "The AI isn't handling any chats", body: "Chats where the AI replies for you will show here." },
  money: { title: "No payments to confirm", body: "When a customer sends a payment screenshot, it shows here for you to check." },
  "waiting-payment": { title: "Nobody owes a payment", body: "Chats where you've sent a payment QR and are waiting to be paid show here." },
};

export function ConversationList({ selectedId }: { selectedId: string | null }) {
  const { conversations, now, t, business } = useDashboard();
  const params = useSearchParams();
  const filter = parseFilter(params.get("filter"));
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searching) searchRef.current?.focus();
  }, [searching]);

  const counts = useMemo(() => {
    const c: Partial<Record<InboxFilter, number>> = {};
    for (const f of FILTERS) c[f] = conversations.filter((x) => matchesFilter(x, f, now)).length;
    return c;
  }, [conversations, now]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = conversations.filter((c) => matchesFilter(c, filter, now));
    if (q) {
      out = out.filter(
        (c) => c.name?.toLowerCase().includes(q) || c.phone.includes(q.replace(/\D/g, "") || q) || c.last_message?.toLowerCase().includes(q) || c.tags?.some((tg) => tg.toLowerCase().includes(q))
      );
    }
    return filter === "needs-you" || filter === "money"
      ? sortByUrgency(out, now)
      : [...out].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [conversations, filter, query, now]);

  const qs = filter === "all" ? "" : `?filter=${filter}`;

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="shrink-0 px-4 pt-3 pb-2">
        {searching ? (
          <div className="flex items-center gap-1 h-11">
            <IconButton icon="back" label="Close search" onClick={() => { setSearching(false); setQuery(""); }} className="-ml-2" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, number, tag or message"
              className="flex-1 h-11 px-3 rounded-[10px] bg-sunken text-[15px] placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30"
              aria-label="Search chats"
            />
          </div>
        ) : (
          <div className="flex items-center justify-between h-11">
            <div className="min-w-0">
              <h1 className="text-[20px] font-semibold leading-tight">{t("nav.inbox")}</h1>
              <p className="text-[13px] text-ink-soft truncate">{business?.name}</p>
            </div>
            <IconButton icon="search" label="Search chats" onClick={() => setSearching(true)} className="-mr-2" />
          </div>
        )}
      </div>

      {/* Filter chips */}
      <div className="shrink-0 flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]" role="toolbar" aria-label="Filter chats">
        {FILTERS.map((f) => (
          <Chip key={f} href={f === "all" ? "/inbox" : `/inbox?filter=${f}`} active={filter === f} count={f === "needs-you" || f === "money" ? counts[f] : undefined}>
            {t(`filter.${f}`)}
          </Chip>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto border-t border-line">
        {list.length === 0 ? (
          query ? (
            <EmptyState icon="search" title="No matches" body={`Nothing matches "${query}". Try a name, the last digits of a number, or a tag.`} />
          ) : (
            <EmptyState icon={filter === "money" ? "rupee" : "inbox"} {...EMPTY[filter]} />
          )
        ) : (
          <ul>
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

function Row({ convo: c, selected, href, now }: { convo: ConversationWithLastMessage; selected: boolean; href: string; now: number }) {
  const paused = aiPausedUntil(c, now);
  const waiting = isWaitingForYou(c, now);
  const sender =
    c.last_message_role === "user"
      ? ""
      : c.last_message_source === "dashboard"
        ? "You: "
        : c.last_message_source === "business_app"
          ? "Phone: "
          : "AI: ";
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cx(
        "flex gap-3 px-4 py-3 border-b border-line transition-colors duration-150",
        selected ? "bg-accent-tint" : "hover:bg-canvas"
      )}
    >
      <Avatar name={c.name} phone={c.phone} size={44} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className={cx("truncate text-[15px]", needsYou(c, now) ? "font-semibold" : "font-medium")}>{c.name || formatPhone(c.phone)}</p>
          <span className={cx("text-[12px] shrink-0 tabular", waiting ? "text-attention font-semibold" : "text-ink-faint")}>{timeAgo(c.updated_at, now)}</span>
        </div>
        <p className="text-[14px] text-ink-soft truncate mt-0.5">
          {c.last_message_type === "audio" && <Icon name="mic" size={14} className="inline -mt-0.5 mr-1" />}
          {c.last_message_type === "image" && <Icon name="image" size={14} className="inline -mt-0.5 mr-1" />}
          {sender}
          {previewText(c)}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {isMoneyToConfirm(c) && <Badge tone="attention" icon="rupee" className="h-5 text-[11px] px-1.5">Payment to check</Badge>}
          {waiting && !isMoneyToConfirm(c) && <Badge tone="attention" className="h-5 text-[11px] px-1.5">Needs you</Badge>}
          {paused && <Badge tone="neutral" icon="pause" className="h-5 text-[11px] px-1.5">AI paused</Badge>}
          {!waiting && c.mode === "human" && !paused && <Badge tone="accent" icon="user" className="h-5 text-[11px] px-1.5">You reply</Badge>}
          {isWaitingForPayment(c) && <Badge tone="info" icon="clock" className="h-5 text-[11px] px-1.5">Awaiting payment</Badge>}
          {c.payment_status === "verified" && <Badge tone="success" icon="check" className="h-5 text-[11px] px-1.5">Paid</Badge>}
          {waiting && <WindowTimer msLeft={windowLeftMs(c.last_inbound_at, now)} compact />}
          {c.tags?.slice(0, 1).map((tg) => (
            <Badge key={tg} className="h-5 text-[11px] px-1.5">{tg}</Badge>
          ))}
        </div>
      </div>
    </Link>
  );
}
