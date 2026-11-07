// Sample data for local UI preview (NEXT_PUBLIC_DEMO_MODE=true, dev only).
// A fictional business with the mess real owners see: Tamil + English in one
// message, voice notes, payment screenshots, phone-app replies.
import type { Business, ConversationWithLastMessage, Message } from "@/lib/types";

export const DEMO_MODE =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" && process.env.NODE_ENV !== "production";

const MIN = 60 * 1000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const isoAhead = (msAhead: number) => new Date(Date.now() + msAhead).toISOString();

const RECEIPT_SVG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320" viewBox="0 0 240 320"><rect width="240" height="320" fill="#f4f6f8"/><rect x="16" y="24" width="208" height="272" rx="12" fill="#fff" stroke="#dde2e7"/><circle cx="120" cy="80" r="22" fill="#2e7d32"/><path d="M109 80l8 8 15-16" stroke="#fff" stroke-width="4" fill="none"/><text x="120" y="135" font-family="sans-serif" font-size="13" text-anchor="middle" fill="#5e5a52">Paid to Anu Bridal Studio</text><text x="120" y="170" font-family="sans-serif" font-size="28" font-weight="700" text-anchor="middle" fill="#1f1d1a">₹5,000</text><text x="120" y="210" font-family="monospace" font-size="11" text-anchor="middle" fill="#5e5a52">UPI Ref 412345678901</text><text x="120" y="232" font-family="sans-serif" font-size="11" text-anchor="middle" fill="#5e5a52">1 Nov 2026, 10:42 am</text></svg>`
  );

export const demoBusiness: Business = {
  id: "demo-business",
  name: "Anu Bridal Studio",
  phone_number_id: "demo",
  whatsapp_number: "919876500000",
  access_token: "",
  openrouter_api_key: null,
  ai_model: "demo",
  system_prompt: null,
  welcome_message: null,
  plan: "pro",
  is_active: true,
  qr_image_url: RECEIPT_SVG,
  onboarding_type: "coexistence",
  coexistence_enabled: true,
  media_ai_enabled: true,
  handoff_minutes: 60,
  created_at: iso(90 * 24 * 60 * MIN),
};

type Seed = {
  id: string;
  name: string | null;
  phone: string;
  mode: "agent" | "human";
  payment_status?: ConversationWithLastMessage["payment_status"];
  payment_qr_sent?: boolean;
  tags?: string[];
  note?: string;
  createdAgo: number;
  pausedFor?: number;
  messages: Array<Omit<Message, "id" | "conversation_id" | "media_url" | "media_type" | "is_payment_screenshot" | "whatsapp_msg_id" | "created_at"> & {
    ago: number;
    media_url?: string | null;
    media_type?: Message["media_type"];
    is_payment_screenshot?: boolean;
  }>;
};

