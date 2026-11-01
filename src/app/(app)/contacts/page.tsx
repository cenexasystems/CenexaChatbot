"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useDashboard } from "@/components/cx/DashboardProvider";
import { ComingSoon, Page } from "@/components/cx/Page";
import { Avatar, Badge, Card, EmptyState } from "@/components/cx/ui";
import { formatDayLabel, formatPhone, timeAgo } from "@/lib/inbox";

export default function ContactsPage() {
  const { conversations, now } = useDashboard();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);

  const tags = useMemo(() => {
    const m = new Map<string, number>();
    conversations.forEach((c) => c.tags?.forEach((tg) => m.set(tg, (m.get(tg) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [conversations]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...conversations]
      .filter((c) => !tag || c.tags?.includes(tag))
      .filter((c) => !s || c.name?.toLowerCase().includes(s) || c.phone.includes(s.replace(/\D/g, "") || s))
      .sort((a, b) => (a.name ?? "~").localeCompare(b.name ?? "~"));
  }, [conversations, q, tag]);

  return (
    <Page title="Contacts" subtitle={`${conversations.length} people have messaged you`}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name or number"
        className="w-full h-11 px-3.5 rounded-[10px] bg-surface border border-line text-[15px] placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30"
        aria-label="Search contacts"
      />
      {tags.length > 0 && (
        <div className="flex gap-2 overflow-x-auto mt-3 pb-1 [scrollbar-width:none]">
          <button onClick={() => setTag(null)} className={`h-9 px-3.5 rounded-full text-[13px] font-medium border whitespace-nowrap ${!tag ? "bg-accent text-white border-accent" : "bg-surface border-line text-ink-soft"}`}>Everyone</button>
          {tags.map(([tg, n]) => (
            <button key={tg} onClick={() => setTag(tg === tag ? null : tg)} className={`h-9 px-3.5 rounded-full text-[13px] font-medium border whitespace-nowrap ${tag === tg ? "bg-accent text-white border-accent" : "bg-surface border-line text-ink-soft"}`}>
              {tg} <span className="tabular opacity-70">{n}</span>
            </button>
          ))}
        </div>
      )}

      <Card className="mt-4 overflow-hidden">
        {list.length === 0 ? (
          <EmptyState icon="contacts" title={q || tag ? "No matches" : "No contacts yet"} body={q || tag ? "Try another name, number or tag." : "Everyone who messages your WhatsApp number is added here automatically."} />
        ) : (
          <ul>
            {list.map((c) => (
              <li key={c.id} className="border-b border-line last:border-0">
                <Link href={`/inbox/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas">
                  <Avatar name={c.name} phone={c.phone} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{c.name || "No name"}</p>
                    <p className="text-[13px] text-ink-soft tabular">{formatPhone(c.phone)}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 flex-wrap justify-end">
                    {c.payment_status === "verified" && <Badge tone="success">Paid</Badge>}
                    {c.tags?.slice(0, 2).map((tg) => <Badge key={tg}>{tg}</Badge>)}
                  </div>
                  <div className="text-right shrink-0 w-20">
                    <p className="text-[13px] text-ink-soft">{timeAgo(c.updated_at, now)}</p>
                    <p className="text-[11px] text-ink-faint">since {formatDayLabel(c.created_at, now).replace(/, \d{4}$/, "")}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-6 space-y-3">
        <ComingSoon icon="upload" title="Import contacts" body="Bring in a CSV, the contacts synced from your WhatsApp Business app, and your old broadcast lists as groups." />
        <ComingSoon icon="history" title="Customer timeline" body="One page per customer with every chat, payment and campaign they've received." />
      </div>
    </Page>
  );
}
