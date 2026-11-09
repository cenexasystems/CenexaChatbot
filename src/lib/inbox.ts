// Pure helpers for the ChatFlow 2.0 inbox. No React, no fetches.
import type { ConversationWithLastMessage, Message } from "@/lib/types";

export type Sender = "customer" | "ai" | "team" | "phone" | "history";

/** Who sent a message. Falls back to `role` when the `source` column is empty. */
export function senderOf(msg: Pick<Message, "role" | "source">): Sender {
  switch (msg.source) {
    case "customer":
      return "customer";
    case "ai":
      return "ai";
    case "dashboard":
    case "template":
      return "team";
    case "business_app":
      return "phone";
    case "history":
      return msg.role === "user" ? "customer" : "history";
    default:
      return msg.role === "user" ? "customer" : "ai";
  }
}

export function aiPausedUntil(c: Pick<ConversationWithLastMessage, "ai_paused_until">, now = Date.now()): Date | null {
  if (!c.ai_paused_until) return null;
  const d = new Date(c.ai_paused_until);
  return d.getTime() > now ? d : null;
}

/** A person must reply: the customer spoke last and the AI won't answer, or
 *  the AI handed the chat over ("I've asked the team…") and nobody has replied. */
export function isWaitingForYou(c: ConversationWithLastMessage, now = Date.now()): boolean {
  if (c.last_message_role === "user") return c.mode === "human" || aiPausedUntil(c, now) !== null;
  return c.mode === "human" && c.last_message_source === "ai";
}

export function isMoneyToConfirm(c: ConversationWithLastMessage): boolean {
  return c.payment_status === "pending";
}

export function isWaitingForPayment(c: ConversationWithLastMessage): boolean {
  return c.payment_qr_sent && (c.payment_status === "none" || !c.payment_status);
}

export function isAiHandling(c: ConversationWithLastMessage, now = Date.now()): boolean {
  return c.mode === "agent" && aiPausedUntil(c, now) === null;
}

export function needsYou(c: ConversationWithLastMessage, now = Date.now()): boolean {
  return isWaitingForYou(c, now) || isMoneyToConfirm(c);
}

export function isNewToday(c: ConversationWithLastMessage, now = Date.now()): boolean {
  return new Date(c.created_at).toDateString() === new Date(now).toDateString();
}

export const FILTERS = ["all", "needs-you", "ai", "money", "waiting-payment"] as const;
export type InboxFilter = (typeof FILTERS)[number];

export function parseFilter(v: string | null | undefined): InboxFilter {
  return (FILTERS as readonly string[]).includes(v ?? "") ? (v as InboxFilter) : "all";
}

export function matchesFilter(c: ConversationWithLastMessage, f: InboxFilter, now = Date.now()): boolean {
  switch (f) {
    case "needs-you":
      return needsYou(c, now);
    case "ai":
      return isAiHandling(c, now);
    case "money":
      return isMoneyToConfirm(c);
    case "waiting-payment":
      return isWaitingForPayment(c);
    default:
      return true;
  }
}

/** Urgency score for sorting: needs-you first, oldest wait first within that. */
export function urgency(c: ConversationWithLastMessage, now = Date.now()): number {
  if (isMoneyToConfirm(c)) return 3;
  if (isWaitingForYou(c, now)) return 2;
  return 0;
}

export function sortByUrgency(list: ConversationWithLastMessage[], now = Date.now()) {
  return [...list].sort((a, b) => {
    const u = urgency(b, now) - urgency(a, now);
    if (u !== 0) return u;
    const ta = new Date(a.updated_at).getTime();
    const tb = new Date(b.updated_at).getTime();
    // Urgent chats: longest-waiting first. Others: newest first.
    return urgency(a, now) > 0 ? ta - tb : tb - ta;
  });
}

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Milliseconds left in Meta's 24-hour customer-service window, or null if closed/unknown. */
export function windowLeftMs(lastInboundAt: string | null | undefined, now = Date.now()): number | null {
  if (!lastInboundAt) return null;
  const left = new Date(lastInboundAt).getTime() + WINDOW_MS - now;
  return left > 0 ? left : null;
}

export function formatDuration(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m && h < 10 ? `${h} h ${m} min` : `${h} h`;
}

export function timeAgo(dateStr: string, now = Date.now()): string {
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function formatClock(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function formatDayLabel(dateStr: string, now = Date.now()): string {
  const d = new Date(dateStr);
  const today = new Date(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Rupees with Indian (lakh) grouping. */
export function formatRupees(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

export function initials(name: string | null, phone: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return phone.slice(-2);
}

/** "+91 98765 43210" style formatting for Indian numbers; others unchanged. */
export function formatPhone(phone: string): string {
  const p = phone.replace(/\D/g, "");
  if (p.length === 12 && p.startsWith("91")) return `+91 ${p.slice(2, 7)} ${p.slice(7)}`;
  return phone.startsWith("+") ? phone : `+${p}`;
}

export function previewText(c: Pick<ConversationWithLastMessage, "last_message" | "last_message_type">): string {
  switch (c.last_message_type) {
    case "image":
      return "Photo";
    case "audio":
      return "Voice note";
    case "document":
      return "Document";
    case "video":
      return "Video";
    default:
      return c.last_message ?? "";
  }
}
