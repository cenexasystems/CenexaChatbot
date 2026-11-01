"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useDashboard } from "@/components/cx/DashboardProvider";
import { Page, Roadmap } from "@/components/cx/Page";
import { Avatar, Button, Chip, EmptyState, Panel, Status, Tag } from "@/components/cx/ui";
import { Icon } from "@/components/cx/icons";
import { formatDayLabel, formatPhone, timeAgo } from "@/lib/inbox";

// Written out in full so Tailwind can find the class names.
const COLS_MD = "md:grid-cols-[minmax(0,1.4fr)_150px_minmax(0,1fr)_110px_90px]";

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
    const digits = s.replace(/\D/g, "");
    return [...conversations]
      .filter((c) => !tag || c.tags?.includes(tag))
      .filter((c) => !s || c.name?.toLowerCase().includes(s) || (digits && c.phone.includes(digits)))
      // A–Z by name; contacts without a name go last.
      .sort((a, b) => (a.name ? 0 : 1) - (b.name ? 0 : 1) || (a.name ?? a.phone).localeCompare(b.name ?? b.phone));
  }, [conversations, q, tag]);

  return (
    <Page
      wide
      section="Customers"
      title="Contacts"
      subtitle={`${conversations.length} total`}
      action={<Button icon="upload" disabled title="Coming soon">Import CSV</Button>}
    >
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <label className="flex items-center gap-2 h-10 px-3 rounded-[10px] border border-line-strong bg-surface sm:w-80 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15">
          <Icon name="search" size={16} className="text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or number" className="flex-1 bg-transparent text-[13px] focus:outline-none placeholder:text-ink-faint" aria-label="Search contacts" />
        </label>
        {tags.length > 0 && (
          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
            <Chip active={!tag} onClick={() => setTag(null)}>All</Chip>
            {tags.map(([tg, n]) => (
              <Chip key={tg} active={tag === tg} onClick={() => setTag(tg === tag ? null : tg)}>
                {tg} <span className="tabular opacity-60">{n}</span>
              </Chip>
            ))}
          </div>
        )}
      </div>

      <Panel className="mt-4" title="All contacts" icon="contacts" meta={<span className="text-[11px] font-bold text-ink-faint tabular">{list.length}</span>}>
        {list.length === 0 ? (
          <EmptyState icon="contacts" title={q || tag ? "No matches" : "No contacts"} body={q || tag ? "Try another name, number or tag." : "Customers are added automatically when they message you."} />
        ) : (
          <>
            <div className={`hidden md:grid ${COLS_MD} gap-4 px-4 h-9 items-center border-b border-line bg-canvas`}>
              {["Name", "Phone", "Tags", "Payment", "Last active"].map((h) => (
                <span key={h} className="eyebrow !text-[9.5px]">{h}</span>
              ))}
            </div>
            <ul className="divide-y divide-line">
              {list.map((c) => (
                <li key={c.id}>
                  <Link href={`/inbox/${c.id}`} className={`grid grid-cols-[1fr_auto] ${COLS_MD} gap-x-4 gap-y-1 px-4 py-2.5 items-center hover:bg-canvas transition-colors`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={c.name} phone={c.phone} size={32} />
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold truncate">{c.name || "No name"}</p>
                        <p className="text-[11px] text-ink-faint">Since {formatDayLabel(c.created_at, now)}</p>
                      </div>
                    </div>
                    <span className="md:hidden text-[11.5px] text-ink-faint tabular">{timeAgo(c.updated_at, now)}</span>
                    <span className="hidden md:block text-[12.5px] font-mono text-ink-soft">{formatPhone(c.phone)}</span>
                    <div className="hidden md:flex gap-1 flex-wrap">
                      {c.tags?.length ? c.tags.slice(0, 3).map((tg) => <Tag key={tg}>{tg}</Tag>) : <span className="text-ink-faint text-[12px]">—</span>}
                    </div>
                    <span className="hidden md:block">
                      {c.payment_status === "verified" ? <Status tone="success">Paid</Status> : c.payment_status === "pending" ? <Status tone="attention">To verify</Status> : c.payment_status === "rejected" ? <Status tone="danger">Rejected</Status> : <span className="text-ink-faint text-[12px]">—</span>}
                    </span>
                    <span className="hidden md:block text-[12.5px] tabular text-ink-soft">{timeAgo(c.updated_at, now)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <Panel className="mt-5" title="Roadmap" icon="flow">
        <Roadmap
          items={[
            { icon: "upload", title: "Import contacts", body: "CSV upload, phone-app contact sync, and old broadcast lists as groups." },
            { icon: "history", title: "Customer timeline", body: "Every chat, payment and campaign for one customer on one page." },
          ]}
        />
      </Panel>
    </Page>
  );
}
