"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Avatar, EmptyState, Panel, Spinner, Tag } from "@/components/cx/ui";
import { Page } from "@/components/cx/Page";
import { formatPhone } from "@/lib/inbox";
import { useDashboard } from "@/components/cx/DashboardProvider";

type TimelineEvent = { id: string; event_type: string; details: Record<string, unknown>; created_at: string };
type ContactData = { contact: { id: string; name: string | null; phone: string; tags: string[]; opt_in_at: string | null; opt_in_source: string | null; opt_out_at: string | null; conversation_id: string | null }; activity: TimelineEvent[]; groups: Array<{ id: string; name: string }>; messages: Array<{ id: string; role: string; source: string | null; content: string; media_type: string | null; created_at: string }> };

export default function ContactTimelinePage() {
  const params = useParams<{ id: string }>();
  const { business } = useDashboard();
  const [data, setData] = useState<ContactData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`/api/contacts/${params.id}`).then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not load contact");
      setData(result);
    }).catch((reason) => setError((reason as Error).message)).finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <div className="h-full flex items-center justify-center"><Spinner /></div>;
  if (error || !data) return <Page section="Customers" title="Customer timeline"><EmptyState icon="contacts" title="Could not load contact" body={error || "Contact not found"} action={<Link href="/contacts" className="underline">Back to contacts</Link>} /></Page>;
  const { contact } = data;
  async function scheduleReminder() {
    const value = window.prompt("Reminder date and time (local)", "");
    if (!value) return;
    const response = await fetch("/api/automations/reminders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId: contact.id, runAt: new Date(value).toISOString() }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) window.alert(result.error ?? "Could not schedule reminder");
    else window.alert("Reminder scheduled.");
  }
  const events = [
    ...data.activity.map((event) => ({ id: event.id, type: event.event_type, text: eventLabel(event.event_type, event.details), created_at: event.created_at, kind: "activity" })),
    ...data.messages.map((message) => ({ id: message.id, type: "message", text: `${message.role === "user" ? "Customer" : "Team"}: ${message.content}`, created_at: message.created_at, kind: "message" })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return <Page wide section="Customers" title={contact.name || "Customer timeline"} subtitle={formatPhone(contact.phone)} action={<div className="flex gap-2">{business?.modules_enabled?.automations && <button onClick={scheduleReminder} className="rounded-lg border border-line px-3 py-2 text-[12px] font-semibold">Schedule reminder</button>}{contact.conversation_id && <Link href={`/inbox/${contact.conversation_id}`} className="rounded-lg bg-brand px-3 py-2 text-[12px] font-semibold text-white">Open chat</Link>}</div>}>
    <div className="grid lg:grid-cols-[320px_1fr] gap-4">
      <div className="space-y-4">
        <Panel title="Contact details" icon="contacts"><div className="p-4"><div className="flex items-center gap-3"><Avatar name={contact.name} phone={contact.phone} size={44} /><div><p className="font-semibold text-[14px]">{contact.name || "No name"}</p><p className="font-mono text-[12px] text-ink-faint">{formatPhone(contact.phone)}</p></div></div><div className="mt-4 space-y-2 text-[12px]"><p><strong>Consent:</strong> {contact.opt_out_at ? "Opted out" : contact.opt_in_at ? "Opted in" : "Not recorded"}</p>{contact.opt_in_at && <p><strong>Source:</strong> {contact.opt_in_source || "Not specified"}</p>}<p><strong>Payment history:</strong> recorded from Phase 2 deployment onward.</p><p><strong>Groups:</strong> {data.groups.length ? data.groups.map((group) => group.name).join(", ") : "None"}</p><div className="flex flex-wrap gap-1">{contact.tags?.map((tag) => <Tag key={tag}>{tag}</Tag>)}</div></div></div></Panel>
        <Panel title="Recent payments" icon="rupee"><div className="p-4 text-[12px] text-ink-faint">Payment events start from the Phase 2 deployment date. See the customer timeline for recorded verifications.</div></Panel>
      </div>
      <Panel title="Customer timeline" icon="history" meta={<span className="text-[11px] text-ink-faint">Latest 200 messages and events</span>}>
        {events.length === 0 ? <EmptyState icon="history" title="No history recorded" body="Messages and customer activity will appear here." /> : <ol className="divide-y divide-line">{events.map((event) => <li key={`${event.kind}-${event.id}`} className="px-4 py-3"><p className="text-[13px] whitespace-pre-wrap break-words">{event.text}</p><time className="text-[10px] text-ink-faint">{new Date(event.created_at).toLocaleString()}</time></li>)}</ol>}
      </Panel>
    </div>
  </Page>;
}

function eventLabel(type: string, details: Record<string, unknown>) {
  if (type.startsWith("payment_")) return `Payment ${type.slice(8)}${details.amount == null ? "" : ` · ₹${Number(details.amount).toLocaleString("en-IN")}`}`;
  if (type === "mode_change") return `Reply mode changed to ${String(details.value ?? "unknown")}`;
  if (type === "note_updated") return "Internal note updated";
  if (type === "tags_updated") return "Tags updated";
  if (type === "opt_out") return "Customer opted out of WhatsApp messages";
  return type.replaceAll("_", " ");
}