const SEEDS: Seed[] = [
  {
    id: "c-priya",
    name: "Priya Raman",
    phone: "919840112233",
    mode: "human",
    tags: ["Bridal", "Feb wedding"],
    createdAgo: 3 * 60 * MIN,
    messages: [
      { role: "user", source: "customer", content: "Hi, bridal makeup package price enna? Feb 14 ku date available ah?", ago: 60 * MIN },
      { role: "assistant", source: "ai", content: "Vanakkam Priya! Our bridal packages start at ₹18,000 (HD makeup + hairstyle + draping). Feb 14 is a popular date — I'll check with the team and confirm the slot for you.", ago: 59 * MIN },
      { role: "user", source: "customer", content: "Airbrush ku evlo? And can I talk to someone directly please, mom wants to ask about the trial", ago: 26 * MIN },
      { role: "assistant", source: "ai", content: "Sure! I've asked the studio team to reply to you here shortly.", ago: 25 * MIN },
    ],
  },
  {
    id: "c-karthik",
    name: "Karthik S",
    phone: "919566778899",
    mode: "agent",
    payment_status: "pending",
    payment_qr_sent: true,
    tags: ["Advance"],
    createdAgo: 26 * 60 * MIN,
    messages: [
      { role: "user", source: "customer", content: "Booking confirm panna advance evlo?", ago: 50 * MIN },
      { role: "assistant", source: "ai", content: "The advance is ₹5,000 to block your date. I'm sending our UPI QR now.", ago: 49 * MIN },
      { role: "assistant", source: "dashboard", content: "[image]", media_type: "image", media_url: RECEIPT_SVG, ago: 48 * MIN },
      {
        role: "user",
        source: "customer",
        content: "[image]",
        media_type: "image",
        media_url: RECEIPT_SVG,
        is_payment_screenshot: true,
        ago: 12 * MIN,
        media_analysis: {
          category: "payment_screenshot",
          description: "UPI payment confirmation screen",
          extracted_text: null,
          payment: { amount: "5000", currency: "INR", transaction_id: "412345678901", status: "success", date: "1 Nov 2026", payee: "Anu Bridal Studio" },
          confidence: "high",
          needs_human: true,
        },
      },
      { role: "user", source: "customer", content: "Paid sir 🙏 please confirm", ago: 11 * MIN },
    ],
  },
  {
    id: "c-meena",
    name: "Meena Krishnan",
    phone: "919444556677",
    mode: "agent",
    pausedFor: 42 * MIN,
    tags: ["Trial"],
    createdAgo: 2 * 24 * 60 * MIN,
    messages: [
      {
        role: "user",
        source: "customer",
        content: "[audio]",
        media_type: "audio",
        ago: 30 * MIN,
        transcript: "வணக்கம், நாளைக்கு trial makeup க்கு slot இருக்கா? Evening 4 மணிக்கு வரலாமா?",
        media_analysis: {
          transcript: "வணக்கம், நாளைக்கு trial makeup க்கு slot இருக்கா? Evening 4 மணிக்கு வரலாமா?",
          language: "ta",
          intent: "booking",
          sentiment: "positive",
          urgency: "normal",
          summary: "Wants a trial makeup slot tomorrow at 4 pm.",
          needs_human: false,
        },
      },
      { role: "assistant", source: "business_app", content: "Meena, 4 pm ok. Address send panren", ago: 18 * MIN },
      { role: "user", source: "customer", content: "Thank you! Parking iruka?", ago: 6 * MIN },
    ],
  },
  {
    id: "c-new",
    name: null,
    phone: "918072334455",
    mode: "agent",
    createdAgo: 40 * MIN,
    tags: ["Instagram ad"],
    messages: [
      { role: "user", source: "customer", content: "Hi, saw your Instagram ad. Saree draping alone panuveengala?", ago: 40 * MIN },
      { role: "assistant", source: "ai", content: "Yes! Saree draping alone is ₹1,500, and pre-pleating is ₹500 extra. Would you like to book a time?", ago: 39 * MIN },
    ],
  },
  {
    id: "c-rahul",
    name: "Rahul Verma",
    phone: "919900112244",
    mode: "agent",
    payment_qr_sent: true,
    createdAgo: 5 * 60 * MIN,
    messages: [
      { role: "user", source: "customer", content: "I'd like to book the engagement look for 22 Nov", ago: 3 * 60 * MIN },
      { role: "assistant", source: "ai", content: "Lovely! 22 Nov is open. Please pay the ₹3,000 advance using this QR to confirm.", ago: 3 * 60 * MIN - MIN },
      { role: "assistant", source: "ai", content: "[image]", media_type: "image", media_url: RECEIPT_SVG, ago: 3 * 60 * MIN - 2 * MIN },
    ],
  },
  {
    id: "c-divya",
    name: "Divya",
    phone: "919787001122",
    mode: "agent",
    createdAgo: 6 * 24 * 60 * MIN,
    messages: [
      { role: "user", source: "customer", content: "Reception ku hairstyle mattum venum, price?", ago: 4 * 60 * MIN },
      { role: "assistant", source: "ai", content: "Reception hairstyle alone is ₹2,500, including accessories setting. Shall I note a date for you?", ago: 4 * 60 * MIN - MIN },
    ],
  },
  {
    id: "c-arjun",
    name: "Arjun Prakash",
    phone: "919600998877",
    mode: "human",
    note: "Groom package. Prefers calls after 7 pm.",
    createdAgo: 3 * 24 * 60 * MIN,
    messages: [
      { role: "user", source: "customer", content: "Groom makeup um pannuveengala?", ago: 26 * 60 * MIN },
      { role: "assistant", source: "dashboard", content: "Yes Arjun, groom package is ₹6,000. I'll call you this evening.", ago: 25 * 60 * MIN },
    ],
  },
  {
    id: "c-lakshmi",
    name: "Lakshmi Narayanan",
    phone: "919884455667",
    mode: "agent",
    payment_status: "verified",
    tags: ["Bridal", "Paid"],
    createdAgo: 12 * 24 * 60 * MIN,
    messages: [
      { role: "user", source: "customer", content: "Payment done for the muhurtham booking", ago: 3 * 24 * 60 * MIN },
      { role: "assistant", source: "dashboard", content: "Received, thank you Lakshmi! Your date is confirmed.", ago: 3 * 24 * 60 * MIN - 5 * MIN },
    ],
  },
];

export function buildDemo(): { conversations: ConversationWithLastMessage[]; messages: Record<string, Message[]> } {
  const messages: Record<string, Message[]> = {};
  const conversations = SEEDS.map((s) => {
    const msgs: Message[] = s.messages.map((m, i) => ({
      id: `${s.id}-m${i}`,
      conversation_id: s.id,
      role: m.role,
      content: m.content,
      source: m.source,
      transcript: m.transcript ?? null,
      media_analysis: m.media_analysis ?? null,
      media_url: m.media_url ?? null,
      media_type: m.media_type ?? null,
      is_payment_screenshot: m.is_payment_screenshot ?? false,
      whatsapp_msg_id: null,
      created_at: iso(m.ago),
    }));
    messages[s.id] = msgs;
    const last = msgs[msgs.length - 1];
    const lastInbound = [...msgs].reverse().find((m) => m.role === "user");
    return {
      id: s.id,
      business_id: demoBusiness.id,
      phone: s.phone,
      name: s.name,
      mode: s.mode,
      assigned_to: null,
      tags: s.tags ?? [],
      payment_status: s.payment_status ?? "none",
      internal_note: s.note ?? null,
      updated_at: last.created_at,
      created_at: iso(s.createdAgo),
      msg_count_hour: 2,
      msg_count_day: msgs.length,
      msg_count_month: msgs.length + 6,
      hour_reset_at: iso(0),
      day_reset_at: iso(0),
      month_reset_at: iso(0),
      is_first_message: false,
      payment_qr_sent: s.payment_qr_sent ?? false,
      ai_paused_until: s.pausedFor ? isoAhead(s.pausedFor) : null,
      last_message: last.content,
      last_message_type: last.media_type,
      last_message_role: last.role,
      last_message_source: last.source,
      last_message_date: last.created_at,
      last_inbound_at: lastInbound?.created_at ?? null,
    } satisfies ConversationWithLastMessage;
  });
  return { conversations, messages };
}
